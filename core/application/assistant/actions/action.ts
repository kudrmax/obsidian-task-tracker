import type { Briefing, BriefingKind } from "../briefing";
import type { JsonSchema } from "../model";
import type { AssistantPlace, TaskScope } from "../scope";
import type { TaskLookup } from "../tasks";

/** What an answer, read, comes to: a task with the model's note, or why it names none. */
export type ActionResult =
	| { readonly kind: "task"; readonly taskId: string; readonly note: string }
	/** `badAnswer`: it names no task of the question. `gone`: its task was closed or removed while the model was thinking. */
	| { readonly kind: "failed"; readonly why: "badAnswer" | "gone" };

/** A button: everything about it in one file. The machinery goes over `ASSISTANT_ACTIONS` and never names one. */
export interface AssistantAction {
	/** The key of its prompt in the settings. */
	readonly id: string;
	readonly places: readonly AssistantPlace[];
	readonly labels: { readonly idle: string; readonly running: string };
	readonly icon: string;
	/** The popup's title. */
	readonly title: string;
	readonly failureTitle: string;
	readonly scope: TaskScope;
	/** How its tasks are shown to the model: what Max can start now, or the tasks as they are. */
	readonly briefing: BriefingKind;
	readonly defaultPrompt: string;
	readonly answerSchema: JsonSchema;
	/** No tasks to send: the words shown instead of a call. */
	readonly emptyWords: string;
	/** The answer read against the briefing and the tasks as they are now. */
	read(answer: unknown, briefing: Briefing, tasks: TaskLookup): ActionResult;
}
