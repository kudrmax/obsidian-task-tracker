/** A running editor of Markdown: what it holds now, and the way to drop it. */
export interface MarkdownEditing {
	readonly value: string;
	focus(): void;
	destroy(): void;
}

/**
 * Where a description is drawn and edited: by Obsidian itself, so its text looks as in a note, by the user's own
 * settings and theme. The view hands it in; menus and screens only ask it.
 */
export interface MarkdownSurface {
	/** Draws the Markdown into `el`; links in it open as in a note. */
	render(el: HTMLElement, markdown: string): Promise<void>;
	/** Puts an editor holding `markdown` into `el`, its caret at the end. */
	edit(el: HTMLElement, markdown: string): MarkdownEditing;
}
