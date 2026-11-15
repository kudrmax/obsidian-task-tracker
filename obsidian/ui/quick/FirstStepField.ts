import type { TaskItem, TaskKey } from "../../../core/application/contracts";
import { el } from "../dom";
import type { GestureArbiter } from "../gestures";
import { fillTitle } from "../TaskTitle";
import { QuickField, type QuickFieldHandle } from "./QuickField";
import type { TitleFieldFactory } from "./TitleField";

export interface FirstStepFieldOptions {
	/** The card the menu was opened from, drawn as the core draws it while the field is open: a list's card, or a timeline block. */
	readonly source: HTMLElement;
	readonly titleField: TitleFieldFactory;
	/** What was typed, on Enter or a tap elsewhere; null on Escape. Called once; resolves once the screen may draw again. */
	onDone(text: string | null): Promise<void>;
}

/** The mark of a card or a block turned into First step's field. */
const TYPING = "is-first-step";

/**
 * First step typed on the card itself. The screen has drawn the card as the core draws it while the field is open
 * (`TaskService.firstStepScreen`): a list's card folded, the task's title small on top over an empty step line, a
 * timeline block with an empty line. That line becomes the quick entry's field, the caret in it. Enter or a tap
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
		this.card = opts.source.querySelector<HTMLElement>(":scope > .tc-block-card") ?? opts.source;
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

export interface FirstStepTypingDeps {
	/** One gesture at a time: the screen draws nothing under the field while it holds the screen. */
	readonly arbiter: Pick<GestureArbiter, "busy" | "claim" | "release">;
	readonly titleField: TitleFieldFactory;
	/** The data the screen draws is the core's while the field is open on `key` (`DayData.typeFirstStep`); null: as read. */
	fold(key: TaskKey | null): void;
	/** The screen draws its data now, with the list's own motion. */
	draw(): void;
	/** What was typed, written (`TaskService.firstStep`) and read back; a stale key is the writer's to tell. */
	write(key: TaskKey, text: string): Promise<void>;
	onError(error: unknown): void;
}

/** The screen's lock while First step's field is open. */
const LOCK = "first step";

/**
 * First step from a card's menu, in the tap that picked it: the screen draws the task folded (the core's
 * `firstStepScreen`), so its subtasks leave the lists with the motion of any fold, and its card becomes the field. Enter
 * or a tap elsewhere writes what was typed; Escape writes nothing. Either way the screen is let go and drawn as the file
 * then stands: folded on the new step, or as it was (the subtasks come back with the same motion).
 */
export class FirstStepTyping {
	constructor(private readonly deps: FirstStepTypingDeps) {}

	open(item: TaskItem, source: HTMLElement): void {
		const { arbiter } = this.deps;
		if (!source.isConnected || arbiter.busy) return;
		this.deps.fold(item.key);
		this.deps.draw();
		if (!source.isConnected || !arbiter.claim(LOCK)) {
			this.deps.fold(null);
			this.deps.draw();
			return;
		}
		FirstStepField.open({ source, titleField: this.deps.titleField, onDone: (text) => this.done(item.key, text) });
	}

	private async done(key: TaskKey, text: string | null): Promise<void> {
		try {
			if (text !== null) await this.deps.write(key, text);
		} catch (error) {
			this.deps.onError(error);
		} finally {
			this.deps.fold(null);
			this.deps.arbiter.release(LOCK);
			this.deps.draw();
		}
	}
}
