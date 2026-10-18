import { App, MarkdownView, Modal, Notice, Plugin, Setting } from "obsidian";
import type { ChangeDesc } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getScope, highlightExtension, OffsetRange, onDocChange, setMatches, setScope } from "./highlight";

export default class FindReplaceInSelection extends Plugin {
	/** Where the dialog was dragged to, kept for the rest of the session. */
	dialogOffset = { x: 0, y: 0 };
	/** The open dialog. There is at most one, because each editor has one search scope. */
	dialog: FindReplaceModal | null = null;

	async onload() {
		this.registerEditorExtension(highlightExtension);

		this.addCommand({
			id: "open-dialog",
			name: "Find and replace in selection",
			editorCheckCallback: (checking, _editor, ctx) => {
				const cm = ctx instanceof MarkdownView ? editorViewOf(ctx) : null;
				if (!cm) return false;
				if (checking) return true;

				const ranges = cm.state.selection.ranges.filter((r) => !r.empty);
				if (!ranges.length) {
					new Notice("Select the text to search within first.");
					return;
				}
				// Close any open dialog first: closing clears its scope.
				this.dialog?.close();
				cm.dispatch({ effects: setScope.of(ranges.map(({ from, to }) => ({ from, to }))) });
				this.dialog = new FindReplaceModal(this.app, this, cm);
				this.dialog.open();
			},
		});
	}

	onunload() {
		this.dialog?.close();
	}
}

/** The CodeMirror editor of a Markdown view in Live Preview or Source mode. */
function editorViewOf(view: MarkdownView): EditorView | null {
	// The view's own editor comes before any nested ones (e.g. in tables) in document order.
	const el = view.contentEl.querySelector<HTMLElement>(".cm-editor");
	return el ? EditorView.findFromDOM(el) : null;
}

export class FindReplaceModal extends Modal {
	private find = "";
	private replace = "";
	private matches: OffsetRange[] = [];
	private current = -1;
	private countEl: HTMLElement;
	private isShown = false;
	private refreshQueued = false;
	private cleanups: (() => void)[] = [];

	constructor(app: App, private plugin: FindReplaceInSelection, private cm: EditorView) {
		super(app);
	}

	onOpen() {
		this.isShown = true;
		// Leave the note visible and usable behind the dialog, so the highlighted
		// matches can be seen.
		this.containerEl.addClass("frs-modal-container");
		this.titleEl.setText("Find and replace in selection");
		this.makeDraggable();
		this.cleanups.push(onDocChange(this.cm, (update) => this.onDocChange(update.changes)));

		new Setting(this.contentEl).setName("Find").addText((text) => {
			text.onChange((value) => {
				this.find = value;
				this.search();
			});
			text.inputEl.addEventListener("keydown", (e) => this.onEnter(e));
			window.setTimeout(() => text.inputEl.focus());
		});
		new Setting(this.contentEl).setName("Replace with").addText((text) => {
			text.onChange((value) => (this.replace = value));
			text.inputEl.addEventListener("keydown", (e) => this.onEnter(e));
		});

		const footer = new Setting(this.contentEl)
			.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Previous match").onClick(() => this.step(-1)))
			.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Next match").onClick(() => this.step(1)))
			.addButton((b) => b.setButtonText("Replace").onClick(() => this.replaceCurrent()))
			.addButton((b) => b.setButtonText("Replace all").setCta().onClick(() => this.replaceAll()));
		this.countEl = footer.infoEl;
		this.search();
	}

	onClose() {
		this.isShown = false;
		this.cleanups.forEach((cleanup) => cleanup());
		this.cleanups = [];
		if (this.plugin.dialog === this) this.plugin.dialog = null;
		this.contentEl.empty();
		this.dispatch({ effects: setScope.of(null) });
	}

	private onEnter(e: KeyboardEvent) {
		if (e.key !== "Enter" || e.isComposing) return;
		e.preventDefault();
		this.replaceAll();
	}

	/**
	 * Keep matches in step with edits to the note. Positions are mapped right away,
	 * so the current match stays the same text. The full search reruns afterwards,
	 * because CodeMirror doesn't allow dispatching during an update.
	 */
	private onDocChange(changes: ChangeDesc) {
		this.matches = this.matches.map((m) => ({ from: changes.mapPos(m.from, 1), to: changes.mapPos(m.to, -1) }));
		if (this.refreshQueued) return;
		this.refreshQueued = true;
		queueMicrotask(() => {
			this.refreshQueued = false;
			if (this.isShown) this.search(this.matches[this.current]?.from ?? 0, false);
		});
	}

