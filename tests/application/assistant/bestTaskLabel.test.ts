import { describe, expect, it } from "vitest";
import type { AssistantOutcome } from "../../../core/application/contracts";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../../core/settings";
import { type Rig, rig, settle } from "./assistantFakes";

const BEST = "bestTask";

const FILE = [
	"## Now",
	"",
	"- [ ] Pay rent",
	"- [ ] p1 Sign the lease",
	"- [ ] Write the offer 📁",
	"\t- [ ] Find the template",
	"\t- [ ] Send it",
	"- [ ] Old focus #label/Focus",
	"- [ ] Plan the trip",
	"\t- [ ] Book the flight",
	"",
	"## Soon",
	"",
	"- [ ] Call the bank #label/Focus #label/Good_fun",
	"",
	"## Done",
	"",
	"- [x] Finished #label/Focus",
	"",
].join("\n");

const LABELS = [
	{ name: "Good_fun", color: "red" },
	{ name: "Focus", color: "orange" },
] as const;

function settingsWith(label: string | null): TaskCalendarSettings {
	return {
		...DEFAULT_SETTINGS,
		labels: [...LABELS],
		assistant: { ...DEFAULT_SETTINGS.assistant, options: label === null ? {} : { bestTask: { label } } },
	};
}

async function answered(r: Rig, title: string): Promise<AssistantOutcome> {
	const outcome = r.assistant.press(BEST);
	await settle();
	r.transport.answer({ taskRef: r.transport.refOf(title), reason: "Because." });
	return outcome;
}

