import { describe, expect, it } from "vitest";
import { type GroupedList, type GroupName, listView, type TaskChange, type TaskItem, type TaskKey } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";
import { onDay } from "../fakes/itemOnDay";

/** Today, a later day. */
const T = "2026-10-30";
const D = "2026-11-03";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };

/**
 * Every list with sections. Now: a subtask, two tasks in Work, Evening holding only a task on today's timeline (rule 5
 * takes it out of the section, the empty heading goes). Soon: a
 * task for the later day outside any section, Trip holding only tasks of that day, the preset Morning. Done: a task.
 */
const FILE = [
	"## Inbox",
	"",
	"- [ ] I1",
	"- [ ] I2",
	"### Ideas",
	"- [ ] I3",
	"",
	"## Now",
	"",
	"- [ ] N1",
	"\t- [ ] N1a",
	"### Work",
	"- [ ] N3",
	"- [ ] N3b",
	"### Evening",
	"- [ ] NE ⏰ 2026-10-30 19:00-20:00",
	"### Работа",
	"- [ ] N4",
	"",
	"## Soon",
	"",
	"- [ ] S1",
	"- [ ] SD 📅 2026-11-03",
	"### Later",
	"- [ ] S2",
	"### Trip",
	"- [ ] ST 📅 2026-11-03",
	"### Morning",
	"- [ ] SM",
	"",
	"## Backlog",
	"",
	"- [ ] B1",
	"### Someday",
	"- [ ] B2",
	"",
	"## Done",
	"",
	"- [x] X1",
	"",
].join("\n");

/** Presets with blanks around, an empty one, and the No section name. */
const SETTINGS = { ...DEFAULT_SETTINGS, groups: { presets: [" Morning ", "Afternoon", "", "Evening", "No section"], ungrouped: "No section" } };

function setup() {
	const store = new InMemoryTaskFileStore(FILE);
	const settings = new FakeSettingsStore(SETTINGS);
	const svc = new TaskServiceImpl(store, settings, clock);
	return { store, svc, settings };
}

type Svc = ReturnType<typeof setup>["svc"];

/** What the screen loads on `day`, as the view keeps it. */
async function screen(svc: Svc, day: string) {
	return { day: await svc.dayView(day), soon: await svc.soonWithoutDateView(), inbox: await svc.inboxView(), backlog: await svc.backlogView() };
}
type Screen = Awaited<ReturnType<typeof screen>>;

/** Every task of the screen on `day`, its subtasks too, by its text. */
function byText(data: Screen): Map<string, TaskItem> {
	const found = new Map<string, TaskItem>();
	const walk = (item: TaskItem) => {
		found.set(item.text, item);
		item.subtasks.forEach(walk);
	};
	[...data.day.list, ...data.day.slotted, ...data.soon, ...data.inbox, ...data.backlog].forEach(walk);
	return found;
}

/** The task of Done, which no column of the screen lists. */
const doneItem = (data: Screen): TaskItem => ({ ...byText(data).get("N1")!, key: { section: "done", index: 0, path: [], raw: "- [x] X1" }, text: "X1", list: "done" });

// A copy of the view's rules as they stand (TaskCalendarView: sectionsHome, sectionChoice, bulkSections, showMenu's toSection), for every card in a column that shows sections.

interface SectionChoice {
	readonly names: readonly string[];
	readonly current: GroupName;
	readonly ungrouped: string;
}

function homeOf(item: TaskItem): { list: GroupedList; date: string | null } | null {
	if (item.parentText !== null || item.list === "done") return null;
	const list = item.list;
	return { list, date: list === "soon" ? item.dueDate : null };
}

function choiceOf(data: Screen, list: GroupedList, item: TaskItem): SectionChoice {
	const { presets, ungrouped } = SETTINGS.groups;
	const tasks = [...data.day.list, ...data.soon, ...data.inbox, ...data.backlog].filter((task) => task.list === list);
	const names = [...tasks.flatMap((task) => (task.group === null ? [] : [task.group])), ...presets.map((preset) => preset.trim())];
	return { names: [...new Set(names)].filter((name) => name !== "" && name !== ungrouped), current: item.group, ungrouped };
}

async function choice(svc: Svc, day: string, texts: readonly string[], done = false): Promise<(SectionChoice & { shared: boolean }) | null> {
	const data = await screen(svc, day);
	const items = byText(data);
	const tasks = texts.map((text) => items.get(text)!);
	if (done) tasks.push(doneItem(data));
	const homes = tasks.map(homeOf);
	const first = homes[0];
	if (!first || homes.some((home) => !home || home.list !== first.list)) return null;
	return { ...choiceOf(data, first.list, tasks[0]), shared: tasks.every((task) => task.group === tasks[0].group) };
}

