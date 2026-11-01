import type { PriorityLevel } from "../../settings";
import { el } from "../dom";
import { markPriority } from "../TaskCard";

export type QuickKey = "enter" | "escape" | "tab" | "shiftTab";

export interface QuickFieldOptions {
	readonly value: string;
	/** The whole value selected once focused, to be typed over: a rename. */
	readonly select: boolean;
	/** The levels a prefix at the start of the text may stand for. */
	readonly levels: readonly PriorityLevel[];
	/** The level the field starts with. */
	readonly priority: PriorityLevel | null;
	onInput(text: string): void;
	/** The level the text's prefix now stands for, null once it no longer starts with one; only when that changes. */
	onPriority(level: PriorityLevel | null): void;
	onKey(key: QuickKey): void;
	onBlur(): void;
}

export interface QuickFieldHandle {
	readonly el: HTMLTextAreaElement;
	focus(): void;
	/** A level chosen elsewhere; the field takes its colour. */
	setPriority(level: PriorityLevel | null): void;
	/** A text set by the owner: the field fits it, and a prefix in it counts as already reported. */
	setValue(text: string): void;
}

const KEYS: Readonly<Record<string, QuickKey>> = { Enter: "enter", Escape: "escape", Tab: "tab" };

/** The key iOS sends while an input method commits a candidate, with `isComposing` already false. */
const COMPOSING_KEY_CODE = 229;

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
		const field = el(parent, "textarea", "tc-quick-field");
		field.rows = 1;
		field.placeholder = "New task";
		field.value = opts.value;
		field.enterKeyHint = "next";
		markPriority(field, opts.priority);
		let fromText = levelOfText(opts.value, opts.levels);
		const fit = () => {
			field.style.height = "auto";
			if (field.scrollHeight > 0) field.style.height = `${field.scrollHeight}px`;
		};
		field.addEventListener("keydown", (e) => {
			if (e.isComposing || e.keyCode === COMPOSING_KEY_CODE) return;
			const key = e.key === "Tab" && e.shiftKey ? "shiftTab" : KEYS[e.key];
			if (!key) return;
			e.preventDefault();
			e.stopPropagation();
			opts.onKey(key);
		});
		field.addEventListener("input", () => {
			const flat = field.value.replace(/\s*\n\s*/g, " ");
			if (flat !== field.value) field.value = flat;
			fit();
			opts.onInput(field.value);
			const level = levelOfText(field.value, opts.levels);
			if (level?.prefix === fromText?.prefix) return;
			fromText = level;
			markPriority(field, level);
			opts.onPriority(level);
		});
		field.addEventListener("blur", () => opts.onBlur());
		fit();
		return {
			el: field,
			focus() {
				field.focus();
				if (opts.select) field.setSelectionRange(0, field.value.length);
				else field.setSelectionRange(field.value.length, field.value.length);
				fit();
			},
			setPriority(level) {
				markPriority(field, level);
			},
			setValue(text) {
				field.value = text;
				fromText = levelOfText(text, opts.levels);
				fit();
			},
		};
	},
};
