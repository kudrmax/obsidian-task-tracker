import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";

/**
 * A task by its id (`tasks.keyOf`) and a section by its id (`tasks.sectionOf`): what a host that refers to tasks by id
 * (the plugin's pending calls, replayed over a file Sync changed) hands the door's other calls.
 */

const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Idea", "- [ ] Call the bank", "", "## Now", "", "- [ ] Parent", "\t- [ ] Child", "### Errands", "- [ ] Shop", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
type Ok = Extract<DoorAnswer, { ok: true }>;
const ok = (answer: DoorAnswer): Ok => {
	if (!answer.ok) throw new Error(answer.error.message);
	return answer;
};
const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);

function read(tasks: string, ids?: DoorContext["ids"]): { context: DoorContext; screen: ScreenView } {
	const answer = ok(callDoor("tasks.screen", [DAY], { tasks, nowMs: NOW, ...(ids && { ids }) }));
	return { context: { tasks: answer.tasks ?? tasks, nowMs: NOW, ids: answer.ids ?? ids }, screen: answer.result as ScreenView };
}
const item = (screen: ScreenView, title: string) => flat([...screen.inbox, ...screen.day.list]).find((i) => i.title === title)!;

describe("tasks.keyOf", () => {
	it("gives the task's key as the file has it now, wherever an edit elsewhere moved it", () => {
		const { context, screen } = read(FILE);
		const child = item(screen, "Child");
		const edited = context.tasks!.replace("- [ ] Idea\n", "- [ ] Idea\n- [ ] Written on another device\n").replace("\t- [ ] Child", "\t- [ ] Child, edited");
		const answer = ok(callDoor("tasks.keyOf", [child.id], { ...context, tasks: edited }));
		expect(answer.result).toEqual({ section: "now", index: 0, path: [0], raw: "\t- [ ] Child, edited", id: child.id });
		expect(answer.tasks).toBeUndefined();
		expect(ok(callDoor("tasks.setStatus", [answer.result, "done"], { ...context, tasks: edited, ids: answer.ids ?? context.ids })).tasks).toContain("\t- [x] Child, edited");
	});

	it("is null for a task that is gone, an id no task has, and a section's id", () => {
		const { context, screen } = read(FILE);
		const idea = item(screen, "Idea");
		expect(ok(callDoor("tasks.keyOf", [idea.id], { ...context, tasks: context.tasks!.replace("- [ ] Idea\n", "") })).result).toBeNull();
		expect(ok(callDoor("tasks.keyOf", ["t999"], context)).result).toBeNull();
		expect(ok(callDoor("tasks.keyOf", [screen.sections.now.find((s) => s.name === "Errands")!.id], context)).result).toBeNull();
	});

	it("is null without the ids the host was given: fresh ids would name another task", () => {
		const { context, screen } = read(FILE);
		const child = item(screen, "Child");
		const edited = context.tasks!.replace("- [ ] Idea\n", "- [ ] Idea\n- [ ] Written on another device\n");
		expect(ok(callDoor("tasks.keyOf", [child.id], { tasks: edited, nowMs: NOW })).result).toBeNull();
		const errands = screen.sections.now.find((s) => s.name === "Errands")!;
		expect(ok(callDoor("tasks.sectionOf", [errands.id], { tasks: edited, nowMs: NOW })).result).toBeNull();
	});

	it("needs the tasks file", () => {
		expect(callDoor("tasks.keyOf", ["t1"], { tasks: null, nowMs: NOW })).toMatchObject({ ok: false, error: { code: "tasksFileMissing" } });
	});
});

describe("tasks.sectionOf", () => {
	it("gives the section's list and name as the file has it now: renamed on another device, it answers the new name", () => {
		const { context, screen } = read(FILE);
		const errands = screen.sections.now.find((s) => s.name === "Errands")!;
		expect(ok(callDoor("tasks.sectionOf", [errands.id], context)).result).toEqual({ list: "now", name: "Errands" });
		const renamed = { ...context, tasks: context.tasks!.replace("### Errands", "### Shopping") };
		expect(ok(callDoor("tasks.sectionOf", [errands.id], renamed)).result).toEqual({ list: "now", name: "Shopping" });
	});

	it("is null for a task's id and for a section that is gone", () => {
		const { context, screen } = read(FILE);
		const errands = screen.sections.now.find((s) => s.name === "Errands")!;
		expect(ok(callDoor("tasks.sectionOf", [item(screen, "Shop").id], context)).result).toBeNull();
		expect(ok(callDoor("tasks.sectionOf", [errands.id], { ...context, tasks: context.tasks!.replace("### Errands\n", "") })).result).toBeNull();
	});
});
