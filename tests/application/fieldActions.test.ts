import { describe, expect, it } from "vitest";
import type { EntrySpot, EntryState, ListCard, TaskItem, TaskKey } from "../../core/application/contracts";
import { type EntryJob, type EntryLook, type EntryTasks, QuickEntry } from "../../core/application/QuickEntry";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";
import { priorityTitles } from "../fakes/FakePriorityTitles";
import { onDay } from "../fakes/itemOnDay";

const DAY = "2026-11-20";
const key = (name: string, index = 0): TaskKey => ({ section: "now", index, path: [], raw: `- [ ] ${name}` });
const card = (name: string, index: number): ListCard => ({ key: key(name, index), level: 0, group: null });
const ref = (name: string) => ({ name, path: [name], note: null, canOpenNote: false, mark: false, folder: false });

function task(name: string, extra: Partial<TaskItem> = {}): TaskItem {
	return onDay({ key: key(name), text: name, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "now", isSubtask: false, ...extra }, DAY);
}

function setUp(cards: readonly ListCard[] = [], sectioned = true) {
	const jobs: EntryJob[] = [];
	const tasks: EntryTasks = {
		...priorityTitles([{ prefix: "p1", color: "red" }], [{ name: "Важное", color: "red" }]),
		placementOf: () => ({ kind: "now" }),
		placementOfDay: () => ({ kind: "now" }),
		dayOfPlacement: () => DAY,
		newSlot: (date, start) => ({ date, start, end: null }),
		projects: () => [ref("Alpha"), ref("Beta"), ref("Gamma")],
	};
	const look: EntryLook = { cards: () => cards, sections: () => [], sectioned: () => sectioned, day: () => DAY, today: () => DAY, shown: () => ["day"] };
	const entry = new QuickEntry(tasks, look, undefined, undefined, (job) => jobs.push(job));
	return { entry, jobs, call: (i = jobs.length - 1) => entry.call(jobs[i].id) };
}

const atEnd = (index: number): EntrySpot => ({ kind: "list", column: "day", place: { kind: "gap", index, level: 0, group: null } });
const bar = (state: EntryState | null) => state?.bar.map(({ group, actions }) => [group, actions.map((a) => a.id)]);

describe("the field's bar, read from the table of task actions", () => {
	it("offers a new task in a list the new section switch, the shifts, the flag, the marks and the place", () => {
		const { entry } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		expect(bar(entry.state)).toEqual([
			["mode", ["newSection"]],
			["shifts", ["outdent", "indent"]],
			["flag", ["level", "label"]],
			["marks", ["project", "repeat", "description"]],
			["place", ["pickDate"]],
		]);
	});

	it("offers a field on the calendar Repeat and Description too, and no place or shifts", () => {
		const { entry } = setUp();
		entry.openSlot({ date: DAY, start: 600, end: null });
		expect(bar(entry.state)).toEqual([
			["flag", ["level", "label"]],
			["marks", ["project", "repeat", "description"]],
		]);
	});

	it("offers a rename no new section, the shifts not pressable, and Description only to a task without one", () => {
		const { entry } = setUp([card("A", 0)]);
		const a = task("A");
		entry.open(atEnd(0), a);
		expect(entry.state?.bar.find((g) => g.group === "shifts")?.actions.every((x) => x.disabled)).toBe(true);
		expect(bar(entry.state)?.map(([g]) => g)).not.toContain("mode");
		expect(bar(entry.state)?.find(([g]) => g === "marks")?.[1]).toContain("description");
		entry.open(atEnd(0), task("A", { description: "- note", can: { ...a.can, addDescription: false } }));
		expect(bar(entry.state)?.find(([g]) => g === "marks")?.[1]).not.toContain("description");
	});

	it("offers a section's name only the switch, lit", () => {
		const { entry } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		entry.toggleSection();
		expect(entry.state?.bar).toEqual([{ group: "mode", actions: [{ id: "newSection", disabled: false, lit: true }] }]);
	});

	it("reads the older booleans from the same table", () => {
		const { entry } = setUp();
		entry.openSlot({ date: DAY, start: 600, end: null });
		expect(entry.state).toMatchObject({ repeatable: true, markable: true, indents: false, section: null, place: null });
	});
});

describe("a slot's repeat", () => {
	it("is written with the task (Max, 2026-11-20)", () => {
		const { entry, call } = setUp();
		const rule = { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null } as const;
		entry.openSlot({ date: DAY, start: 600, end: null });
		entry.type("Run");
		entry.setRepeat(rule);
		entry.enter();
		expect(call()?.method).toBe("createInPlace");
		expect(call()?.args[3]).toEqual(rule);
	});
});

