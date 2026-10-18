import {
	App,
	Editor,
	EditorRange,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	setIcon,
	setTooltip,
} from "obsidian";
import type { EditorView } from "@codemirror/view";
import { around } from "monkey-around";
import { DocumentSearchCursor, scopedSearchCursor } from "./cursor";
import { getSearchScope, OffsetRange, searchScopeField, setSearchScope } from "./scope";

/**
 * Obsidian's internal find/replace bar (one per editor, `view.editMode.search`).
 * Not part of the public API; these are the members this plugin relies on.
 */
interface DocumentSearch {
	editor: Editor & { cm: EditorView; searchCursor(query: string): DocumentSearchCursor };
	isActive: boolean;
	searchContainerEl: HTMLElement;
	searchInputEl: HTMLInputElement;
	searchButtonContainerEl: HTMLElement;
	show(replace?: boolean): void;
	hide(): void;
	onSearchInput(): void;
}

interface SearchState {
	scoped: boolean;
	button: HTMLElement;
}

type AutoEnable = "never" | "multiline" | "always";

interface Settings {
	autoEnable: AutoEnable;
}

const DEFAULT_SETTINGS: Settings = {
	autoEnable: "multiline",
};

export default class FindReplaceInSelection extends Plugin {
	settings: Settings;
	private states = new Map<DocumentSearch, SearchState>();
	private patched = false;
	// Set by the command so the next show() scopes to the selection regardless of settings.
	private forceScopeOnShow = false;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));
		this.registerEditorExtension(searchScopeField);

		this.app.workspace.onLayoutReady(() => this.tryPatch());
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.tryPatch()));

		this.addCommand({
			id: "find-replace-in-selection",
			name: "Find and replace in selection",
			editorCallback: (editor, ctx) => {
				const search = ctx instanceof MarkdownView ? getSearch(ctx) : null;
				if (!search) return;
				this.patch(search);
				if (!selectionRanges(editor).length) {
					new Notice("Select the text to search within first.");
					return;
				}
				this.forceScopeOnShow = true;
				search.show(true);
			},
		});
	}

	onunload() {
		for (const [search, state] of this.states) {
			state.button.remove();
			if (state.scoped) this.setScope(search, null);
		}
		this.states.clear();
	}

	private tryPatch() {
		if (this.patched) return;
		this.app.workspace.iterateAllLeaves((leaf) => {
			const search = leaf.view instanceof MarkdownView ? getSearch(leaf.view) : null;
			if (search) this.patch(search);
		});
	}

	/** Patch the find bar's prototype, which every editor's find bar shares. */
	private patch(search: DocumentSearch) {
		if (this.patched) return;
		this.patched = true;
		const plugin = this;

		this.register(
			around(Object.getPrototypeOf(search) as DocumentSearch, {
				show: (original) =>
					function (this: DocumentSearch, replace?: boolean) {
						const ranges = selectionRanges(this.editor);
						const scope = ranges.length > 0 && (plugin.forceScopeOnShow || plugin.shouldAutoScope(this.editor, ranges));
						plugin.forceScopeOnShow = false;

						plugin.ensureButton(this);
						plugin.setScope(this, scope ? ranges : null);
						original.call(this, replace);
						if (scope) {
							// show() fills the query with the selected text, which is what we
							// want to search *within*, not search *for*.
							this.searchInputEl.value = "";
							this.onSearchInput();
						}
					},
				hide: (original) =>
					function (this: DocumentSearch) {
						const wasActive = this.isActive;
						original.call(this);
						if (wasActive) plugin.setScope(this, null);
					},
				onSearchInput: (original) =>
					function (this: DocumentSearch) {
						if (!plugin.states.get(this)?.scoped) return original.call(this);
						// Swap in a scoped cursor for the duration of the call so the rest of
						// the find bar (next/previous, replace, replace all, find all, the
						// match count) works unchanged.
						const editor = this.editor;
						const search = this;
						editor.searchCursor = (query: string) =>
							scopedSearchCursor(editor, editor.cm, query, () => getSearchScope(editor.cm.state));
						try {
							return original.call(search);
						} finally {
							delete (editor as Partial<DocumentSearch["editor"]>).searchCursor;
						}
					},
			})
		);
	}

	private ensureButton(search: DocumentSearch) {
		if (this.states.has(search)) return;
		const button = search.searchButtonContainerEl.createEl("button", {
			cls: "clickable-icon document-search-button frs-toggle",
		});
		setIcon(button, "square-dashed-text");
		setTooltip(button, "Find in selection", { placement: "top" });
		button.addEventListener("mousedown", (e) => e.preventDefault());
		button.addEventListener("click", (e) => {
			e.preventDefault();
			this.toggleScope(search);
		});
		this.states.set(search, { scoped: false, button });
	}

	private toggleScope(search: DocumentSearch) {
		if (this.states.get(search)?.scoped) {
			this.setScope(search, null);
		} else {
			const ranges = selectionRanges(search.editor);
			if (!ranges.length) {
				new Notice("Select the text to search within first.");
				return;
			}
			this.setScope(search, ranges);
		}
		search.onSearchInput();
		search.searchInputEl.focus();
	}

	private setScope(search: DocumentSearch, ranges: OffsetRange[] | null) {
		const state = this.states.get(search);
		if (!state) return;
		state.scoped = !!ranges;
		state.button.toggleClass("is-active", state.scoped);
		search.searchContainerEl.toggleClass("frs-in-selection", state.scoped);
		try {
			search.editor.cm.dispatch({ effects: setSearchScope.of(ranges) });
		} catch (e) {
			// The editor may already be destroyed (e.g. during unload).
		}
	}

	private shouldAutoScope(editor: Editor, ranges: OffsetRange[]) {
		switch (this.settings.autoEnable) {
			case "always":
				return true;
			case "multiline":
				return ranges.length > 1 || editor.getRange(...toPositions(editor, ranges[0])).includes("\n");
			default:
				return false;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

function getSearch(view: MarkdownView): DocumentSearch | null {
	// Live Preview and Source mode share the same edit mode and find bar.
	return (view as unknown as { editMode?: { search?: DocumentSearch } }).editMode?.search ?? null;
}

/** Non-empty selections as sorted document offsets. */
function selectionRanges(editor: Editor): OffsetRange[] {
	return editor
		.listSelections()
		.map((s) => {
			const a = editor.posToOffset(s.anchor);
			const b = editor.posToOffset(s.head);
			return { from: Math.min(a, b), to: Math.max(a, b) };
		})
		.filter((r) => r.to > r.from)
		.sort((x, y) => x.from - y.from);
}

function toPositions(editor: Editor, r: OffsetRange): [EditorRange["from"], EditorRange["to"]] {
	return [editor.offsetToPos(r.from), editor.offsetToPos(r.to)];
}

class SettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: FindReplaceInSelection) {
		super(app, plugin);
	}

	display() {
		this.containerEl.empty();
		new Setting(this.containerEl)
			.setName("Turn on 'Find in selection' automatically")
			.setDesc(
				"When you open find or replace with text selected. 'Multi-line' matches VS Code: a selection inside one line is used as the search query instead."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({ never: "Never", multiline: "Multi-line selections", always: "Any selection" })
					.setValue(this.plugin.settings.autoEnable)
					.onChange(async (value) => {
						this.plugin.settings.autoEnable = value as AutoEnable;
						await this.plugin.saveSettings();
					})
			);
	}
}
