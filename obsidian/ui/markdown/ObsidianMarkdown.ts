import { type App, type Component, MarkdownRenderer, Scope } from "obsidian";
import type { TaskLink } from "../TaskTitle";
import { type EditorHost, EmbeddedEditor } from "./EmbeddedEditor";
import { holdLineCommands } from "./lineCommands";
import type { MarkdownEditing, MarkdownSurface } from "./MarkdownSurface";

/** A description drawn by Obsidian's markdown renderer and edited in its own editor, links made from the tasks file. */
export class ObsidianMarkdown implements MarkdownSurface {
	constructor(
		private readonly app: App,
		private readonly view: Component & EditorHost,
		private readonly sourcePath: () => string,
		private readonly openLink: (link: TaskLink) => void,
		/** The scope the editor's keys stand over: Obsidian's own, or a note's block's. */
		private readonly keys?: Scope,
	) {}

	async render(el: HTMLElement, markdown: string): Promise<void> {
		el.empty();
		el.addClass("markdown-rendered");
		el.addEventListener("click", (e) => this.follow(e));
		await MarkdownRenderer.render(this.app, markdown, el, this.sourcePath(), this.view);
	}

	edit(el: HTMLElement, markdown: string, onEscape: () => void, onChange?: () => void): MarkdownEditing {
		el.removeClass("markdown-rendered");
		const editor = new EmbeddedEditor(this.app, this.view, this.sourcePath(), el, markdown, { keys: [{ key: "Escape", run: onEscape }], onChange });
		const scope = new Scope(this.keys ?? this.app.scope);
		holdLineCommands(this.app, scope);
		let held = false;
		const hold = (on: boolean) => {
			if (on === held) return;
			held = on;
			if (on) this.app.keymap.pushScope(scope);
			else this.app.keymap.popScope(scope);
		};
		editor.contentDOM.addEventListener("focus", () => hold(true));
		editor.contentDOM.addEventListener("blur", () => hold(false));
		return {
			get value() {
				return editor.value;
			},
			get focused() {
				return editor.focused;
			},
			focus: () => editor.focusEnd(),
			setValue: (text) => editor.setValue(text),
			destroy: () => {
				hold(false);
				editor.destroy();
			},
		};
	}

	/** A link opens as the task title's do: a note in a new tab, an address in the browser. */
	private follow(e: MouseEvent): void {
		const a = (e.target as Element).closest("a");
		if (!a) return;
		e.preventDefault();
		const internal = a.classList.contains("internal-link");
		const target = internal ? (a.dataset.href ?? a.getAttribute("href") ?? "") : a.href;
		if (target) this.openLink({ kind: internal ? "note" : "url", target });
	}
}
