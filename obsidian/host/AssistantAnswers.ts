import type { AssistantContext, AssistantOffer, AssistantOutcome, AssistantService } from "../../core/application/contracts";
import type { CorePort, MoreAssistant } from "../adapters/CorePort";
import { type AnswerHost, showAnswer } from "../ui/engine/mount";
import type { AnswerField } from "../ui/engine/port";

/** What an answer is drawn with once it comes: the port that turns it into the engine's words, the host's parts, the window it shows in. */
export interface AnswerPlace {
	readonly port: CorePort;
	readonly host: AnswerHost;
	readonly doc: Document;
}

/**
 * The plugin's side of the assistant's runs (F261–F266, F312): «⋯»'s rows as the core offers them, and each run's outcome
 * shown when it comes, wherever Max is by then: it outlives the view, so an answer that comes after the view was closed
 * still shows. A press that joins a run under way gets that run's outcome once; Stop shows nothing; an outcome's detail
 * (a failure's, a write that failed while an answer was marked) goes to the console once.
 */
export class AssistantAnswers implements MoreAssistant {
	private readonly awaited = new Set<Promise<AssistantOutcome>>();

	constructor(
		private readonly service: AssistantService,
		private readonly place: () => Promise<AnswerPlace>,
		private readonly log: (detail: string) => void = (detail) => console.warn(`Task Calendar assistant: ${detail}`),
	) {}

	offers(): readonly AssistantOffer[] {
		return this.service.offers("more");
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
			void this.show(outcome, actionId);
		});
	}

	stop(actionId: string): void {
		this.service.stop(actionId);
	}

	private async show(outcome: AssistantOutcome, actionId: string): Promise<void> {
		if (outcome.kind === "stopped") return;
		if (outcome.detail !== null) this.log(outcome.detail);
		const { port, host, doc } = await this.place();
		showAnswer(doc, host, port.answerOf(outcome, outcome.kind === "task" ? this.field(outcome.context, actionId) : null));
	}

	/** The answer's field: its text written to the task the model chose, and the same button pressed again after it. */
	private field(context: AssistantContext | null, actionId: string): AnswerField | null {
		if (context === null) return null;
		const { words, taskId } = context;
		return {
			placeholder: words.placeholder,
			save: words.save,
			saveAndAsk: words.saveAndAsk,
			write: async (text) => {
				const result = await this.service.addContext(taskId, text);
				if (result.ok) return null;
				this.log(result.detail);
				return result.words;
			},
			again: () => this.press(actionId),
		};
	}
}
