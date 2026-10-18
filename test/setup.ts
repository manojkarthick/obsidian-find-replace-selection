// The DOM helpers Obsidian adds to every element, as far as the plugin uses them.
Object.assign(HTMLElement.prototype, {
	addClass(this: HTMLElement, ...classes: string[]) {
		this.classList.add(...classes);
	},
	setText(this: HTMLElement, text: string) {
		this.textContent = text;
	},
	empty(this: HTMLElement) {
		this.replaceChildren();
	},
});
Object.defineProperty(Node.prototype, "win", {
	get(this: Node) {
		return this.ownerDocument?.defaultView ?? window;
	},
});