async function toSection(svc: Svc, day: string, texts: readonly string[], name: GroupName): Promise<void> {
	const items = byText(await screen(svc, day));
	const tasks = texts.map((text) => items.get(text)!);
	if (tasks.length === 1) {
		const item = tasks[0];
		const home = homeOf(item)!;
		const date = home.date ?? undefined;
		await (name === null ? svc.moveToGroup(item.key, home.list, null, null, date) : svc.createGroup(item.key, home.list, name, date));
		return;
	}
	const list = homeOf(tasks[0])!.list;
	const change = (item: TaskItem): TaskChange => {
		const date = (item.list === "soon" ? item.dueDate : null) ?? undefined;
		return name === null ? { kind: "moveToGroup", list, group: null, before: null, date } : { kind: "createGroup", list, name, date };
	};
	await svc.applyAll(tasks.map((item) => ({ key: item.key as TaskKey, change: change(item) })));
}

async function written(day: string, texts: readonly string[], name: GroupName): Promise<string> {
	const { store, svc } = setup();
	await toSection(svc, day, texts, name);
	return store.text!;
}

describe("the sections a task's menu offers", () => {
	it("a task of Now today: the sections its list shows today, then the presets it lacks", async () => {
		expect(await choice(setup().svc, T, ["N1"])).toEqual({ names: ["Work", "Работа", "Morning", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: true });
	});

	it("a task in a section: that one is current", async () => {
		expect((await choice(setup().svc, T, ["N3"]))?.current).toBe("Work");
	});

	it("a task of Soon today: the sections of Soon without a date; one with only another day's tasks is none of them", async () => {
		expect(await choice(setup().svc, T, ["S1"])).toEqual({ names: ["Later", "Morning", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: true });
	});

	it("a task of Soon on a later day: that day's sections first, then those of Soon without a date", async () => {
		expect((await choice(setup().svc, D, ["S1"]))?.names).toEqual(["Trip", "Later", "Morning", "Afternoon", "Evening"]);
		expect((await choice(setup().svc, D, ["SD"]))?.names).toEqual(["Trip", "Later", "Morning", "Afternoon", "Evening"]);
		expect((await choice(setup().svc, D, ["ST"]))?.current).toBe("Trip");
	});

	it("Inbox and Backlog their own", async () => {
		expect((await choice(setup().svc, T, ["I1"]))?.names).toEqual(["Ideas", "Morning", "Afternoon", "Evening"]);
		expect(await choice(setup().svc, T, ["B2"])).toEqual({ names: ["Someday", "Morning", "Afternoon", "Evening"], current: "Someday", ungrouped: "No section", shared: true });
	});

	it("none for a subtask or a done task", async () => {
		expect(await choice(setup().svc, T, ["N1a"])).toBeNull();
		expect(await choice(setup().svc, T, [], true)).toBeNull();
	});

	it("several: the first one's section current, shared when all stand in it", async () => {
		expect(await choice(setup().svc, T, ["N1", "N3"])).toEqual({ names: ["Work", "Работа", "Morning", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: false });
		expect(await choice(setup().svc, T, ["N3", "N3b"])).toMatchObject({ current: "Work", shared: true });
		expect(await choice(setup().svc, D, ["SD", "S1"])).toMatchObject({ names: ["Trip", "Later", "Morning", "Afternoon", "Evening"], current: null, shared: true });
	});

	it("several: none across lists, with a subtask or a done task", async () => {
		expect(await choice(setup().svc, T, ["I1", "S1"])).toBeNull();
		expect(await choice(setup().svc, T, ["N1", "N1a"])).toBeNull();
		expect(await choice(setup().svc, T, ["N1"], true)).toBeNull();
	});
});

describe("to a section", () => {
	it("one task into a section its list has: at the end of it", async () => {
		expect(await written(T, ["N1"], "Работа")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4
			- [ ] N1 📅 2026-10-30
				- [ ] N1a

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task out of its section", async () => {
		expect(await written(T, ["N3"], null)).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			- [ ] N3 📅 2026-10-30
			### Work
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into its own section, as New section with its name: at the end of it", async () => {
		expect(await written(T, ["N3"], "Work")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3b
			- [ ] N3 📅 2026-10-30
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into a preset whose heading held only a task on the timeline, which the file puts outside any section", async () => {
		expect(await written(T, ["N1"], "Evening")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4
			### Evening
			- [ ] N1 📅 2026-10-30
				- [ ] N1a

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into a preset the list lacks: in the presets' order", async () => {
		expect(await written(T, ["N1"], "Afternoon")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4
			### Afternoon
			- [ ] N1 📅 2026-10-30
				- [ ] N1a

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into a new name: last", async () => {
		expect(await written(T, ["N1"], "Экскурсия")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4
			### Экскурсия
			- [ ] N1 📅 2026-10-30
				- [ ] N1a

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into the No section name typed as a new one: outside any", async () => {
		expect(await written(T, ["N3"], "No section")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			- [ ] N3 📅 2026-10-30
			### Work
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("a task of Soon with a due date keeps it, into a section and out of one", async () => {
		expect(await written(D, ["SD"], "Later")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			### Later
			- [ ] S2
			- [ ] SD 📅 2026-11-03
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
		expect(await written(D, ["ST"], null)).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			- [ ] ST 📅 2026-11-03
			### Later
			- [ ] S2
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("Inbox and Backlog", async () => {
		expect(await written(T, ["I1"], "Ideas")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I2
			### Ideas
			- [ ] I3
			- [ ] I1

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
		expect(await written(T, ["B2"], null)).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several into a section", async () => {
		expect(await written(T, ["N1", "N3"], "Работа")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3b
			### Работа
			- [ ] N4
			- [ ] N1 📅 2026-10-30
				- [ ] N1a
			- [ ] N3 📅 2026-10-30

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several into the section they share", async () => {
		expect(await written(T, ["N3b", "N3"], "Work")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3 📅 2026-10-30
			- [ ] N3b 📅 2026-10-30
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several of Soon out of their sections, each keeping its due date", async () => {
		expect(await written(D, ["ST", "S2"], null)).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			- [ ] S2
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several into a preset the list lacks, and into a new name", async () => {
		expect(await written(T, ["I1", "I2"], "Morning")).toMatchInlineSnapshot(`
			"## Inbox

			### Ideas
			- [ ] I3
			### Morning
			- [ ] I1
			- [ ] I2

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Работа
			- [ ] N4

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
		expect(await written(T, ["N1", "N4"], "Экскурсия")).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			### Work
			- [ ] N3
			- [ ] N3b
			### Экскурсия
			- [ ] N1 📅 2026-10-30
				- [ ] N1a
			- [ ] N4 📅 2026-10-30

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});
});

let n = 0;
const item = (text: string, group: GroupName): TaskItem => onDay({
	key: { section: "now", index: n++, path: [], raw: `- [ ] ${text}` },
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group,
	subtasks: [],
	progress: null,
	parentText: null, description: null,
	list: "now",
	isSubtask: false,
}, "2026-11-01");
const grouped = (items: readonly TaskItem[]) => listView(items, true).groups;

describe("listView", () => {
	it("groups consecutive items by their section", () => {
		const groups = grouped([item("A", null), item("B", "X"), item("C", "X"), item("D", "Y")]);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.text)])).toEqual([[null, ["A"]], ["X", ["B", "C"]], ["Y", ["D"]]]);
	});

	it("gathers a section's tasks where it first shows: a later day lists Now's tasks before Soon's", () => {
		const groups = grouped([item("N", null), item("A", null), item("M", "Morning"), item("B", null)]);
		expect(groups.map((g) => [g.name, g.items.map((i) => i.text)])).toEqual([[null, ["N", "A", "B"]], ["Morning", ["M"]]]);
	});

	it("no headers without a named group", () => {
		expect(listView([item("A", null), item("B", null)], true).showsHeaders).toBe(false);
		expect(listView([], true).showsHeaders).toBe(false);
	});

	it("no header when the only group is ungrouped", () => {
		expect(listView([item("A", null)], true)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [expect.objectContaining({ text: "A" })] }] });
	});

	it("a header when the only group is a section", () => {
		expect(listView([item("A", "Экскурсия")], true).showsHeaders).toBe(true);
	});

	it("a list that shows no sections: all its tasks outside any, without headers, an empty one too", () => {
		expect(listView([item("A", null), item("B", "X")], false)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [expect.objectContaining({ text: "A" }), expect.objectContaining({ text: "B" })] }] });
		expect(listView([], false)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [] }] });
		expect(listView([], true)).toEqual({ showsHeaders: false, groups: [] });
	});
});
