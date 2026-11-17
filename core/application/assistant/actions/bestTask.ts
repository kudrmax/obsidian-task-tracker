import type { Briefing } from "../briefing";
import { answerLabel } from "../options/answerLabel";
import { skipLabel } from "../options/skipLabel";
import type { AssistantAction } from "./action";

/** Of what Max can start now in Today and Soon (`candidatesOf`), but for the tasks marked with the skip label, the one that changes his life the most, and why. A goal is never the answer: it has no ref. */
export const bestTask: AssistantAction = {
	id: "bestTask",
	places: ["more"],
	labels: { idle: "Best task", running: "Stop" },
	icon: "sparkles",
	title: "Best task",
	failureTitle: "Couldn't find the best task",
	scope: { kind: "lists", lists: ["now", "soon"] },
	briefing: "candidates",
	defaultPrompt:
		"You help me choose the one task that matters most. Below is each thing I could start now: a task, or the next step of a bigger task, with the goals above it and, for a step, the steps after it. Pick the one whose doing would change my life the most: what becomes different for me — my relationships, health, money, work, home, freedom — once it is done. Judge by meaning, not by how the task sounds: a step is not more important because it is big, concrete, ends in a finished product or sounds responsible; a short task can matter more than a long one. Count only what this step itself gives: its goals show what it is for, but what the goals or the steps after it would give is not done by it. A due date is urgency, not impact. Don't invent what a task is for; judge by what is written. Answer with its ref, and in two or three short sentences in the language of my tasks, say what changes in my life when this one is done; don't speak about the other tasks.",
	answerSchema: {
		type: "object",
		properties: { taskRef: { type: "string" }, reason: { type: "string" } },
		required: ["taskRef", "reason"],
		additionalProperties: false,
	},
	emptyWords: "Today and Soon have no open tasks.",
	options: [answerLabel, skipLabel],
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
