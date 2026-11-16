import type { AssistantOffer, AssistantOutcome, AssistantPlace, AssistantService } from "../../../core/application/contracts";
import { AnswerPopup, type RenderMarkdown } from "./AnswerPopup";

/** What «⋯» needs of the assistant: its rows, whether one runs, and a tap on a row. */
export interface AssistantRows {
	offers(place: AssistantPlace): readonly AssistantOffer[];
	readonly busy: boolean;
	onChange(listener: () => void): () => void;
	/** A tap on a row: the run starts (or stops), and its outcome shows when it comes, wherever Max is by then. */
	press(actionId: string): void;
}

/** Draws markdown for as long as a popup shows it; the returned function lets go of it. */
export type MarkdownHost = (el: HTMLElement, markdown: string) => { readonly done: Promise<void>; release(): void };

/**
 * The plugin's side of a run: it outlives the view, so an answer that comes after the view was closed still shows. An
 * answer or a failure opens the popup; a failure's detail goes to the console (the core has none); Stop shows nothing.
 */
export class AssistantAnswers implements AssistantRows {
	constructor(
		private readonly service: AssistantService,
		private readonly markdown: MarkdownHost,
		private readonly log: (detail: string) => void = (detail) => console.warn(`Task Calendar assistant: ${detail}`),
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
		void this.service.press(actionId).then((outcome) => this.show(outcome));
	}

	show(outcome: AssistantOutcome): AnswerPopup | null {
		if (outcome.kind === "stopped") return null;
		if (outcome.kind === "failed") this.log(outcome.detail);
		const held: (() => void)[] = [];
		const render: RenderMarkdown = (el, text) => {
			const shown = this.markdown(el, text);
			held.push(() => shown.release());
			return shown.done;
		};
		const popup = AnswerPopup.open(outcome, render);
		popup.onClosed(() => held.forEach((release) => release()));
		return popup;
	}
}
