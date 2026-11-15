import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { markersOf } from "../../core/application/documentText";
import { sameTaskLine } from "../../core/application/TaskIdentity";
import { settingsFrom } from "../../core/settings";

/**
 * A task keeps its id across an edit made elsewhere only while it is plausibly the same task: a line edited in place
 * keeps it, a line another device replaced with another task at the same place gets a new one, and a call that named
 * the old task is stale instead of landing on the new one.
 */

const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Idea", "- [ ] Call the bank", "- [ ] Other", "", "## Now", "", "### Errands", "- [ ] Shop", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
type Ok = Extract<DoorAnswer, { ok: true }>;
const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);

function read(context: DoorContext): { context: DoorContext; screen: ScreenView } {
	const answer = callDoor("tasks.screen", [DAY], context) as Ok;
	return { context: { ...context, ...(answer.tasks !== undefined && { tasks: answer.tasks }), ...(answer.ids !== undefined && { ids: answer.ids }) }, screen: answer.result as ScreenView };
}
const item = (screen: ScreenView, title: string) => flat([...screen.inbox, ...screen.day.list]).find((i) => i.title === title)!;

describe("the same task across an edit elsewhere", () => {
	const first = read({ tasks: FILE, nowMs: NOW });

	it("keeps its id when its line was edited in place: words added, its status", () => {
		const bank = item(first.screen, "Call the bank");
		const edits: [string, string][] = [
			["- [ ] Call the bank tomorrow", "Call the bank tomorrow"],
			["- [/] Call the bank", "Call the bank"],
			["- [ ] Call the bank about the card", "Call the bank about the card"],
		];
		for (const [line, title] of edits) {
			const after = read({ ...first.context, tasks: first.context.tasks!.replace("- [ ] Call the bank", line) });
			const all = flat([...after.screen.inbox, ...after.screen.day.list, ...after.screen.soon, ...after.screen.done]);
			expect({ line, id: all.find((i) => i.title === title)?.id }).toEqual({ line, id: bank.id });
		}
	});

	it("gives a new id to another task written over its line: the old id is gone and a call by it is stale, writing nothing", () => {
		const bank = item(first.screen, "Call the bank");
		const replaced = { ...first.context, tasks: first.context.tasks!.replace("- [ ] Call the bank", "- [ ] Pay rent") };
		const after = read(replaced);
		expect(item(after.screen, "Pay rent").id).not.toBe(bank.id);
		expect((callDoor("tasks.keyOf", [bank.id], after.context) as Ok).result).toBeNull();
		expect(callDoor("tasks.freshArgs", [[bank.key, "done"], {}], after.context)).toMatchObject({ ok: false, error: { code: "staleTask" } });
		const write = callDoor("tasks.setStatus", [bank.key, "done"], after.context);
		expect(write).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("does not take a deleted task's id for a task another device added at its place: Idea gone, Buy milk in", () => {
		const idea = item(first.screen, "Idea");
		const after = read({ ...first.context, tasks: first.context.tasks!.replace("- [ ] Idea", "- [ ] Buy milk") });
		expect(item(after.screen, "Buy milk").id).not.toBe(idea.id);
		expect(item(after.screen, "Other").id).toBe(item(first.screen, "Other").id);
		expect(callDoor("tasks.freshArgs", [[idea.key, "done"], {}], after.context)).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("keeps a section's id through a rename elsewhere: a heading is who it is by its place", () => {
		const errands = first.screen.sections.now.find((s) => s.name === "Errands")!;
		const after = read({ ...first.context, tasks: first.context.tasks!.replace("### Errands", "### Shopping") });
		expect(after.screen.sections.now.find((s) => s.name === "Shopping")!.id).toBe(errands.id);
	});
});

describe("sameTaskLine: the rule", () => {
	const markers = markersOf(settingsFrom({ labels: [{ name: "Важное", color: "red" }, { name: "Срочное", color: "red" }] }));
	const same = (a: string, b: string) => sameTaskLine(a, b, markers);

	it("compares the titles alone: a repeat rule, projects, labels, dates and times shared are no likeness", () => {
		expect(same("- [ ] Зал 📅 2026-11-09 🔁 every week on Mon, Wed, Fri", "- [ ] Бассейн 📅 2026-11-10 🔁 every week on Mon, Wed, Fri")).toBe(false);
		expect(same("- [ ] Позвонить 🗂️ Работа Клиенты", "- [ ] Написать отчёт 🗂️ Работа Клиенты")).toBe(false);
		expect(same("- [ ] Gym #label/Важное #label/Срочное", "- [ ] Dentist #label/Важное #label/Срочное")).toBe(false);
		expect(same("\t- [ ] 📅 2026-11-15", "\t- [/] 📅 2026-11-16")).toBe(true);
		expect(same("- [ ] Call 📅 2026-11-15 🔁 every day", "- [x] Call ⏰ 2026-11-16 10:00-11:00")).toBe(true);
	});

	it("keeps a title with a typo: a letter or two changed, swapped, added or dropped", () => {
		expect(same("- [ ] Byu", "- [ ] Buy")).toBe(true);
		expect(same("- [ ] Позвонить в бнак", "- [ ] Позвонить в банк")).toBe(true);
		expect(same("- [ ] Buy milk", "- [ ] Buy mlik")).toBe(true);
		expect(same("- [ ] Milk", "- [ ] Молоко")).toBe(false);
		expect(same("- [ ] Buy milk", "- [ ] Buy bread")).toBe(false);
	});

	it("keeps a longer title with words added or changed while half the words of the shorter stand in the other", () => {
		expect(same("- [ ] Позвонить в банк", "- [ ] Позвонить в банк завтра")).toBe(true);
		expect(same("- [ ] Call the bank", "- [ ] Call a bank about the card")).toBe(true);
		expect(same("- [ ] Later", "- [ ] Later edited")).toBe(true);
		expect(same("- [ ] Call the bank", "- [ ] Fix the car")).toBe(false);
		expect(same("- [ ] Idea", "- [ ] Buy milk")).toBe(false);
	});
});

describe("a task written over another's line elsewhere, the two sharing a repeat rule", () => {
	it("gets a new id: a call by the old task is stale, never closing the new one", () => {
		const file = ["## Inbox", "", "- [ ] Зал 🔁 every week on Mon, Wed, Fri", "- [ ] Other", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
		const before = read({ tasks: file, nowMs: NOW });
		const gym = item(before.screen, "Зал");
		const after = read({ ...before.context, tasks: before.context.tasks!.replace("Зал", "Бассейн") });
		expect(item(after.screen, "Бассейн").id).not.toBe(gym.id);
		expect(callDoor("tasks.freshArgs", [[gym.key, "done"], {}], after.context)).toMatchObject({ ok: false, error: { code: "staleTask" } });
		expect(callDoor("tasks.setStatus", [gym.key, "done"], after.context)).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});
});

describe("created, by kind", () => {
	it("says which of the ids a call gave are tasks and which are sections", () => {
		const made = callDoor("tasks.createWithId", ["New", null, { kind: "list", list: "inbox", group: null, before: null }], first()) as Ok;
		expect(made.createdKinds).toEqual(["task"]);
		const section = callDoor("tasks.createSection", ["Calls", { kind: "list", list: "inbox", group: null, before: null }], first()) as Ok;
		expect(section.createdKinds).toEqual(["section"]);
		expect(section.created).toHaveLength(1);
	});

	function first(): DoorContext {
		return read({ tasks: FILE, nowMs: NOW }).context;
	}
});
