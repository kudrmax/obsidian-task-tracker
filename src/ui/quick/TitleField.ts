/** What the title field tells its owner. */
export interface TitleFieldEvents {
	onInput(): void;
	onEnter(): void;
	onEscape(): void;
	/** Tab; with `shift`, Shift+Tab. */
	onTab(shift: boolean): void;
	onBlur(): void;
}

export interface TitleFieldOptions {
	readonly text: string;
	/** Shown while the field is empty. */
	readonly placeholder: string;
	readonly events: TitleFieldEvents;
}

/** The field a task's title is typed in: one line of text, which wraps. */
export interface TitleField {
	readonly el: HTMLElement;
	/** The title as typed, on one line. */
	readonly text: string;
	/** The page's active element: a window that loses the focus leaves the field so. */
	readonly focused: boolean;
	/** A text set by the owner, the caret at its end; no input is reported for it. */
	setText(text: string): void;
	/** Puts the caret at the end, the keyboard up. */
	focusEnd(): void;
	/** The whole title selected, to be typed over, the keyboard up. */
	selectAll(): void;
	/** The focus given back, the selection as it was, without scrolling. */
	focus(): void;
	/** Part of the typing: the field, or what its editor shows for it elsewhere on the page; a tap there is not a tap elsewhere. */
	owns(target: Element): boolean;
	destroy(): void;
}

export type TitleFieldFactory = (parent: HTMLElement, opts: TitleFieldOptions) => TitleField;

/** A line break and the spaces around it: in a title it reads as one space. */
export const LINE_BREAK = /\s*\n\s*/g;

/** A title on one line: a line break pasted in reads as a space. */
export function oneLine(text: string): string {
	return text.replace(LINE_BREAK, " ");
}

/** The key code iOS sends while an input method commits a candidate, with `isComposing` already false. */
const COMPOSING_KEY_CODE = 229;

/** A key that commits an input method's candidate: it belongs to the input method, not to the field's owner. */
export function composingKey(e: KeyboardEvent): boolean {
	return e.isComposing || e.keyCode === COMPOSING_KEY_CODE;
}
