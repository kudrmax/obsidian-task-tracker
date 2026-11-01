import type { App } from "obsidian";
import { el } from "../dom";
import { type EditorHost, EmbeddedEditor } from "../markdown/EmbeddedEditor";
import { oneLine, type TitleField, type TitleFieldEvents } from "./TitleField";

/**
 * The title typed in Obsidian's own editor, as in a note in Live Preview: `[[` opens the note search, a link shows its
 * word. Enter saves and Escape cancels, unless the note search is open: then they are the search's.
 */
export class MarkdownTitleField implements TitleField {
	readonly el: HTMLElement;
	private readonly editor: EmbeddedEditor;

	constructor(app: App, host: EditorHost, sourcePath: string, parent: HTMLElement, text: string, events: TitleFieldEvents) {
		this.el = el(parent, "div", "tc-sheet-title");
		this.editor = new EmbeddedEditor(app, host, sourcePath, this.el, text, {
			keys: [
				{ key: "Enter", run: () => events.onEnter() },
				{ key: "Escape", run: () => events.onEscape() },
			],
			onChange: () => events.onInput(),
		});
		this.editor.contentDOM.setAttribute("enterkeyhint", "done");
	}

	get text(): string {
		return oneLine(this.editor.value);
	}

	focusEnd(): void {
		this.editor.focusEnd();
	}

	destroy(): void {
		this.editor.destroy();
	}
}
