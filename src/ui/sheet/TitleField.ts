/** What the title field tells the task screen. */
export interface TitleFieldEvents {
	onInput(): void;
	onEnter(): void;
	onEscape(): void;
}

/** The field the task's title is typed in. */
export interface TitleField {
	readonly el: HTMLElement;
	/** The title as typed, on one line and trimmed. */
	readonly text: string;
	/** Puts the caret at the end, the keyboard up. */
	focusEnd(): void;
	destroy(): void;
}

export type TitleFieldFactory = (parent: HTMLElement, text: string, events: TitleFieldEvents) => TitleField;

/** A title on one line: a line break pasted in reads as a space. */
export function oneLine(text: string): string {
	return text.replace(/\s*\n\s*/g, " ").trim();
}
