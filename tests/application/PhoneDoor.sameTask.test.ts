import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { sameTaskLine } from "../../core/application/TaskIdentity";

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
	it("counts a line the same while half the words of the shorter title stand in the other, marks, dates and times aside", () => {
		expect(sameTaskLine("- [ ] Buy milk", "- [x] Buy bread ⏰ 2026-11-15 10:00-11:00")).toBe(true);
		expect(sameTaskLine("- [ ] Call the bank", "- [ ] Fix the car")).toBe(false);
		expect(sameTaskLine("- [ ] Idea", "- [ ] Buy milk")).toBe(false);
		expect(sameTaskLine("\t- [ ] 📅 2026-11-15", "\t- [ ] 📅 2026-11-16")).toBe(true);
		expect(sameTaskLine("- [ ] Позвонить в банк", "- [ ] Позвонить в банк завтра")).toBe(true);
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
