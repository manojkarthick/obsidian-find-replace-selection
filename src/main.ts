import { App, Editor, EditorRange, Modal, Notice, Plugin, Setting } from "obsidian";

export default class FindReplaceInSelection extends Plugin {
	async onload() {
		this.addCommand({
			id: "find-replace-in-selection",
			name: "Find and replace in selection",
			editorCallback: (editor) => {
				const ranges = selectionRanges(editor);
				if (!ranges.length) {
					new Notice("Select the text to search within first.");
					return;
				}
				new FindReplaceModal(this.app, editor, ranges).open();
			},
		});
	}
}

class FindReplaceModal extends Modal {
	private find = "";
	private replace = "";
	private countEl: HTMLElement;

	constructor(app: App, private editor: Editor, private ranges: EditorRange[]) {
		super(app);
	}

	onOpen() {
		this.titleEl.setText("Find and replace in selection");

		new Setting(this.contentEl).setName("Find").addText((text) => {
			text.onChange((value) => {
				this.find = value;
				this.updateCount();
			});
			text.inputEl.addEventListener("keydown", (e) => this.onEnter(e));
			window.setTimeout(() => text.inputEl.focus());
		});
		new Setting(this.contentEl).setName("Replace with").addText((text) => {
			text.onChange((value) => (this.replace = value));
			text.inputEl.addEventListener("keydown", (e) => this.onEnter(e));
		});

		const footer = new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText("Replace all")
				.setCta()
				.onClick(() => this.replaceAll())
		);
		this.countEl = footer.infoEl;
		this.updateCount();
	}

	onClose() {
		this.contentEl.empty();
	}

	private onEnter(e: KeyboardEvent) {
		if (e.key !== "Enter" || e.isComposing) return;
		e.preventDefault();
		this.replaceAll();
	}

	private updateCount() {
		const count = this.find ? this.matches().length : 0;
		this.countEl.setText(this.find ? `${count} ${count === 1 ? "match" : "matches"} in selection` : "");
	}

	/** Literal, case-insensitive matches inside the selection, like Obsidian's own find. */
	private matches(): EditorRange[] {
		const pattern = new RegExp(escapeRegExp(this.find), "gi");
		const found: EditorRange[] = [];
		for (const range of this.ranges) {
			const start = this.editor.posToOffset(range.from);
			for (const m of this.editor.getRange(range.from, range.to).matchAll(pattern)) {
				const from = start + (m.index ?? 0);
				found.push({
					from: this.editor.offsetToPos(from),
					to: this.editor.offsetToPos(from + m[0].length),
				});
			}
		}
		return found;
	}

	private replaceAll() {
		if (!this.find) return;
		const matches = this.matches();
		if (matches.length) {
			// One transaction, so a single undo reverts every replacement.
			this.editor.transaction({ changes: matches.map((m) => ({ ...m, text: this.replace })) });
		}
		new Notice(`Replaced ${matches.length} ${matches.length === 1 ? "match" : "matches"}.`);
		this.close();
	}
}

/** Non-empty selections, each ordered start to end. */
function selectionRanges(editor: Editor): EditorRange[] {
	return editor
		.listSelections()
		.map(({ anchor, head }) =>
			editor.posToOffset(anchor) <= editor.posToOffset(head)
				? { from: anchor, to: head }
				: { from: head, to: anchor }
		)
		.filter((r) => editor.posToOffset(r.to) > editor.posToOffset(r.from));
}

function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
