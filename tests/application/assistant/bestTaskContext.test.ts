import { describe, expect, it } from "vitest";
import type { AssistantAction } from "../../../core/application/assistant/actions/action";
import { ASSISTANT_ACTIONS } from "../../../core/application/assistant/actions";
import { bestTask } from "../../../core/application/assistant/actions/bestTask";
import type { AssistantOutcome } from "../../../core/application/contracts";
import { DEFAULT_SETTINGS } from "../../../core/settings";
import { type Rig, rig, settle } from "./assistantFakes";

const BEST = "bestTask";

const FILE = [
	"## Now",
	"",
	"- [ ] Pay rent",
	"\t- Landlord's card",
	"- [ ] Write the offer 📁",
	"\t- [ ] Find the template",
	"\t- [ ] Send it",
	"- [ ] Plan the trip",
	"\t- [ ] Book the flight",
	"",
	"## Soon",
	"",
	"## Done",
	"",
].join("\n");

const WORDS = { placeholder: "What did Claude miss?", save: "Save", saveAndAsk: "Save and ask again", failed: "Couldn't save to this task." };

async function answered(r: Rig, title: string): Promise<AssistantOutcome> {
	const outcome = r.assistant.press(BEST);
	await settle();
	r.transport.answer({ taskRef: r.transport.refOf(title), reason: "Because." }, r.transport.asked.length - 1);
	return outcome;
}

async function idOf(r: Rig, title: string): Promise<string> {
	const all = (await r.tasks.listed()).lists.now.flatMap((t) => [t, ...t.allSubtasks]);
	return all.find((t) => t.title === title)!.id;
}

function plain(): Rig {
	return rig({ text: FILE, settings: DEFAULT_SETTINGS });
}

describe("Best task's answer offers a field for what Claude missed", () => {
	it("carries the field's words and the chosen task's id", async () => {
		const r = plain();
		const result = await answered(r, "Pay rent");
		expect(result.kind === "task" && result.context).toEqual({ taskId: await idOf(r, "Pay rent"), words: WORDS });
	});

	it("names the step Claude chose, not the folded task its card is drawn on", async () => {
		const r = plain();
		const result = await answered(r, "Find the template");
		expect(result.kind === "task" && result.task.title).toBe("Write the offer");
		expect(result.kind === "task" && result.context?.taskId).toBe(await idOf(r, "Find the template"));
	});

	it("an action without the field gives none", async () => {
		const plainAction: AssistantAction = { ...bestTask, id: "plain", context: undefined };
		const r = rig({ text: FILE, settings: DEFAULT_SETTINGS, actions: [...ASSISTANT_ACTIONS, plainAction] });
		const outcome = r.assistant.press("plain");
		await settle();
		r.transport.answer({ taskRef: r.transport.refOf("Pay rent"), reason: "Rent." });
		expect(await outcome).toMatchObject({ kind: "task", context: null });
	});

	it("tells Claude in its default prompt that a context line is Max's own, to be trusted", () => {
		expect(bestTask.defaultPrompt).toContain("«Контекст:»");
	});
});

describe("Saving what Claude missed", () => {
	it("adds the line at the end of the chosen task's description", async () => {
		const r = plain();
		expect(await r.assistant.addContext(await idOf(r, "Pay rent"), "  Takes\n a minute ")).toEqual({ ok: true });
		expect(r.store.text).toContain("- [ ] Pay rent\n\t- Landlord's card\n\t- Контекст: Takes a minute\n- [ ] Write the offer");
	});

	it("goes under the step itself for a folded task's step, before nothing of the folded task", async () => {
		const r = plain();
		const result = await answered(r, "Find the template");
		expect(result.kind === "task").toBe(true);
		if (result.kind !== "task" || !result.context) return;
		expect(await r.assistant.addContext(result.context.taskId, "Sixth event")).toEqual({ ok: true });
		expect(r.store.text).toContain("\t- [ ] Find the template\n\t\t- Контекст: Sixth event\n\t- [ ] Send it");
	});

	it("is one step to undo", async () => {
		const r = plain();
		await r.assistant.addContext(await idOf(r, "Book the flight"), "Cheap now");
		expect(r.store.text).toContain("\t- [ ] Book the flight\n\t\t- Контекст: Cheap now\n");
		expect(await r.undo.undo()).toBe("done");
		expect(r.store.text).toBe(FILE);
		expect(r.undo.canUndo()).toBe(false);
	});

	it("writes nothing for a blank text, and says it went fine", async () => {
		const r = plain();
		expect(await r.assistant.addContext(await idOf(r, "Pay rent"), " \n ")).toEqual({ ok: true });
		expect(r.store.text).toBe(FILE);
		expect(r.undo.canUndo()).toBe(false);
	});

	it("fails with the field's words on a task closed meanwhile, writing nothing", async () => {
		const r = plain();
		const id = await idOf(r, "Pay rent");
		const rent = (await r.tasks.listed()).lists.now.find((t) => t.id === id)!;
		await r.tasks.toggleDone(rent.key);
		const before = r.store.text;
		const result = await r.assistant.addContext(id, "Too late");
		expect(result).toMatchObject({ ok: false, words: "Couldn't save to this task." });
		expect(result.ok === false && result.detail).toMatch(/closed/);
		expect(r.store.text).toBe(before);
	});

	it("fails with the field's words on a task removed meanwhile", async () => {
		const r = plain();
		const result = await r.assistant.addContext("no-such-id", "Gone");
		expect(result).toMatchObject({ ok: false, words: "Couldn't save to this task." });
		expect(r.store.text).toBe(FILE);
	});

	it("fails with the field's words when the file can't be written", async () => {
		const r = rig({
			text: FILE,
			settings: DEFAULT_SETTINGS,
			tasksPort: (tasks) => Object.assign(Object.create(tasks) as typeof tasks, { addContext: async () => Promise.reject(new Error("disk full")) }),
		});
		const result = await r.assistant.addContext(await idOf(r, "Pay rent"), "Note");
		expect(result).toEqual({ ok: false, words: "Couldn't save to this task.", detail: "Error: disk full" });
	});

	it("reaches Claude in the next question as part of the description", async () => {
		const r = plain();
		await r.assistant.addContext(await idOf(r, "Pay rent"), "Takes a minute");
		r.assistant.press(BEST);
		await settle();
		const candidates = JSON.parse(r.transport.asked[0].question.input).candidates as { title: string; description: string | null }[];
		expect(candidates.find((c) => c.title === "Pay rent")!.description).toContain("- Контекст: Takes a minute");
	});
});
