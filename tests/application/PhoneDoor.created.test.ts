import { describe, expect, it } from "vitest";
import type { CreatedTask, ListSection, ScreenView, TaskItem, TaskKey } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import type { TaskIdState } from "../../core/application/TaskIdentity";

/**
 * The ids a call gave, as door facts: `DoorAnswer.created` lists them in the order given, `ids.continueFrom` carries the
 * counter to a new base, and `tasks.freshArgs` names a call's tasks as the file has them now. A host never reads an id.
 */

const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Idea", "", "## Now", "", "- [ ] Lunch ⏰ 2026-11-15 13:00-14:00 🔁 every day", "- [ ] Parent", "\t- [ ] Child", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
type Ok = Extract<DoorAnswer, { ok: true }>;

class Host {
	context: DoorContext;
	readonly given: string[] = [];

	constructor(tasks = FILE) {
		this.context = { tasks, nowMs: NOW };
	}

	call(method: string, args: unknown[]): Ok {
		const answer = callDoor(method, args, this.context);
		if (!answer.ok) throw new Error(`${method}: ${answer.error.code}`);
		this.context = { ...this.context, ...(answer.tasks !== undefined && { tasks: answer.tasks }), ...(answer.history !== undefined && { history: answer.history }), ...(answer.ids !== undefined && { ids: answer.ids }) };
		this.given.push(...((answer.ids?.lines ?? []).map((l) => l.id)));
		return answer;
	}

	screen(): ScreenView {
		return this.call("tasks.screen", [DAY]).result as ScreenView;
	}

	item(title: string): TaskItem {
		const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
		const s = this.screen();
		return flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]).find((i) => i.title === title)!;
	}
}

const NEW = (text: string) => [text, null, { kind: "list", list: "inbox", group: null, before: null }];

