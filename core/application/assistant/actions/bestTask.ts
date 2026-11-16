import type { AssistantAction } from "./action";

/** Of the tasks in Today and Soon, the one with the most impact, and why. */
export const bestTask: AssistantAction = {
	id: "bestTask",
	places: ["more"],
	labels: { idle: "Best task", running: "Stop" },
	icon: "sparkles",
	title: "Best task",
	failureTitle: "Couldn't find the best task",
	scope: { kind: "lists", lists: ["now", "soon"] },
	defaultPrompt:
		"You help me choose what to do. Below are my tasks for today and for soon. If I could do only one of them and nothing else, which one would make the biggest difference? Weigh impact over urgency; a task in progress or with a time today counts for more only if it truly matters more. Answer with its ref, and in two or three short sentences in the language of my tasks, say why this one.",
	answerSchema: {
		type: "object",
		properties: { taskRef: { type: "string" }, reason: { type: "string" } },
		required: ["taskRef", "reason"],
		additionalProperties: false,
	},
	emptyWords: "Today and Soon have no open tasks.",
	read(answer, briefing, tasks) {
		const { taskRef, reason } = (answer ?? {}) as { taskRef?: unknown; reason?: unknown };
		if (typeof taskRef !== "string" || typeof reason !== "string" || !Object.prototype.hasOwnProperty.call(briefing.refs, taskRef)) return { kind: "failed", why: "badAnswer" };
		const task = tasks.find(briefing.refs[taskRef]);
		if (!task?.open) return { kind: "failed", why: "gone" };
		return { kind: "task", taskId: task.id, note: reason };
	},
};
