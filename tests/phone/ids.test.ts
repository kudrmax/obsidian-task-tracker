import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * A task's id through the door the iOS app calls: on every task it reads, kept across calls by the `ids` the answers give
 * and the app hands in again, through writes, re-reads and undo, as the plugin's service keeps it.
 */

type Fn = (...args: unknown[]) => unknown;
const sandbox: { TaskCalendarPhone?: Record<string, Fn> } = {};
runInNewContext(readFileSync("core/task-calendar-phone.js", "utf8"), sandbox);
const phone = sandbox.TaskCalendarPhone!;

const NOW = new Date(2026, 10, 4, 9, 30).getTime();
const T = "2026-11-04";
const FILE = ["## Inbox", "", "- [ ] Idea", "", "## Now", "", "- [ ] A", "- [ ] X", "- [ ] X", "- [ ] Parent", "\t- [ ] Child", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

interface Item {
	readonly id: string;
	readonly key: unknown;
	readonly title: string;
	readonly allSubtasks: readonly Item[];
}

/** The app as it calls the door: it keeps the file, the undo steps and the ids each answer gives, and hands them in again. */
class App {
	tasks = FILE;
	private kept: Record<string, unknown> = {};

	call(method: string, ...args: unknown[]): { result: unknown; ids?: unknown } {
		const answer = JSON.parse(phone.call(method, JSON.stringify(args), JSON.stringify({ tasks: this.tasks, nowMs: NOW, ...this.kept })) as string);
		if (!answer.ok) throw new Error(answer.error.message);
		if (answer.tasks !== undefined) this.tasks = answer.tasks;
		for (const field of ["history", "ids"]) if (answer[field] !== undefined) this.kept[field] = answer[field];
		return answer;
	}

	items(): Item[] {
		const screen = this.call("tasks.screen", T).result as Record<string, unknown> & { day: { list: Item[]; slotted: Item[] } };
		const flat = (items: readonly Item[]): Item[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
		return flat([...(screen.inbox as Item[]), ...screen.day.list, ...screen.day.slotted, ...(screen.soon as Item[]), ...(screen.backlog as Item[]), ...(screen.done as Item[])]);
	}

	item(title: string, nth = 0): Item {
		return this.items().filter((i) => i.title === title)[nth];
	}
}

describe("a task's id through the door", () => {
	it("is on every task and subtask, each its own, and the answer gives the ids to hand in again", () => {
		const app = new App();
		const answer = app.call("tasks.screen", T);
		expect(answer.ids).toBeDefined();
		const items = app.items();
		expect(items.map((i) => i.title)).toEqual(["Idea", "A", "X", "X", "Parent", "Child"]);
		expect(new Set(items.map((i) => i.id)).size).toBe(6);
		expect(app.items()).toEqual(items);
	});

	it("stays through writes of every kind, made in separate calls", () => {
		const app = new App();
		const before = Object.fromEntries(app.items().map((i) => [i.title, i.id]));
		app.call("tasks.setPriority", app.item("A").key, "p1");
		app.call("tasks.moveToEnd", app.item("A").key, "backlog");
		app.call("tasks.nest", app.item("Idea").key, app.item("Parent").key, null);
		app.call("tasks.setStatus", app.item("Child").key, "done");
		const renamed = app.call("tasks.rename", app.item("Parent").key, "Parent renamed").result as Item;
		expect(renamed.id).toBe(before.Parent);
		const after = Object.fromEntries(app.items().map((i) => [i.title, i.id]));
		expect(after).toEqual({ ...Object.fromEntries(Object.entries(before).filter(([t]) => t !== "Parent" && t !== "X")), X: after.X, "Parent renamed": before.Parent });
		expect(app.items().filter((i) => i.title === "X").map((i) => i.id)).toEqual([app.item("X", 0).id, app.item("X", 1).id]);
	});

	it("tells two identical lines apart: a write to the second keeps each its own", () => {
		const app = new App();
		const [first, second] = [app.item("X", 0), app.item("X", 1)];
		app.call("tasks.moveToEnd", second.key, "backlog");
		const xs = app.items().filter((i) => i.title === "X");
		expect(xs.map((i) => i.id)).toEqual([first.id, second.id]);
	});

	it("gives a task made a new id and takes a removed one's away", () => {
		const app = new App();
		const before = new Set(app.items().map((i) => i.id));
		app.call("tasks.createInPlace", "Fresh", null, { kind: "list", list: "inbox", group: null, before: null });
		expect(before.has(app.item("Fresh").id)).toBe(false);
		const a = app.item("A");
		app.call("tasks.remove", a.key);
		expect(app.items().map((i) => i.id)).not.toContain(a.id);
	});

	it("gives a task back its id on undo", () => {
		const app = new App();
		const before = app.items().map((i) => i.id);
		app.call("tasks.moveToEnd", app.item("A").key, "backlog");
		app.call("tasks.remove", app.item("Parent").key);
		app.call("history.undo");
		app.call("history.undo");
		expect(app.items().map((i) => i.id)).toEqual(before);
	});

	it("keeps the id of a line an edit from elsewhere left in place", () => {
		const app = new App();
		const before = Object.fromEntries(app.items().map((i) => [i.title, i.id]));
		app.tasks = app.tasks.replace("- [ ] Idea", "- [ ] Idea\n- [ ] Typed on the Mac");
		const after = Object.fromEntries(app.items().map((i) => [i.title, i.id]));
		expect(after.Idea).toBe(before.Idea);
		expect(after.A).toBe(before.A);
		expect(Object.values(before)).not.toContain(after["Typed on the Mac"]);
	});

	it("keeps the door's functions as they were: the old ones answer without ids", () => {
		const reminders = phone.reminders(FILE, "", NOW);
		expect(Array.isArray(reminders)).toBe(true);
		expect(phone.methods()).toContain("tasks.screen");
	});
});
