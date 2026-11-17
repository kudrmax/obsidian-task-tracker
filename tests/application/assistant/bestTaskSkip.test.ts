import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../../../core/settings";
import { type Rig, rig, settle } from "./assistantFakes";

const FILE = [
	"## Now",
	"",
	"- [ ] Pay rent",
	"- [ ] Fix the bike #label/Blocked",
	"- [ ] Write the offer 📁",
	"\t- [ ] Find the template #label/Blocked",
	"\t- [ ] Send it",
	"- [ ] Move house #label/Blocked",
	"\t- [ ] Pack the books",
	"- [ ] Plan the trip",
	"\t- [ ] Book the flight #label/Blocked",
	"\t- [ ] Buy a guide",
	"",
	"## Soon",
	"",
	"- [ ] Call the bank #label/Focus",
	"",
].join("\n");

const LABELS = [
	{ name: "Focus", color: "orange" },
	{ name: "Blocked", color: "red" },
] as const;

function settingsWith(options: Record<string, string>): TaskCalendarSettings {
	return { ...DEFAULT_SETTINGS, labels: [...LABELS], assistant: { ...DEFAULT_SETTINGS.assistant, options: { bestTask: options } } };
}

async function asked(r: Rig): Promise<string[]> {
	void r.assistant.press("bestTask");
	await settle();
	return (JSON.parse(r.transport.asked[0].question.input).candidates as { title: string }[]).map((c) => c.title);
}

describe("Best task leaves out the tasks marked with the skip label", () => {
	it("sends no task carrying it, nor any task under it", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ skip: "Blocked" }) });
		expect(await asked(r)).toEqual(["Pay rent", "Buy a guide", "Call the bank"]);
	});

	it("a folded task whose next step carries it sends nothing: its steps go in order", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ skip: "Blocked" }) });
		expect(await asked(r)).not.toContain("Send it");
	});

	it("with None every task is sent as before", async () => {
		const r = rig({ text: FILE, settings: settingsWith({}) });
		expect(await asked(r)).toEqual(["Pay rent", "Fix the bike", "Find the template", "Pack the books", "Book the flight", "Buy a guide", "Call the bank"]);
	});

	it("a label renamed or removed in the settings reads as None", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ skip: "Gone" }) });
		expect(await asked(r)).toContain("Fix the bike");
	});

	it("when it leaves nothing, no question is asked and the popup says why", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ skip: "Blocked" }) });
		const text = ["## Now", "", "- [ ] Fix the bike #label/Blocked", ""].join("\n");
		const only = rig({ text, settings: r.settings.get() });
		const outcome = await only.assistant.press("bestTask");
		expect(outcome).toMatchObject({ kind: "failed", words: "Every task in Today and Soon is marked Blocked." });
		expect(only.transport.asked).toHaveLength(0);
	});

	it("works beside the answer label: the answer is marked, the skipped tasks are not sent", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ label: "Focus", skip: "Blocked" }) });
		const outcome = r.assistant.press("bestTask");
		await settle();
		r.transport.answer({ taskRef: r.transport.refOf("Pay rent"), reason: "Because." });
		expect(await outcome).toMatchObject({ kind: "task", notice: null });
		expect(r.store.text).toContain("- [ ] Pay rent #label/Focus");
		expect(r.store.text).toContain("- [ ] Call the bank\n");
	});

	it("the page draws its row under Label: None, then each label", async () => {
		const r = rig({ text: FILE, settings: settingsWith({ skip: "Blocked" }) });
		const best = (await r.assistant.page()).prompts.find((p) => p.actionId === "bestTask")!;
		expect(best.options.map((o) => [o.key, o.label, o.value])).toEqual([
			["label", "Label", null],
			["skip", "Skip label", "Blocked"],
		]);
		expect(best.options[1].choices.map((c) => c.title)).toEqual(["None", "Focus", "Blocked"]);
	});
});
