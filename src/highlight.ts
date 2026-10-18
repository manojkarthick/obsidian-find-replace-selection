import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

export interface OffsetRange {
	from: number;
	to: number;
}

/** Set the selection to search within, or clear it with null. */
export const setScope = StateEffect.define<OffsetRange[] | null>();
/** Set the matches to highlight and which one is current (-1 for none). */
export const setMatches = StateEffect.define<{ matches: OffsetRange[]; current: number }>();

// Inclusive on both ends so the scope keeps text inserted at its edges.
const scopeMark = Decoration.mark({ class: "frs-scope", inclusiveStart: true, inclusiveEnd: true });
const matchMark = Decoration.mark({ class: "frs-match" });
const currentMark = Decoration.mark({ class: "frs-match frs-match-current" });

// Decorations are mapped through every edit, so they follow the text if the
// note changes while the dialog is open.
const scopeField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setScope)) {
				deco = Decoration.set((e.value ?? []).map((r) => scopeMark.range(r.from, r.to)), true);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

const matchField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(deco, tr) {
		deco = deco.map(tr.changes);
		for (const e of tr.effects) {
			if (e.is(setScope)) deco = Decoration.none;
			if (e.is(setMatches)) {
				const { matches, current } = e.value;
				deco = Decoration.set(
					matches.map((m, i) => (i === current ? currentMark : matchMark).range(m.from, m.to)),
					true
				);
			}
		}
		return deco;
	},
	provide: (f) => EditorView.decorations.from(f),
});

export const highlightExtension = [scopeField, matchField];

export function getScope(state: EditorState): OffsetRange[] {
	const ranges: OffsetRange[] = [];
	state.field(scopeField, false)?.between(0, state.doc.length, (from, to) => {
		ranges.push({ from, to });
	});
	return ranges;
}
