import { DURATION, tokenMs } from "../design";
import { clear, el } from "../dom";
import type { MarkdownEditing, MarkdownSurface } from "../markdown/MarkdownSurface";
import { fillTitle } from "../TaskTitle";

export interface DescriptionSheetOptions {
	/** The task's title, its links shown by their word. */
	readonly title: string;
	readonly markdown: string | null;
	/** Straight in the editor: Add description. */
	readonly editing: boolean;
	readonly surface: MarkdownSurface;
	onSave(markdown: string): Promise<void>;
}

/** A new description starts as one empty point. */
const FIRST_POINT = "- ";

/** What the editor holds, as the description to keep: a lone empty point is none. */
export function keptDescription(value: string): string {
	return value.trim() === "-" ? "" : value;
}

/**
 * A task's description over the whole view: the title, the description as Obsidian draws it, Close and Edit. Edit, or a
 * tap on the text that is not a link, puts Obsidian's editor in its place, with Cancel and Save.
 */
export class DescriptionSheet {
	readonly el: HTMLElement;
	private readonly left: HTMLButtonElement;
	private readonly right: HTMLButtonElement;
	private readonly text: HTMLElement;
	private editing: MarkdownEditing | null = null;
	private closed = false;

	static open(root: HTMLElement, opts: DescriptionSheetOptions): DescriptionSheet {
		return new DescriptionSheet(root, opts);
	}

	private constructor(root: HTMLElement, private readonly opts: DescriptionSheetOptions) {
		this.el = el(root, "div", "tc-sheet tc-desc-sheet");
		const bar = el(this.el, "div", "tc-sheet-bar");
		this.left = el(bar, "button", "tc-sheet-cancel");
		this.left.addEventListener("click", () => this.close());
		this.right = el(bar, "button", "tc-sheet-submit");
		this.right.addEventListener("click", () => void (this.editing ? this.save() : this.edit()));
		const body = el(this.el, "div", "tc-desc-body");
		fillTitle(el(body, "div", "tc-desc-title"), opts.title);
		this.text = el(body, "div", "tc-desc-text");
		this.text.addEventListener("click", (e) => {
			if (!this.editing && !(e.target as Element).closest("a")) this.edit();
		});
		if (opts.editing || opts.markdown === null) this.edit();
		else this.read();
		requestAnimationFrame(() => this.el.classList.add("is-shown"));
	}

	private read(): void {
		this.left.textContent = "Close";
		this.right.textContent = "Edit";
		void this.opts.surface.render(this.text, this.opts.markdown ?? "");
	}

	private edit(): void {
		this.left.textContent = "Cancel";
		this.right.textContent = "Save";
		clear(this.text);
		this.text.classList.add("is-editing");
		this.editing = this.opts.surface.edit(this.text, this.opts.markdown ?? FIRST_POINT, () => this.close());
		this.editing.focus();
	}

	private async save(): Promise<void> {
		if (!this.editing || this.closed) return;
		const markdown = keptDescription(this.editing.value);
		this.close();
		await this.opts.onSave(markdown);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.editing?.destroy();
		this.el.classList.remove("is-shown");
		window.setTimeout(() => this.el.remove(), tokenMs(this.el, DURATION.fade));
	}
}
