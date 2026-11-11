import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext, type EntryAnswer } from "../../core/application/PhoneCalls";
import type { CreatedTask, ResultPage, ScreenView, SettingsForm, TaskItem, TaskMenuModel } from "../../core/application/contracts";
import { phoneDoor } from "../../core/application/PhoneDoor";

/** Results through the door: what the iPhone app asks for the card, the menu rows, the Add to result page and the setting. */
const T = "2026-11-11";
const NOW = new Date(2026, 10, 11, 9, 0).getTime();
const FILE = ["## Inbox", "", "- [ ] Call bank", "", "## Now", "", "- [ ] 🎯 Компания 📁 📅 2026-11-11", "\t- [ ] Write to Marko", "- [ ] Lunch 📅 2026-11-11", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

const context = (extra: Partial<DoorContext> = {}): DoorContext => ({ tasks: FILE, nowMs: NOW, ...extra });

function ok(answer: DoorAnswer): Extract<DoorAnswer, { ok: true }> {
	if (!answer.ok) throw new Error(`${answer.error.code}: ${answer.error.message}`);
	return answer;
}

const call = (method: string, args: unknown[], extra: Partial<DoorContext> = {}) => ok(callDoor(method, JSON.parse(JSON.stringify(args)), context(extra)));

function screen(extra: Partial<DoorContext> = {}): ScreenView {
	return call("tasks.screen", [T], extra).result as ScreenView;
}

const named = (s: ScreenView, title: string): TaskItem => [...s.inbox, ...s.day.list].find((i) => i.title === title)!;

describe("results through the door", () => {
	it("tasks.screen answers the folded result's card: the step, the line over it, the step's key", () => {
		const s = screen();
		const result = named(s, "Компания");
		expect(result.card).toMatchObject({ text: "Write to Marko", over: "Компания", semibold: false });
		expect(result.card.step!.key.raw).toBe("\t- [ ] Write to Marko");
		expect(result.allSubtasks[0].resultOf!.title).toBe("Компания");
	});

	it("tasks.menu answers the result rows", () => {
		const s = screen();
		const menu = call("tasks.menu", [named(s, "Lunch"), "day", { today: T, day: T, offer: s.offer }]).result as TaskMenuModel;
		expect(menu.result).toMatchObject({ rows: ["addToResult", "toggle"], toggle: { label: "Make result", result: true } });
	});

	it("tasks.resultPage, tasks.addToResult, tasks.newResult and tasks.setResult write as the plugin does", () => {
		const s = screen();
		const page = call("tasks.resultPage", [[named(s, "Call bank").key], "комп"]).result as ResultPage;
		expect(page.options.map((o) => o.result.title)).toEqual(["Компания"]);
		const added = call("tasks.addToResult", [[named(s, "Call bank").key], page.options[0].result.key]);
		expect(added.tasks).toContain("- [ ] 🎯 Компания 📁 📅 2026-11-11\n\t- [ ] Write to Marko\n\t- [ ] Call bank\n");
		const made = call("tasks.newResult", [[named(s, "Lunch").key], "Health"]);
		expect(made.tasks).toContain("- [ ] 🎯 Health 📁 📅 2026-11-11\n\t- [ ] Lunch 📅 2026-11-11\n");
		expect((made.result as CreatedTask).key.raw).toBe("- [ ] 🎯 Health 📁 📅 2026-11-11");
		expect(call("tasks.setResult", [named(s, "Lunch").key, true]).tasks).toContain("- [ ] 🎯 Lunch 📅 2026-11-11\n");
		expect(call("tasks.newResult", [[named(s, "Lunch").key], " "]).result).toBeNull();
	});

	it("reads the result mark from the settings handed in, and settings.setResultMark writes it", () => {
		const settings = JSON.stringify({ resultMark: "★" });
		const starred = context({ tasks: FILE.replace("🎯 Компания", "★ Компания"), settings });
		const s = ok(callDoor("tasks.screen", [T], starred)).result as ScreenView;
		expect(named(s, "Компания").isResult).toBe(true);
		expect((call("settings.form", [], { settings }).result as SettingsForm).resultMark).toBe("★");
		expect(JSON.parse(call("settings.setResultMark", [" ◎ "], { settings }).settings!)).toMatchObject({ resultMark: "◎" });
		expect(call("settings.setResultMark", ["two words"], { settings }).settings).toBeUndefined();
	});

	it("entry.*: a folded result's step is renamed in its card's place, and Add subtask on it unfolds first (a job)", () => {
		const s = screen();
		const result = named(s, "Компания");
		const cards = [...s.day.list].map((item) => ({ key: item.key, id: item.id, level: 0, group: item.group }));
		const look = { cards: { day: cards }, sections: {}, sectioned: {}, day: T, shown: ["day"] };
		const step = result.card.step!;
		const spot = (call("entry.renameSpot", [null, look, step, false]).result as EntryAnswer).value;
		const opened = call("entry.open", [null, look, spot, step]).result as EntryAnswer;
		expect(opened.state?.renaming).toMatchObject({ id: result.id, text: "Write to Marko" });
		const sub = (call("entry.subtaskSpot", [null, look, step.key]).result as EntryAnswer).value as { unfold?: unknown };
		expect(sub.unfold).toEqual(step.key);
		const field = call("entry.open", [null, look, sub]).result as EntryAnswer;
		expect(field.jobs).toHaveLength(1);
		const job = call("entry.call", [field.session, look, field.jobs[0].id]).result as EntryAnswer;
		expect(job.value).toEqual({ method: "unfoldAbove", args: [step.key] });
		expect(call("tasks.unfoldAbove", [step.key]).tasks).toContain("- [ ] 🎯 Компания 📅 2026-11-11\n");
	});

	it("tasks.isBlank checks a New result name as the write does; settings.form gives the default mark", () => {
		expect(call("tasks.isBlank", ["🎯 "]).result).toBe(true);
		expect(call("tasks.isBlank", ["Health"]).result).toBe(false);
		expect((call("settings.form", []).result as SettingsForm).defaultResultMark).toBe("🎯");
	});

	it("is listed among the door's methods", () => {
		expect(phoneDoor.methods()).toEqual(expect.arrayContaining(["tasks.setResult", "tasks.resultPage", "tasks.addToResult", "tasks.newResult", "settings.setResultMark"]));
	});
});
