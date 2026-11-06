import type { EntryPart } from "./EntryPart";
import type { PriorityColor } from "../../application/contracts";
import type { TitleFieldFactory } from "./TitleField";

export type QuickKey = "enter" | "escape" | "tab" | "shiftTab" | "altTab";

export interface QuickFieldOptions {
	readonly value: string;
	/** The colour the field starts in: the session's tint (`DraftMarks.tint`). */
	readonly tint: PriorityColor | null;
	/** The field the text is typed in. */
	readonly titleField: TitleFieldFactory;
	onInput(text: string): void;
	onKey(key: QuickKey): void;
	onBlur(): void;
}

export interface QuickFieldHandle extends EntryPart {
	readonly el: HTMLElement;
	readonly text: string;
	readonly focused: boolean;
	/** The focus taken the first time: the caret at the end. */
	focus(): void;
	/** The focus given back after a redraw moved the field, the selection as it was. */
	refocus(): void;
	/** The field writes a section's name: it looks like the section name field, and its hint says so. */
	setSection(on: boolean): void;
	/** The colour the session gives the text as typed (`DraftMarks.tint`); none takes it away. */
	setTint(color: PriorityColor | null): void;
	/** A text set by the owner. */
	setValue(text: string): void;
	/** Part of the typing: the field, or what its editor shows for it elsewhere on the page. */
	owns(target: Element): boolean;
	destroy(): void;
}

/**
 * A task typed in place in the list: a card-like field that wraps long text and grows downward with it. Enter, Escape and
 * Tab are the owner's to handle; the text never takes a line break.
 */
export const QuickField = {
	open(parent: HTMLElement, opts: QuickFieldOptions): QuickFieldHandle {
		const title = opts.titleField(parent, {
			text: opts.value,
			placeholder: "New task",
			events: {
				onInput: () => opts.onInput(title.text),
				onEnter: () => opts.onKey("enter"),
				onEscape: () => opts.onKey("escape"),
				onTab: (shift) => opts.onKey(shift ? "shiftTab" : "tab"),
				onSwitch: () => opts.onKey("altTab"),
				onBlur: () => opts.onBlur(),
			},
		});
		title.el.classList.add("tc-quick-field");
		const tint = (color: PriorityColor | null) => {
			if (color) title.el.dataset.priority = color;
			else delete title.el.dataset.priority;
		};
		tint(opts.tint);
		return {
			el: title.el,
			get text() {
				return title.text;
			},
			get focused() {
				return title.focused;
			},
			focus() {
				title.focusEnd();
			},
			refocus() {
				title.focus();
			},
			setSection(on) {
				title.setPlaceholder(on ? "Section name" : "New task");
				title.el.classList.toggle("is-section", on);
			},
			setTint: tint,
			setValue(text) {
				title.setText(text);
			},
			owns(target) {
				return title.owns(target);
			},
			destroy() {
				title.destroy();
			},
		};
	},
};
