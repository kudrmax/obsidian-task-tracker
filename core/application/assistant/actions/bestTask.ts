import type { Briefing } from "../briefing";
import type { AssistantAction } from "./action";

/** Of what Max can start now in Today and Soon (`candidatesOf`), the one with the most impact, and why. A goal is never the answer: it has no ref. */
export const bestTask: AssistantAction = {
	id: "bestTask",
	places: ["more"],
	labels: { idle: "Best task", running: "Stop" },
	icon: "sparkles",
	title: "Best task",
	failureTitle: "Couldn't find the best task",
	scope: { kind: "lists", lists: ["now", "soon"] },
	defaultPrompt:
		"You help me choose what to do next. Below is each thing I could start now: a task, or the next step of a bigger task, with the goals it leads to and, for a step, the steps that come after it. If I could do only one of them and nothing else, which one would make the biggest difference? Judge what doing this one now gives: a goal adds weight only as far as this step truly moves it, and the steps after it are not done by it. Weigh impact over urgency; one in progress or with a time today counts for more only if it truly matters more. Answer with its ref, and in two or three short sentences in the language of my tasks, say why this one.",
	answerSchema: {
		type: "object",
		properties: { taskRef: { type: "string" }, reason: { type: "string" } },
		required: ["taskRef", "reason"],
		additionalProperties: false,
	},
	emptyWords: "Today and Soon have no open tasks.",
	read(answer, briefing, tasks) {
		const { taskRef, reason } = (answer ?? {}) as { taskRef?: unknown; reason?: unknown };
		if (typeof taskRef !== "string" || typeof reason !== "string" || !isCandidate(briefing, taskRef)) return { kind: "failed", why: "badAnswer" };
		const task = tasks.find(briefing.refs[taskRef]);
		if (!task?.open) return { kind: "failed", why: "gone" };
		return { kind: "task", taskId: task.id, note: reason };
	},
};

/** A ref the briefing gave a candidate: a goal's id, a step after, a made-up ref are none. */
function isCandidate(briefing: Briefing, ref: string): boolean {
	return Object.prototype.hasOwnProperty.call(briefing.refs, ref);
}
