import type { PriorityLevel } from "../../settings";
import { markPriority } from "../TaskCard";
import type { TitleFieldFactory } from "./TitleField";

export type QuickKey = "enter" | "escape" | "tab" | "shiftTab";

export interface QuickFieldOptions {
	readonly value: string;
	/** The whole value selected once focused, to be typed over: a rename. */
	readonly select: boolean;
	/** The levels a prefix at the start of the text may stand for. */
	readonly levels: readonly PriorityLevel[];
	/** The level the field starts with. */
	readonly priority: PriorityLevel | null;
	/** The field the text is typed in. */
	readonly titleField: TitleFieldFactory;
	onInput(text: string): void;
	/** The level the text's prefix now stands for, null once it no longer starts with one; only when that changes. */
	onPriority(level: PriorityLevel | null): void;
	onKey(key: QuickKey): void;
	onBlur(): void;
}

export interface QuickFieldHandle {
	readonly el: HTMLElement;
	readonly text: string;
	readonly focused: boolean;
	/** The focus taken the first time: the whole value selected for a rename, else the caret at the end. */
	focus(): void;
	/** The focus given back after a redraw moved the field, the selection as it was. */
	refocus(): void;
	/** A level chosen elsewhere; the field takes its colour. */
	setPriority(level: PriorityLevel | null): void;
	/** A text set by the owner: a prefix in it counts as already reported. */
	setValue(text: string): void;
	destroy(): void;
}

/** The level whose prefix, then a space, starts the text. */
export function levelOfText(text: string, levels: readonly PriorityLevel[]): PriorityLevel | null {
	return levels.find((level) => text.startsWith(`${level.prefix} `)) ?? null;
}

/**
 * A task typed in place in the list: a card-like field that wraps long text and grows downward with it. Enter, Escape and
 * Tab are the owner's to handle; the text never takes a line break.
 */
export const QuickField = {
	open(parent: HTMLElement, opts: QuickFieldOptions): QuickFieldHandle {
		let fromText = levelOfText(opts.value, opts.levels);
		const title = opts.titleField(parent, {
			text: opts.value,
			placeholder: "New task",
			events: {
				onInput: () => {
					const text = title.text;
					opts.onInput(text);
					const level = levelOfText(text, opts.levels);
					if (level?.prefix === fromText?.prefix) return;
					fromText = level;
					markPriority(title.el, level);
					opts.onPriority(level);
				},
				onEnter: () => opts.onKey("enter"),
				onEscape: () => opts.onKey("escape"),
				onTab: (shift) => opts.onKey(shift ? "shiftTab" : "tab"),
				onBlur: () => opts.onBlur(),
			},
		});
		title.el.classList.add("tc-quick-field");
		markPriority(title.el, opts.priority);
		return {
			el: title.el,
			get text() {
				return title.text;
			},
			get focused() {
				return title.focused;
			},
			focus() {
				if (opts.select) title.selectAll();
				else title.focusEnd();
			},
			refocus() {
				title.focus();
			},
			setPriority(level) {
				markPriority(title.el, level);
			},
			setValue(text) {
				title.setText(text);
				fromText = levelOfText(text, opts.levels);
			},
			destroy() {
				title.destroy();
			},
		};
	},
};
