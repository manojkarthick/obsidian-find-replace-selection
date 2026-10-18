// A minimal stand-in for the parts of the Obsidian API the plugin uses.

export const notices: string[] = [];
export const settings: Setting[] = [];

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class MarkdownView {
	contentEl = document.createElement("div");
}

export class App {}

export class Plugin {
	commands: any[] = [];
	extensions: any[] = [];
	constructor(public app: App, public manifest?: unknown) {}
	onload() {}
	onunload() {}
	addCommand(command: any) {
		this.commands.push(command);
		return command;
	}
	registerEditorExtension(extension: any) {
		this.extensions.push(extension);
	}
	async loadData() {
		return null;
	}
	async saveData() {}
}

export class Modal {
	containerEl = document.createElement("div");
	modalEl = this.containerEl.appendChild(document.createElement("div"));
	titleEl = this.modalEl.appendChild(document.createElement("div"));
	contentEl = this.modalEl.appendChild(document.createElement("div"));
	constructor(public app: App) {}
	open() {
		document.body.appendChild(this.containerEl);
		this.onOpen();
	}
	close() {
		if (!this.containerEl.isConnected) return;
		this.containerEl.remove();
		this.onClose();
	}
	onOpen() {}
	onClose() {}
}

export class TextComponent {
	inputEl = document.createElement("input");
	private changed?: (value: string) => void;
	onChange(callback: (value: string) => void) {
		this.changed = callback;
		return this;
	}
	/** Test helper: type a value into the field. */
	type(value: string) {
		this.inputEl.value = value;
		this.changed?.(value);
	}
}

export class ButtonComponent {
	text = "";
	icon = "";
	click?: () => void;
	setButtonText(text: string) {
		this.text = text;
		return this;
	}
	setIcon(icon: string) {
		this.icon = icon;
		return this;
	}
	setTooltip() {
		return this;
	}
	setCta() {
		return this;
	}
	onClick(callback: () => void) {
		this.click = callback;
		return this;
	}
}

export class Setting {
	name = "";
	infoEl = document.createElement("div");
	text?: TextComponent;
	buttons: ButtonComponent[] = [];
	constructor(public containerEl: HTMLElement) {
		settings.push(this);
	}
	setName(name: string) {
		this.name = name;
		return this;
	}
	addText(callback: (text: TextComponent) => void) {
		callback((this.text = new TextComponent()));
		return this;
	}
	addButton(callback: (button: ButtonComponent) => void) {
		const button = new ButtonComponent();
		this.buttons.push(button);
		callback(button);
		return this;
	}
	addExtraButton(callback: (button: ButtonComponent) => void) {
		return this.addButton(callback);
	}
}
