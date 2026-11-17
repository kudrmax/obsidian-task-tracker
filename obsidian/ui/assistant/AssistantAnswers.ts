import type { AssistantContext, AssistantOffer, AssistantOutcome, AssistantPlace, AssistantService } from "../../../core/application/contracts";
import { AnswerPopup, type ContextField, type RenderMarkdown } from "./AnswerPopup";
import { type ModEnterHold, plainModEnter } from "./modEnter";

/** What «⋯» needs of the assistant: its rows, whether one runs, and a tap on a row. */
export interface AssistantRows {
	offers(place: AssistantPlace): readonly AssistantOffer[];
	readonly busy: boolean;
	onChange(listener: () => void): () => void;
	/** A tap on a row: the run starts, and its outcome shows when it comes, wherever Max is by then. */
	press(actionId: string): void;
	/** A tap on a running row (Stop): its run stops and nothing shows; nothing happens once it has ended. */
	stop(actionId: string): void;
}

/** Draws markdown for as long as a popup shows it; the returned function lets go of it. */
export type MarkdownHost = (el: HTMLElement, markdown: string) => { readonly done: Promise<void>; release(): void };

/**
 * The plugin's side of a run: it outlives the view, so an answer that comes after the view was closed still shows. An
 * answer or a failure opens the popup; the outcome's detail, when it has one (a failure's, or a write that failed while an
 * answer was marked), goes to the console once (the core has none); Stop shows nothing.
 */
export class AssistantAnswers implements AssistantRows {
	/** A press that joins a run under way gets that run's outcome: it shows once. */
	private readonly awaited = new Set<Promise<AssistantOutcome>>();

	constructor(
		private readonly service: AssistantService,
		private readonly markdown: MarkdownHost,
		private readonly log: (detail: string) => void = (detail) => console.warn(`Task Calendar assistant: ${detail}`),
		private readonly modEnter: ModEnterHold = plainModEnter,
	) {}

	offers(place: AssistantPlace): readonly AssistantOffer[] {
		return this.service.offers(place);
	}

	get busy(): boolean {
		return this.service.busy;
	}

	onChange(listener: () => void): () => void {
		return this.service.onChange(listener);
	}

	press(actionId: string): void {
		const run = this.service.press(actionId);
		if (this.awaited.has(run)) return;
		this.awaited.add(run);
		void run.then((outcome) => {
			this.awaited.delete(run);
			this.show(outcome, actionId);
		});
	}

	stop(actionId: string): void {
		this.service.stop(actionId);
	}

	/** `actionId`: the button whose run this is, pressed again by the answer's Save and ask again. */
	show(outcome: AssistantOutcome, actionId: string): AnswerPopup | null {
		if (outcome.kind === "stopped") return null;
		if (outcome.detail !== null) this.log(outcome.detail);
		const held: (() => void)[] = [];
		const render: RenderMarkdown = (el, text) => {
			const shown = this.markdown(el, text);
			held.push(() => shown.release());
			return shown.done;
		};
		const popup = AnswerPopup.open(outcome, render, outcome.kind === "task" ? this.contextField(outcome.context, actionId) : null);
		popup.onClosed(() => held.forEach((release) => release()));
		return popup;
	}

	/** The answer's field: its text written to the task the core named, and the same button pressed again after it. */
	private contextField(context: AssistantContext | null, actionId: string): ContextField | null {
		if (context === null) return null;
		return {
			words: context.words,
			write: (text) => this.service.addContext(context.taskId, text),
			again: () => this.press(actionId),
			log: this.log,
			modEnter: this.modEnter,
		};
	}
}
