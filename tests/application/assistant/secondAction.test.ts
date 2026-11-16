import { describe, expect, it } from "vitest";
import type { AssistantAction } from "../../../core/application/assistant/actions/action";
import { ASSISTANT_ACTIONS } from "../../../core/application/assistant/actions";
import { SCOPE_NEEDS, targetOfPlace } from "../../../core/application/assistant/scope";
import { rig, settle } from "./assistantFakes";

/** R1's proof: a button is one action, added here alone; no other file changes. */
const firstStep: AssistantAction = {
	id: "firstStep",
	places: ["task"],
	labels: { idle: "Suggest a first step", running: "Stop" },
	icon: "footprints",
	title: "First step",
	failureTitle: "Couldn't suggest a first step",
	scope: { kind: "target" },
	defaultPrompt: "Suggest the first small step of this task.",
	answerSchema: { type: "object", properties: { taskRef: { type: "string" }, step: { type: "string" } }, required: ["taskRef", "step"] },
	emptyWords: "This task is closed.",
	read(answer, briefing, tasks) {
		const { taskRef, step } = answer as { taskRef: string; step: string };
		const id = briefing.refs[taskRef];
		const task = id ? tasks.find(id) : null;
		return task ? { kind: "task", taskId: task.id, note: step } : { kind: "failed", why: "badAnswer" };
	},
};

describe("a second button, added in this file alone", () => {
	const actions = [...ASSISTANT_ACTIONS, firstStep];

	it("is offered in its place only, and its places give what it reads", () => {
		const { assistant } = rig({ actions });
		expect(assistant.offers("more").map((o) => o.actionId)).toEqual(["bestTask"]);
		expect(assistant.offers("task").map((o) => o.label)).toEqual(["Suggest a first step"]);
		for (const place of firstStep.places) expect(SCOPE_NEEDS[firstStep.scope.kind](targetOfPlace(place))).toBe(true);
	});

	it("sends its tasks with its prompt and schema, and reads the answer its way", async () => {
		const { assistant, transport, tasks } = rig({ actions });
		const bank = (await tasks.listed()).lists.soon[0];
		const target = { place: "task" as const, taskIds: [bank.id] };
		const outcome = assistant.press("firstStep", target);
		expect(assistant.offers("task", target)[0]).toMatchObject({ label: "Stop", running: true });
		expect(assistant.offers("task", { place: "task", taskIds: ["other"] })[0]).toMatchObject({ running: false });
		await settle();
		const { question } = transport.asked[0];
		expect(question.instructions).toBe("Suggest the first small step of this task.");
		expect(question.answerSchema).toBe(firstStep.answerSchema);
		expect(JSON.parse(question.input).candidates.map((t: { title: string }) => t.title)).toEqual(["Find the contract"]);
		transport.answer({ taskRef: "t1", step: "Find the number." });
		expect(await outcome).toMatchObject({ kind: "task", title: "First step", note: "Find the number." });
	});

	it("has its prompt on the page", async () => {
		const { assistant } = rig({ actions });
		expect((await assistant.page()).prompts.map((p) => p.actionId)).toEqual(["bestTask", "firstStep"]);
	});
});
