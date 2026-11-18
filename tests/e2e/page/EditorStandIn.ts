import type { App } from "obsidian";
import type { EditorHooks, EditorHost } from "../../../obsidian/ui/markdown/EmbeddedEditor";

export type { EditorHooks, EditorHost, EditorKey } from "../../../obsidian/ui/markdown/EmbeddedEditor";

/**
 * The test page's stand-in for Obsidian's embedded editor (`obsidian/ui/markdown/EmbeddedEditor.ts`), with its interface: a
 * plain-text field that honours the keys it is given (Enter, Escape, Tab and Shift+Tab). Obsidian's own editor
 * (`[[`, its look) is checked by hand in the test Obsidian.
 */
export class EmbeddedEditor {
	private readonly field: HTMLDivElement;

	constructor(_app: App, private readonly host: EditorHost, _sourcePath: string, container: HTMLElement, text: string, private readonly hooks: EditorHooks = {}) {
		this.field = container.ownerDocument.createElement("div");
		this.field.className = "tc-stand-editor";
		this.field.contentEditable = "plaintext-only";
		this.field.textContent = text;
		this.field.addEventListener("keydown", this.onKey);
		this.field.addEventListener("input", () => this.hooks.onChange?.());
		container.appendChild(this.field);
	}

	get value(): string {
		return this.field.textContent ?? "";
	}

	get contentDOM(): HTMLElement {
		return this.field;
	}

	get focused(): boolean {
		return this.field.ownerDocument.activeElement === this.field;
	}

	setValue(text: string): void {
		if (this.value === text) return;
		this.field.textContent = text;
		this.caretToEnd();
	}

	focusEnd(): void {
		this.field.focus();
		this.caretToEnd();
	}

	focus(): void {
		this.field.focus();
	}

	destroy(): void {
		this.field.removeEventListener("keydown", this.onKey);
		this.field.remove();
		this.host.activeEditor = null;
	}

	private readonly onKey = (event: KeyboardEvent): void => {
		const key = this.hooks.keys?.find((k) => k.key === event.key);
		if (!key || event.isComposing) return;
		const run = event.shiftKey ? key.shift : key.run;
		if (!run || run() === false) return;
		event.preventDefault();
		event.stopPropagation();
	};

	private caretToEnd(): void {
		const selection = this.field.ownerDocument.getSelection();
		if (!selection) return;
		selection.selectAllChildren(this.field);
		selection.collapseToEnd();
	}
}