	/**
	 * Find literal, case-insensitive matches inside the selection, like Obsidian's
	 * own find. The first match at or after `from` becomes current.
	 */
	private search(from = 0, scroll = true) {
		this.matches = [];
		if (this.find) {
			const pattern = new RegExp(escapeRegExp(this.find), "gi");
			for (const range of getScope(this.cm.state)) {
				for (const m of this.cm.state.sliceDoc(range.from, range.to).matchAll(pattern)) {
					const from = range.from + (m.index ?? 0);
					this.matches.push({ from, to: from + m[0].length });
				}
			}
		}
		const next = this.matches.findIndex((m) => m.from >= from);
		this.current = this.matches.length ? Math.max(next, 0) : -1;
		this.showCurrent(scroll);
	}

	private step(direction: 1 | -1) {
		if (!this.isShown || !this.matches.length) return;
		this.current = (this.current + direction + this.matches.length) % this.matches.length;
		this.showCurrent();
	}

	private showCurrent(scroll = true) {
		const match = this.matches[this.current];
		this.dispatch({
			effects: [
				setMatches.of({ matches: this.matches, current: this.current }),
				...(match && scroll ? [EditorView.scrollIntoView(match.from, { y: "center" })] : []),
			],
		});
		const n = this.matches.length;
		this.countEl.setText(!this.find ? "" : n ? `${this.current + 1} of ${n} in selection` : "No matches in selection");
	}

	/** Replace the current match and move on to the next one. */
	private replaceCurrent() {
		if (!this.isShown || !this.find) return;
		// Search again first, in case the edit that changed the note hasn't been
		// picked up yet.
		this.search(this.matches[this.current]?.from ?? 0);
		const match = this.matches[this.current];
		if (!match) return;
		this.dispatch({ changes: { ...match, insert: this.replace }, userEvent: "input.replace" });
		this.search(match.from + this.replace.length);
	}

	private replaceAll() {
		if (!this.isShown || !this.find) return;
		this.search();
		const n = this.matches.length;
		if (n) {
			// One transaction, so a single undo reverts every replacement.
			this.dispatch({
				changes: this.matches.map((m) => ({ ...m, insert: this.replace })),
				userEvent: "input.replace.all",
			});
		}
		new Notice(`Replaced ${n} ${n === 1 ? "match" : "matches"}.`);
		this.close();
	}

	private dispatch(spec: Parameters<EditorView["dispatch"]>[0]) {
		// The note may have been closed while the dialog was open.
		if (this.cm.dom.isConnected) this.cm.dispatch(spec);
	}

	/** Drag the dialog by its title, keeping it inside the window. */
	private makeDraggable() {
		const offset = this.plugin.dialogOffset;
		const modalEl = this.modalEl;
		// The dialog may be in a pop-out window.
		const win = modalEl.win;
		let applied = { x: 0, y: 0 };

		const moveTo = (x: number, y: number) => {
			// Where the dialog would be without any offset.
			const rect = modalEl.getBoundingClientRect();
			const left = rect.left - applied.x;
			const top = rect.top - applied.y;
			// If the dialog is bigger than the window, keep its top-left corner visible.
			offset.x = clamp(x, -left, win.innerWidth - rect.width - left);
			offset.y = clamp(y, -top, win.innerHeight - rect.height - top);
			applied = { ...offset };
			modalEl.style.translate = `${offset.x}px ${offset.y}px`;
		};

		// Restore the last position straight away, and pull it back into the
		// window once the dialog has its final size.
		modalEl.style.translate = `${offset.x}px ${offset.y}px`;
		applied = { ...offset };
		win.requestAnimationFrame(() => {
			if (this.isShown) moveTo(offset.x, offset.y);
		});
		const onResize = () => moveTo(offset.x, offset.y);
		win.addEventListener("resize", onResize);
		this.cleanups.push(() => win.removeEventListener("resize", onResize));

		const handle = this.titleEl;
		handle.addClass("frs-drag-handle");
		handle.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const startX = e.clientX - offset.x;
			const startY = e.clientY - offset.y;
			const move = (ev: PointerEvent) => moveTo(ev.clientX - startX, ev.clientY - startY);
			const up = () => {
				handle.removeEventListener("pointermove", move);
				handle.removeEventListener("pointerup", up);
				handle.removeEventListener("pointercancel", up);
			};
			handle.setPointerCapture(e.pointerId);
			handle.addEventListener("pointermove", move);
			handle.addEventListener("pointerup", up);
			handle.addEventListener("pointercancel", up);
		});
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(value, max));
}

function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
