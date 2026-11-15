import type { TaskItem } from "../../../core/application/contracts";
import { el } from "../dom";
import { showFace } from "../TaskCard";
import { fillTitle } from "../TaskTitle";
import { QuickField, type QuickFieldHandle } from "./QuickField";
import type { TitleFieldFactory } from "./TitleField";

export interface FirstStepFieldOptions {
	readonly item: TaskItem;
	/** The card the menu was opened from: a list's card, or a timeline block. */
	readonly source: HTMLElement;
	readonly titleField: TitleFieldFactory;
	/** What was typed, on Enter or a tap elsewhere; null on Escape. Called once; resolves once the screen may draw again. */
	onDone(text: string | null): Promise<void>;
}

/** The mark of a card or a block turned into First step's field. */
const TYPING = "is-first-step";

/**
 * First step typed on the card itself: a list's card becomes the folded card the core draws for it
 * (`TaskItem.firstStepCard`), the task's title small on top, and its step line is the quick entry's field, empty, the
 * caret in it; a timeline block, which shows only its step's line, has that line become the field. Enter or a tap
 * elsewhere hands over what was typed, Escape nothing; the field never opens another after it.
 */
export class FirstStepField {
	private readonly card: HTMLElement;
	private readonly line: HTMLElement;
	private readonly field: QuickFieldHandle;
	private done = false;

	static open(opts: FirstStepFieldOptions): FirstStepField {
		return new FirstStepField(opts);
	}

	private constructor(private readonly opts: FirstStepFieldOptions) {
		const block = opts.source.querySelector<HTMLElement>(":scope > .tc-block-card");
		this.card = block ?? opts.source;
		if (!block) showFace(this.card, opts.item.firstStepCard);
		this.card.classList.add(TYPING);
		const title = this.card.querySelector<HTMLElement>(":scope > .tc-card-lines > .tc-card-title, :scope > .tc-card-title");
		this.line = el(null, "div", "tc-first-step");
		if (title) title.replaceWith(this.line);
		else this.card.prepend(this.line);
		this.field = QuickField.open(this.line, {
			value: "",
			tint: null,
			placeholder: "First step",
			titleField: opts.titleField,
			onInput: () => undefined,
			onKey: (key) => {
				if (key === "enter") this.finish(this.field.text);
				else if (key === "escape") this.finish(null);
			},
			onBlur: () => this.blurred(),
		});
		this.field.focus();
		this.card.scrollIntoView({ block: "nearest" });
	}

	/** Part of the typing: a tap there is not a tap elsewhere. */
	owns(target: Element): boolean {
		return this.field.owns(target);
	}

	/** The field lost the focus: once it has not taken it back (its editor's own popups take it for a moment), a tap elsewhere. */
	private blurred(): void {
		window.setTimeout(() => {
			if (!this.done && !this.field.focused) this.finish(this.field.text);
		});
	}

	/** The text typed stays on the step line, plain, until the screen draws what was written; Escape leaves it to the screen at once. */
	private finish(text: string | null): void {
		if (this.done) return;
		this.done = true;
		this.field.destroy();
		this.line.replaceWith(this.typed(text));
		void this.opts.onDone(text).finally(() => this.card.classList.remove(TYPING));
	}

	private typed(text: string | null): HTMLElement {
		const line = el(null, "div", "tc-card-title");
		if (text !== null) fillTitle(line, text);
		return line;
	}
}
