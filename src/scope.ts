import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface OffsetRange {
	from: number;
	to: number;
}

/** Set (or clear, with null) the ranges that the find bar is restricted to. */
export const setSearchScope = StateEffect.define<OffsetRange[] | null>();

// Inclusive on both ends so a replacement that touches the edge of the
// scope stays inside it after the document changes.
const scopeMark = Decoration.mark({
	class: "frs-search-scope",
	inclusiveStart: true,
	inclusiveEnd: true,
});

/**
 * Holds the search scope as decorations. CodeMirror maps them through every
 * edit, so the scope tracks the text as replacements change its length, and
 * the decorations also highlight the scope in the editor.
 */
export const searchScopeField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(scope, tr) {
		scope = scope.map(tr.changes);
		for (const effect of tr.effects) {
			if (!effect.is(setSearchScope)) continue;
			const ranges = (effect.value ?? []).filter((r) => r.to > r.from);
			scope = Decoration.set(
				ranges.map((r) => scopeMark.range(r.from, r.to)),
				true
			);
		}
		return scope;
	},
	provide: (field) => EditorView.decorations.from(field),
});

export function getSearchScope(state: EditorState): OffsetRange[] {
	const scope = state.field(searchScopeField, false);
	const ranges: OffsetRange[] = [];
	scope?.between(0, state.doc.length, (from, to) => {
		ranges.push({ from, to });
	});
	return ranges;
}