describe("DoorAnswer.created: the ids a call gave, in order", () => {
	it("is the new task's id for a create, and the screen shows it with that id", () => {
		const host = new Host();
		host.screen();
		const answer = host.call("tasks.createWithId", NEW("Fresh"));
		expect(answer.created).toEqual([(answer.result as CreatedTask).id]);
		expect(host.item("Fresh").id).toBe(answer.created![0]);
		expect(host.call("tasks.createInList", [DAY, "In the list"]).created).toEqual([host.item("In the list").id]);
		expect(host.call("tasks.createInSoon", ["Later"]).created).toEqual([host.item("Later").id]);
		expect(host.call("tasks.createAtTime", [DAY, 600, "At ten"]).created).toEqual([host.item("At ten").id]);
		expect(host.call("tasks.createSubtask", [host.item("Parent").key, { text: "Second child", placement: { kind: "now" }, priority: null }]).created).toEqual([host.item("Second child").id]);
	});

	it("is the section's id for a new section", () => {
		const host = new Host();
		host.screen();
		const answer = host.call("tasks.createSection", ["Errands", { kind: "list", list: "inbox", group: null, before: null }]);
		const section = (host.screen().sections.inbox as readonly ListSection[]).find((s) => s.name === "Errands")!;
		expect(answer.created).toEqual([section.id]);
		const grouped = host.call("tasks.createGroup", [host.item("Idea").key, "inbox", "Calls"]);
		expect(grouped.created).toEqual([(host.screen().sections.inbox as readonly ListSection[]).find((s) => s.name === "Calls")!.id]);
	});

	it("is the next turn's id when a repeating task is done: the task done keeps its own", () => {
		const host = new Host();
		const lunch = host.item("Lunch");
		const answer = host.call("tasks.setStatus", [lunch.key, "done"]);
		const next = (host.call("tasks.screen", ["2026-11-16"]).result as ScreenView).day.list.find((i) => i.title === "Lunch")!;
		expect(answer.created).toEqual([next.id]);
		expect(host.screen().done.find((i) => i.title === "Lunch")!.id).toBe(lunch.id);
	});

	it("lists several in the order given: the task with its subtask, done, gives the next turn's id, then its subtask's", () => {
		const host = new Host(FILE.replace("🔁 every day", "🔁 every day\n\t- [ ] Bring a fork"));
		const lunch = host.item("Lunch");
		const answer = host.call("tasks.setStatus", [lunch.key, "done"]);
		const next = (host.call("tasks.screen", ["2026-11-16"]).result as ScreenView).day.list.find((i) => i.title === "Lunch")!;
		expect(answer.created).toEqual([next.id, next.allSubtasks[0].id]);
		expect(host.call("capture.add", ["inbox", "One"]).created).toEqual([host.item("One").id]);
	});

	it("is left out by a call that creates nothing, by a tidy, and by an undo or redo that gives a task back its id", () => {
		const host = new Host();
		expect(host.call("tasks.normalize", []).created).toBeUndefined();
		expect(host.call("tasks.setPriority", [host.item("Idea").key, "p1"]).created).toBeUndefined();
		const made = host.call("tasks.createWithId", NEW("Back and forth"));
		expect(host.call("history.undo", []).created).toBeUndefined();
		expect(host.call("history.redo", []).created).toBeUndefined();
		expect(host.item("Back and forth").id).toBe(made.created![0]);
	});

	it("never gives an id twice, through undo, writes elsewhere and new creates", () => {
		const host = new Host();
		host.screen();
		const ids: string[] = [];
		for (let i = 0; i < 5; i++) {
			ids.push(...host.call("tasks.createWithId", NEW(`Task ${i}`)).created!);
			host.call("history.undo", []);
			host.context = { ...host.context, tasks: host.context.tasks!.replace("- [ ] Idea", `- [ ] Idea\n- [ ] From elsewhere ${i}`) };
			host.screen();
		}
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("ids.continueFrom: a new base's ids going on from the replica's counter", () => {
	it("keeps the base's tasks and sections who they were, and gives a new task an id never given before", () => {
		const host = new Host();
		host.screen();
		const base = host.context.ids!;
		const baseText = host.context.tasks!;
		const idea = host.item("Idea");
		const pending = host.call("tasks.createWithId", NEW("Pending"));
		const replica = host.context.ids!;
		const ids = host.call("ids.continueFrom", [base, replica]).result as TaskIdState;
		host.context = { ...host.context, tasks: baseText.replace("- [ ] Idea", "- [ ] Idea\n- [ ] From elsewhere"), ids };
		expect(host.item("Idea").id).toBe(idea.id);
		const replayed = host.call("tasks.createWithId", NEW("Pending"));
		expect(replayed.created![0]).not.toBe(pending.created![0]);
		expect(new Set([...base.lines.map((l) => l.id), ...replica.lines.map((l) => l.id)])).not.toContain(replayed.created![0]);
	});

	it("is the base itself when the replica's counter is not past it", () => {
		const host = new Host();
		host.screen();
		const base = host.context.ids!;
		expect(host.call("ids.continueFrom", [base, base]).result).toEqual(base);
		expect(host.call("ids.continueFrom", [base, null]).result).toEqual(base);
	});
});

describe("tasks.freshArgs: a call's arguments with its tasks as the file has them now", () => {
	it("maps each id an earlier replayed create gave anew, and names each task by its key now", () => {
		const host = new Host();
		const idea = host.item("Idea");
		const child = host.item("Child");
		host.context = { ...host.context, tasks: host.context.tasks!.replace("- [ ] Idea", "- [ ] From elsewhere\n- [ ] Idea") };
		const args = [idea.key, { keys: [child.key], lifted: { id: "old" } }, "text", 5, null];
		const fresh = host.call("tasks.freshArgs", [args, { old: "new" }]).result as unknown[];
		expect(fresh[0]).toMatchObject({ section: "inbox", index: 1, raw: "- [ ] Idea", id: idea.id });
		expect((fresh[1] as { keys: TaskKey[] }).keys[0]).toMatchObject({ raw: "\t- [ ] Child", id: child.id });
		expect((fresh[1] as { lifted: { id: string } }).lifted.id).toBe("new");
		expect(fresh.slice(2)).toEqual(["text", 5, null]);
	});

	it("is staleTask when a task the call names is gone", () => {
		const host = new Host();
		const idea = host.item("Idea");
		host.context = { ...host.context, tasks: host.context.tasks!.replace("- [ ] Idea\n", "") };
		expect(callDoor("tasks.freshArgs", [[idea.key], {}], host.context)).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});
});
