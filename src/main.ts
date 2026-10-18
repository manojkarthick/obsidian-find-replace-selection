import { App, MarkdownView, Modal, Notice, Plugin, Setting } from "obsidian";
import { EditorView } from "@codemirror/view";
import { getScope, highlightExtension, OffsetRange, setMatches, setScope } from "./highlight";

export default class FindReplaceInSelection extends Plugin {
	/** Where the dialog was dragged to, kept for the rest of the session. */
	dialogOffset = { x: 0, y: 0 };

	async onload() {
		this.registerEditorExtension(highlightExtension);

		this.addCommand({
			id: "find-replace-in-selection",
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
				cm.dispatch({ effects: setScope.of(ranges.map(({ from, to }) => ({ from, to }))) });
				new FindReplaceModal(this.app, this, cm).open();
			},
		});
	}
}

/** The CodeMirror editor of a Markdown view in Live Preview or Source mode. */
function editorViewOf(view: MarkdownView): EditorView | null {
	// The view's own editor comes before any nested ones (e.g. in tables) in document order.
	const el = view.contentEl.querySelector<HTMLElement>(".cm-editor");
	return el ? EditorView.findFromDOM(el) : null;
}

class FindReplaceModal extends Modal {
	private find = "";
	private replace = "";
	private matches: OffsetRange[] = [];
	private current = -1;
	private countEl: HTMLElement;

	constructor(app: App, private plugin: FindReplaceInSelection, private cm: EditorView) {
		super(app);
	}

	onOpen() {
		// Leave the note visible and usable behind the dialog, so the highlighted
		// matches can be seen.
		this.containerEl.addClass("frs-modal-container");
		this.titleEl.setText("Find and replace in selection");
		this.makeDraggable();

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
			.addButton((b) => b.setButtonText("Replace all").setCta().onClick(() => this.replaceAll()));
		this.countEl = footer.infoEl;
		this.search();
	}

	onClose() {
		this.contentEl.empty();
		this.dispatch({ effects: setScope.of(null) });
	}

	private onEnter(e: KeyboardEvent) {
		if (e.key !== "Enter" || e.isComposing) return;
		e.preventDefault();
		this.replaceAll();
	}

	/** Find literal, case-insensitive matches inside the selection, like Obsidian's own find. */
	private search() {
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
		this.current = this.matches.length ? 0 : -1;
		this.showCurrent();
	}

	private step(direction: 1 | -1) {
		if (!this.matches.length) return;
		this.current = (this.current + direction + this.matches.length) % this.matches.length;
		this.showCurrent();
	}

	private showCurrent() {
		const match = this.matches[this.current];
		this.dispatch({
			effects: [
				setMatches.of({ matches: this.matches, current: this.current }),
				...(match ? [EditorView.scrollIntoView(match.from, { y: "center" })] : []),
			],
		});
		const n = this.matches.length;
		this.countEl.setText(!this.find ? "" : n ? `${this.current + 1} of ${n} in selection` : "No matches in selection");
	}

	private replaceAll() {
		if (!this.find) return;
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

	/** Drag the dialog by its title. */
	private makeDraggable() {
		const offset = this.plugin.dialogOffset;
		const apply = () => (this.modalEl.style.translate = `${offset.x}px ${offset.y}px`);
		apply();

		const handle = this.titleEl;
		handle.addClass("frs-drag-handle");
		handle.addEventListener("pointerdown", (e) => {
			if (e.button !== 0) return;
			e.preventDefault();
			const startX = e.clientX - offset.x;
			const startY = e.clientY - offset.y;
			const move = (ev: PointerEvent) => {
				offset.x = ev.clientX - startX;
				offset.y = ev.clientY - startY;
				apply();
			};
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

function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
