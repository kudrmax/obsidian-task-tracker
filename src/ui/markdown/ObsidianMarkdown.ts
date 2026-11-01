import { type App, type Component, MarkdownRenderer } from "obsidian";
import type { TaskLink } from "../TaskTitle";
import { type EditorHost, EmbeddedEditor } from "./EmbeddedEditor";
import type { MarkdownEditing, MarkdownSurface } from "./MarkdownSurface";

/** A description drawn by Obsidian's markdown renderer and edited in its own editor, links made from the tasks file. */
export class ObsidianMarkdown implements MarkdownSurface {
	constructor(
		private readonly app: App,
		private readonly view: Component & EditorHost,
		private readonly sourcePath: () => string,
		private readonly openLink: (link: TaskLink) => void,
	) {}

	async render(el: HTMLElement, markdown: string): Promise<void> {
		el.empty();
		el.addClass("markdown-rendered");
		el.addEventListener("click", (e) => this.follow(e));
		await MarkdownRenderer.render(this.app, markdown, el, this.sourcePath(), this.view);
	}

	edit(el: HTMLElement, markdown: string, onEscape: () => void): MarkdownEditing {
		el.removeClass("markdown-rendered");
		const editor = new EmbeddedEditor(this.app, this.view, this.sourcePath(), el, markdown, { keys: [{ key: "Escape", run: onEscape }] });
		return {
			get value() {
				return editor.value;
			},
			focus: () => editor.focusEnd(),
			destroy: () => editor.destroy(),
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