describe("the field's description", () => {
	it("opens a line under the title; Enter writes both, and the next field has none", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		entry.type("Call Ann");
		expect(entry.state?.description).toBeNull();
		entry.openDescription();
		expect(entry.state?.description).toBe("");
		expect(entry.state?.bar.flatMap((g) => g.actions).find((a) => a.id === "description")?.lit).toBe(true);
		entry.typeDescription("about the trip");
		entry.enter();
		expect(call()?.args[7]).toBe("about the trip");
		expect(entry.state?.description).toBeNull();
	});

	it("is written by a tap away too, and not at all while blank", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		entry.type("Call Ann");
		entry.openDescription();
		entry.typeDescription("  ");
		entry.blur();
		expect(call()?.args[7]).toBeUndefined();
	});

	it("goes with a rename into the edit", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(0), task("A"));
		entry.openDescription();
		entry.typeDescription("why");
		entry.enter();
		expect(call()).toMatchObject({ method: "edit", args: [expect.anything(), { text: "A", description: "why" }] });
	});

	it("does not open where the bar doesn't offer it: a section's name", () => {
		const { entry } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		entry.toggleSection();
		entry.openDescription();
		expect(entry.state?.description).toBeNull();
	});
});

describe("the field's projects, several as on the menu's page", () => {
	const withProjects = (...names: string[]) => task("A", { projects: names.map(ref), project: ref(names[0]) });

	it("a rename that picks one more project keeps the task's others (the bug Max met)", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(0), withProjects("Alpha", "Beta"));
		entry.toggleProject("Gamma");
		expect(entry.state?.project?.page.options.filter((o) => o.checked).map((o) => o.project.name)).toEqual(["Alpha", "Beta", "Gamma"]);
		entry.enter();
		expect(call()).toMatchObject({ method: "edit", args: [expect.anything(), { projects: ["Alpha", "Beta", "Gamma"] }] });
	});

	it("a tap on a checked one takes only it off", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(0), withProjects("Alpha", "Beta"));
		entry.toggleProject("Alpha");
		entry.enter();
		expect(call()).toMatchObject({ args: [expect.anything(), { projects: ["Beta"] }] });
	});

	it("a rename that leaves them writes none", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(0), withProjects("Alpha", "Beta"));
		entry.type("A2");
		entry.enter();
		const draft = call()?.args[1] as object;
		expect(draft).not.toHaveProperty("projects");
		expect(draft).not.toHaveProperty("project");
	});

	it("a new task takes one as a name, several as names", () => {
		const { entry, call } = setUp([card("A", 0)]);
		entry.open(atEnd(1));
		entry.toggleProject("Alpha");
		entry.type("One");
		entry.enter();
		expect(call()?.args[5]).toBe("Alpha");
		entry.toggleProject("Beta");
		entry.type("Two");
		entry.enter();
		expect(call()?.args[5]).toEqual(["Alpha", "Beta"]);
	});

	it("setProject still makes the one project alone", () => {
		const { entry } = setUp([card("A", 0)]);
		entry.open(atEnd(0), withProjects("Alpha", "Beta"));
		entry.setProject("Gamma");
		expect(entry.state?.project?.page.options.filter((o) => o.checked).map((o) => o.project.name)).toEqual(["Gamma"]);
	});
});

describe("what the service writes for the field", () => {
	const service = (text: string) => {
		const store = new InMemoryTaskFileStore(text);
		return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(DEFAULT_SETTINGS), { now: () => new Date(2026, 10, 20, 9, 0) }) };
	};

	it("a new task with its description, in one write", async () => {
		const { store, svc } = service("## Now\n\n- [ ] A\n");
		await svc.createInPlace("B", null, { kind: "list", list: "now", group: null, before: null }, null, [], null, null, "why it matters");
		expect(store.text).toMatch(/- \[ \] B[^\n]*\n\s+why it matters/);
	});

	it("a task on the calendar that repeats", async () => {
		const { store, svc } = service("## Now\n\n- [ ] A\n");
		await svc.createInPlace("Run", null, { kind: "slot", slot: { date: DAY, start: 600, end: null } }, { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null });
		expect(store.text?.split("\n").find((line) => line.includes("Run"))).toContain("🔁 every day");
	});

	it("a new task with several projects", async () => {
		const { store, svc } = service("## Now\n\n- [ ] A\n");
		await svc.createInPlace("B", null, { kind: "list", list: "now", group: null, before: null }, null, [], ["Alpha", "Beta"]);
		const [, b] = (await svc.dayView(DAY)).list;
		expect(b.projects.map((p) => p.name)).toEqual(["Alpha", "Beta"]);
		expect(store.text).toContain("B");
	});

	it("a rename with a description", async () => {
		const { store, svc } = service("## Now\n\n- [ ] A\n");
		const [a] = (await svc.dayView(DAY)).list;
		await svc.edit(a.key, { text: "A2", placement: { kind: "now" }, priority: null, description: "the reason" });
		expect(store.text).toMatch(/- \[ \] A2[^\n]*\n\s+the reason/);
	});
});
