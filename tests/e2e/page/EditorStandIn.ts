import type { App } from "obsidian";
import type { EditorHooks, EditorHost } from "../../../obsidian/ui/shared/markdown/EmbeddedEditor";

export type { EditorHooks, EditorHost, EditorKey } from "../../../obsidian/ui/shared/markdown/EmbeddedEditor";

/**
 * The test page's stand-in for Obsidian's embedded editor (`obsidian/ui/shared/markdown/EmbeddedEditor.ts`), with its interface: a
 * plain-text field that honours the keys it is given (Enter, Escape, Tab and Shift+Tab) and its own hotkeys (⌥Tab).
 * Obsidian's own editor (`[[`, its look, its hotkeys held off the field) is checked by hand in the test Obsidian.
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
		const hotkey = this.hooks.ownScope?.hotkeys.find((k) => k.key === event.key && k.modifiers.includes("Alt") === event.altKey && k.modifiers.includes("Shift") === event.shiftKey && k.modifiers.includes("Mod") === (event.metaKey || event.ctrlKey));
		if (hotkey && !event.isComposing) {
			hotkey.run();
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.altKey) return;
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
