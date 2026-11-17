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
		expect(result).toMatchObject({ kind: "task", notice: null });
		expect(result.kind === "task" && result.task.labels.map((l) => l.name)).toEqual(["Focus"]);
	});

	it("marks a folded task's next step, not the folded task", async () => {
		const r = rig({ text: FILE, settings: settingsWith("Focus") });
		const result = await answered(r, "Find the template");
		expect(r.store.text).toContain("- [ ] Write the offer 📁\n\t- [ ] Find the template #label/Focus\n");
		expect(result.kind === "task" && result.task.title).toBe("Write the offer");
		expect(result.kind === "task" && result.card.step?.labels.map((l) => l.name)).toEqual(["Focus"]);
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
		expect(page.prompts[0].options).toEqual([
			{
				key: "label",
				label: "Label",
				choices: [
					{ value: null, title: "None" },
					{ value: "Good_fun", title: "Good fun" },
					{ value: "Focus", title: "Focus" },
				],
				value: "Focus",
			},
		]);
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