describe("Best task marks its answer with the label set", () => {
	it("puts it on a plain task and takes it off every other task, a done one too", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Pay rent");
		const text = r.store.text!;
		expect(text).toContain("- [ ] Pay rent #label/Focus");
		expect(text).toContain("- [ ] Old focus\n");
		expect(text).toContain("- [ ] Call the bank #label/Good_fun\n");
		expect(text).toContain("- [x] Finished\n");
		expect(result).toMatchObject({ kind: "task", notice: null, detail: null });
		expect(result.kind === "task" && result.task.labels.map((l) => l.name)).toEqual(["Focus"]);
	});

	it("marks the card the answer is drawn on: a folded task's next step marks the folded task, as its card's menu does", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Find the template");
		expect(result.kind === "task" && result.task.title).toBe("Write the offer");
		expect(result.kind === "task" && result.task.labels.map((l) => l.name)).toEqual(["Focus"]);
		expect(r.store.text).toContain("\t- [ ] Find the template\n");
		expect(r.store.text).not.toContain("Old focus #label");
	});

	it("an unfolded task's subtask is marked itself", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Book the flight");
		expect(r.store.text).toContain("- [ ] Plan the trip\n\t- [ ] Book the flight #label/Focus\n");
		expect(result.kind === "task" && result.task.labels.map((l) => l.name)).toEqual(["Focus"]);
	});

	it("is one step to undo: one Undo takes the label back off and puts it back on the others", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		await answered(r, "Pay rent");
		expect(r.store.text).not.toBe(FILE);
		expect(await r.undo.undo()).toBe("done");
		expect(r.store.text).toBe(FILE);
		expect(r.undo.canUndo()).toBe(false);
		expect(await r.undo.redo()).toBe("done");
		expect(r.store.text).toContain("- [ ] Pay rent #label/Focus");
		expect(r.store.text).toContain("- [x] Finished\n");
	});

	it("moves no label on a run stopped or timed out after the answer came", async () => {
		const stopped = rig({ text: FILE, settings: settingsWith("Focus") });
		const outcome = stopped.assistant.press(BEST);
		await settle();
		stopped.transport.answer({ taskRef: stopped.transport.refOf("Pay rent"), reason: "Rent." });
		stopped.assistant.stop(BEST);
		expect(await outcome).toEqual({ kind: "stopped" });
		await settle();
		expect(stopped.store.text).toBe(FILE);

		const late = rig({ text: FILE, settings: settingsWith("Focus") });
		const lateOutcome = late.assistant.press(BEST);
		await settle();
		late.transport.answer({ taskRef: late.transport.refOf("Pay rent"), reason: "Rent." });
		late.timers.fire();
		expect(await lateOutcome).toMatchObject({ kind: "failed", words: "Claude didn't answer in 2 minutes." });
		await settle();
		expect(late.store.text).toBe(FILE);
	});

	it("Stop pressed once the marking has begun is too late: the marking ends and the run ends with the answer", async () => {
		let pressStop: () => void = () => {};
		const r = rig({
			text: FILE,
			settings: settingsWith("Focus"),
			tasksPort: (tasks) => ({
				listed: () => tasks.listed(),
				sectionOffer: (date) => tasks.sectionOffer(date),
				menu: (item, from, screen) => tasks.menu(item, from, screen),
				toggleLabel: async (keys, name) => {
					pressStop();
					return tasks.toggleLabel(keys, name);
				},
			}),
		});
		pressStop = () => r.assistant.stop(BEST);
		const result = await answered(r, "Pay rent");
		expect(result).toMatchObject({ kind: "task", notice: null });
		expect(r.store.text).toContain("- [ ] Pay rent #label/Focus");
		expect(r.store.text).toContain("- [x] Finished\n");
		expect(r.assistant.busy).toBe(false);
	});

	it("the timeout firing once the marking has begun waits for it too", async () => {
		let fire: () => void = () => {};
		const r = rig({
			text: FILE,
			settings: settingsWith("Focus"),
			tasksPort: (tasks) => ({
				listed: () => tasks.listed(),
				sectionOffer: (date) => tasks.sectionOffer(date),
				menu: (item, from, screen) => tasks.menu(item, from, screen),
				toggleLabel: async (keys, name) => {
					fire();
					return tasks.toggleLabel(keys, name);
				},
			}),
		});
		fire = () => {
			while (r.timers.pending.size > 0) r.timers.fire();
		};
		const result = await answered(r, "Pay rent");
		expect(result).toMatchObject({ kind: "task", notice: null });
		expect(r.store.text).not.toContain("Old focus #label");
	});

	it("a write that fails while marking still shows the answer, with a line under it and the error for the console", async () => {
		const r = rig({
			text: FILE,
			settings: settingsWith("Focus"),
			tasksPort: (tasks) => ({
				listed: () => tasks.listed(),
				sectionOffer: (date) => tasks.sectionOffer(date),
				menu: (item, from, screen) => tasks.menu(item, from, screen),
				toggleLabel: () => Promise.reject(new Error("disk full")),
			}),
		});
		const result = await answered(r, "Pay rent");
		expect(result).toMatchObject({ kind: "task", note: "Because.", notice: "Couldn't move the label Focus." });
		expect(result.kind === "task" && result.task.title).toBe("Pay rent");
		expect(result.kind === "task" && result.detail).toContain("disk full");
	});

	it("an answer whose task is gone only after the marking is still shown as it stood", async () => {
		const r = rig({
			text: FILE,
			settings: settingsWith("Focus"),
			tasksPort: (tasks) => {
				let marked = false;
				return {
					listed: async () => (marked ? { ...(await tasks.listed()), lists: { now: [], soon: [], inbox: [], backlog: [], done: [] } } : tasks.listed()),
					sectionOffer: (date) => tasks.sectionOffer(date),
					menu: (item, from, screen) => tasks.menu(item, from, screen),
					toggleLabel: async (keys, name) => {
						marked = true;
						return tasks.toggleLabel(keys, name);
					},
				};
			},
		});
		const result = await answered(r, "Pay rent");
		expect(result).toMatchObject({ kind: "task", notice: null, detail: null });
		expect(result.kind === "task" && result.task.title).toBe("Pay rent");
	});

	it("is refused where the menu would refuse it (a task with a priority): nothing changes, the popup says so", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Sign the lease");
		expect(r.store.text).toBe(FILE);
		expect(result).toMatchObject({ kind: "task", notice: "Couldn't add the label Focus to this task." });
	});

	it("names the label as the screen shows it in the refusal", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Good_fun") });
		const result = await answered(r, "Sign the lease");
		expect(result).toMatchObject({ kind: "task", notice: "Couldn't add the label Good fun to this task." });
	});

	it("leaves it on a chosen task that has it already and takes it off the others", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Call the bank");
		const text = r.store.text!;
		expect(text).toContain("- [ ] Call the bank #label/Focus #label/Good_fun\n");
		expect(text).toContain("- [ ] Old focus\n");
		expect(text).toContain("- [x] Finished\n");
		expect(result).toMatchObject({ kind: "task", notice: null });
	});

	it("with no label set writes nothing", async () => {
		const r = rig({ text: FILE, settings: settingsWith(null) });
		const result = await answered(r, "Pay rent");
		expect(r.store.text).toBe(FILE);
		expect(result).toMatchObject({ kind: "task", notice: null });
	});

	it("a label no longer in the settings reads as none: nothing is written", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Gone") });
		await answered(r, "Pay rent");
		expect(r.store.text).toBe(FILE);
	});

	it("a failure, a bad answer or Stop touch no label", async () => {
		const failed = rig({ text: FILE, settings: settingsWith("Focus") });
		const outcome = failed.assistant.press(BEST);
		await settle();
		failed.transport.reply({ ok: false, failure: { kind: "limit", detail: "x" } });
		expect(await outcome).toMatchObject({ kind: "failed" });
		expect(failed.store.text).toBe(FILE);

		const bad = rig({ text: FILE, settings: settingsWith("Focus") });
		const badOutcome = bad.assistant.press(BEST);
		await settle();
		bad.transport.answer({ taskRef: "t99", reason: "?" });
		expect(await badOutcome).toMatchObject({ kind: "failed" });
		expect(bad.store.text).toBe(FILE);

		const stopped = rig({ text: FILE, settings: settingsWith("Focus") });
		const stoppedOutcome = stopped.assistant.press(BEST);
		await settle();
		stopped.assistant.stop(BEST);
		expect(await stoppedOutcome).toEqual({ kind: "stopped" });
		await settle();
		expect(stopped.store.text).toBe(FILE);
	});

	it("a task closed during the wait (gone) touches no label", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const outcome = r.assistant.press(BEST);
		await settle();
		const rent = (await r.tasks.listed()).lists.now.find((t) => t.title === "Pay rent")!;
		await r.tasks.setStatus(rent.key, "done");
		const before = r.store.text;
		r.transport.answer({ taskRef: r.transport.refOf("Pay rent"), reason: "Rent." });
		expect(await outcome).toMatchObject({ kind: "failed" });
		expect(r.store.text).toBe(before);
	});
});

