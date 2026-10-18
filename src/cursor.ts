import { SearchCursor } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import type { Editor, EditorRange } from "obsidian";
import type { OffsetRange } from "./scope";

/** Shape of the cursor Obsidian's find bar gets from `editor.searchCursor()`. */
export interface DocumentSearchCursor {
	getIndexAndCount(): [number, number];
	current(): EditorRange | null;
	findNext(): EditorRange | null;
	findPrevious(): EditorRange | null;
	findAll(): EditorRange[];
	replace(text: string, origin?: string): void;
	replaceAll(text: string, origin?: string): void;
}

/**
 * A drop-in replacement for Obsidian's search cursor that only matches text
 * inside `getScope()`. Matching is case-insensitive and literal, the same as
 * the built-in cursor.
 */
export function scopedSearchCursor(
	editor: Editor,
	cm: EditorView,
	query: string,
	getScope: () => OffsetRange[]
): DocumentSearchCursor {
	const normalize = (s: string) => s.toLowerCase();

	const matches = (): OffsetRange[] => {
		const found: OffsetRange[] = [];
		if (!query) return found;
		for (const range of getScope()) {
			const cursor = new SearchCursor(cm.state.doc, query, range.from, range.to, normalize);
			while (!cursor.next().done) found.push({ ...cursor.value });
		}
		return found;
	};

	const toEditorRange = (m: OffsetRange): EditorRange => ({
		from: editor.offsetToPos(m.from),
		to: editor.offsetToPos(m.to),
	});

	let current: OffsetRange | null = null;
	// Where the next/previous search starts from. Begins at the scope start.
	const start = getScope()[0]?.from ?? 0;
	let anchor: OffsetRange = { from: start, to: start };

	const select = (m: OffsetRange | undefined): EditorRange | null => {
		if (!m) return (current = null);
		current = anchor = m;
		return toEditorRange(m);
	};

	return {
		getIndexAndCount() {
			const all = matches();
			const index = current ? all.findIndex((m) => m.from === current!.from) + 1 : 0;
			return [index, all.length];
		},
		current: () => (current ? toEditorRange(current) : null),
		findNext() {
			const all = matches();
			return select(all.find((m) => m.from >= anchor.to) ?? all[0]);
		},
		findPrevious() {
			const all = matches();
			const before = all.filter((m) => m.to <= anchor.from);
			return select(before[before.length - 1] ?? all[all.length - 1]);
		},
		findAll: () => matches().map(toEditorRange),
		replace(text, origin) {
			const m = current;
			// Skip if the document changed under the match since it was found.
			if (!m || !matches().some((x) => x.from === m.from && x.to === m.to)) return;
			editor.replaceRange(text, editor.offsetToPos(m.from), editor.offsetToPos(m.to), origin);
			// Resume after the inserted text so the replacement isn't matched again.
			anchor = { from: m.from, to: m.from + text.length };
			current = null;
		},
		replaceAll(text, origin) {
			const all = matches();
			if (!all.length) return;
			editor.transaction(
				{ changes: all.map((m) => ({ ...toEditorRange(m), text })) },
				origin
			);
			current = null;
		},
	};
}
