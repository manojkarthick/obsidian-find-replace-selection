import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App, MarkdownView, notices, settings } from "obsidian";
import FindReplaceInSelection from "../src/main";

let plugin: FindReplaceInSelection;
let view: MarkdownView;
let cm: EditorView;

beforeEach(async () => {
	notices.length = 0;
	plugin = new FindReplaceInSelection(new App() as any, {} as any);
	await plugin.onload();
});

afterEach(() => {
	plugin.onunload();
	cm?.destroy();
	document.body.replaceChildren();
});

/** Open a note containing `doc`. */
function openNote(doc: string) {
	view = new MarkdownView();
	document.body.appendChild(view.contentEl);
	cm = new EditorView({
		state: EditorState.create({ doc, extensions: [EditorState.allowMultipleSelections.of(true), (plugin as any).extensions] }),
		parent: view.contentEl,
	});
}

/** Select `[from, to]` ranges and run the command. Returns the dialog's controls. */
function openDialog(...ranges: [number, number][]) {
	cm.dispatch({
		selection: EditorSelection.create(ranges.map(([from, to]) => EditorSelection.range(from, to))),
	});
	settings.length = 0;
	const command = (plugin as any).commands[0];
	command.editorCheckCallback(false, null, view);
	const [find, replace, footer] = settings;
	const button = (label: string) => footer.buttons.find((b) => b.text === label || b.icon === label)!.click!();
	const containers = document.querySelectorAll(".frs-modal-container");
	return {
		dialogEl: containers[containers.length - 1],
		find: (text: string) => find.text!.type(text),
		replaceWith: (text: string) => replace.text!.type(text),
		count: () => footer.infoEl.textContent,
		next: () => button("arrow-down"),
		replace: () => button("Replace"),
		replaceAll: () => button("Replace all"),
	};
}

const doc = () => cm.state.doc.toString();
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("find and replace in selection", () => {
	it("only replaces matches inside the selection, literally and ignoring case", () => {
		openNote("a.b A.B\nx a.b\na.b");
		const d = openDialog([0, 13]);
		d.find("A.b");
		d.replaceWith("$&!");
		expect(d.count()).toBe("1 of 3 in selection");
		d.replaceAll();
		expect(doc()).toBe("$&! $&!\nx $&!\na.b");
		expect(notices).toEqual(["Replaced 3 matches."]);
	});

	it("searches every selection", () => {
		openNote("foo foo foo");
		const d = openDialog([0, 3], [8, 11]);
		d.find("foo");
		d.replaceWith("X");
		d.replaceAll();
		expect(doc()).toBe("X foo X");
	});

	it("replaces the current match and moves to the next, wrapping around", () => {
		openNote("foo foo foo");
		const d = openDialog([0, 11]);
		d.find("foo");
		d.replaceWith("X");
		d.next();
		d.replace();
		expect(doc()).toBe("foo X foo");
		expect(d.count()).toBe("2 of 2 in selection");
		d.replace();
		expect(doc()).toBe("foo X X");
		expect(d.count()).toBe("1 of 1 in selection");
	});

	it("leaves the note alone with an empty search", () => {
		openNote("foo");
		const d = openDialog([0, 3]);
		d.replaceAll();
		expect(doc()).toBe("foo");
	});
});

describe("regressions", () => {
	it("opening a second dialog closes the first, so it can't replace in the new selection", () => {
		openNote("foo OUT foo");
		const a = openDialog([0, 3]);
		a.find("foo");
		a.replaceWith("BAR");
		const b = openDialog([8, 11]);
		expect(a.dialogEl.isConnected).toBe(false);
		a.replaceAll();
		expect(doc()).toBe("foo OUT foo");

		b.find("foo");
		b.replaceWith("BAZ");
		b.replaceAll();
		expect(doc()).toBe("foo OUT BAZ");
	});

	it("Replace changes the highlighted match after the note is edited", async () => {
		openNote("foo foo");
		const d = openDialog([0, 7]);
		d.find("foo");
		d.replaceWith("BAR");
		d.next();
		cm.dispatch({ changes: { from: 0, insert: "abc " } });
		await flush();
		d.replace();
		expect(doc()).toBe("abc foo BAR");
	});

	it("updates the count when the note shrinks", async () => {
		openNote("foo foo");
		const d = openDialog([0, 7]);
		d.find("foo");
		d.next();
		expect(d.count()).toBe("2 of 2 in selection");
		cm.dispatch({ changes: { from: 0, to: 7, insert: "x" } });
		await flush();
		expect(d.count()).toBe("No matches in selection");
	});

	it("closes the dialog when the plugin unloads", () => {
		openNote("foo");
		const d = openDialog([0, 3]);
		plugin.onunload();
		expect(d.dialogEl.isConnected).toBe(false);
		expect(plugin.dialog).toBeNull();
	});
});