describe("the Assistant page's Label row", () => {
	it("offers None and the labels in the settings' order, by the titles the screen shows, the saved one current", async () => {
		const { assistant } = rig({ text: FILE, settings: settingsWith("Focus") });
		const page = await assistant.page();
		expect(page.prompts[0].options[0]).toEqual({
			key: "label",
			label: "Label",
			choices: [
				{ value: null, title: "None" },
				{ value: "Good_fun", title: "Good fun" },
				{ value: "Focus", title: "Focus" },
			],
			value: "Focus",
		});
	});

	it("shows None for no label and for a label gone from the settings", async () => {
		expect((await rig({ text: FILE, settings: settingsWith(null) }).assistant.page()).prompts[0].options[0].value).toBeNull();
		expect((await rig({ text: FILE, settings: settingsWith("Gone") }).assistant.page()).prompts[0].options[0].value).toBeNull();
	});

	it("writes a choice, and None takes it off", async () => {
		const { assistant, settings } = rig({ text: FILE, settings: settingsWith(null) });
		await assistant.set({ kind: "option", actionId: BEST, key: "label", value: "Good_fun" });
		expect(settings.get().assistant.options).toEqual({ bestTask: { label: "Good_fun" } });
		expect((await assistant.page()).prompts[0].options[0].value).toBe("Good_fun");
		await assistant.set({ kind: "option", actionId: BEST, key: "label", value: null });
		expect(settings.get().assistant.options).toEqual({});
	});
});
