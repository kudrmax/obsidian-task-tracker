import { composingKey, oneLine, type TitleField, type TitleFieldFactory, type TitleFieldOptions } from "../../src/ui/quick/TitleField";

/**
 * Obsidian's editor needs Obsidian: tests type in a plain textarea that keeps the same contract. Set `value` and send
 * `input` to type; Enter, Escape, Tab and Shift+Tab go to the owner and no further, a line break becomes a space. `popup`
 * stands for what the editor shows outside the field, as Obsidian's note search.
 */
export class FakeTitleField implements TitleField {
	readonly el: HTMLTextAreaElement;
	readonly popup = document.body.appendChild(document.createElement("div"));

	constructor(parent: HTMLElement, { text, placeholder, events }: TitleFieldOptions) {
		this.el = parent.appendChild(document.createElement("textarea"));
		this.el.value = oneLine(text);
		this.el.placeholder = placeholder;
		this.el.addEventListener("input", () => {
			this.el.value = oneLine(this.el.value);
			events.onInput();
		});
		this.el.addEventListener("keydown", (e) => {
			if (composingKey(e)) return;
			const run = { Enter: () => events.onEnter(), Escape: () => events.onEscape(), Tab: () => events.onTab(e.shiftKey) }[e.key];
			if (!run) return;
			e.preventDefault();
			e.stopPropagation();
			run();
		});
		this.el.addEventListener("blur", () => events.onBlur());
	}

	get text(): string {
		return this.el.value;
	}

	get focused(): boolean {
		return document.activeElement === this.el;
	}

	setText(text: string): void {
		this.el.value = text;
	}

	focusEnd(): void {
		this.el.focus();
		this.el.setSelectionRange(this.el.value.length, this.el.value.length);
	}

	selectAll(): void {
		this.el.focus();
		this.el.setSelectionRange(0, this.el.value.length);
	}

	focus(): void {
		this.el.focus({ preventScroll: true });
	}

	owns(target: Element): boolean {
		return this.el.contains(target) || this.popup.contains(target);
	}

	destroy(): void {
		this.el.remove();
		this.popup.remove();
	}
}

export const fakeTitleField: TitleFieldFactory = (parent, opts) => new FakeTitleField(parent, opts);
