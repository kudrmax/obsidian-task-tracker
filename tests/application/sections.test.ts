import { describe, expect, it } from "vitest";
import { type GroupName, listView, type SectionChoice, sectionChoice, StaleTaskError, type TaskItem } from "../../src/application/contracts";
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
 * task for the later day outside any section, Trip holding only tasks of that day, the preset Morning. Now and Soon each
 * end with an empty section, which stays (empty sections spec). Done: a task.
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
	"### Пусто",
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
	"### Empty",
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

/** What a menu over these tasks offers on `day`, and whether they all stand in its current section, as the bulk menu checks it. */
async function choice(svc: Svc, day: string, texts: readonly string[], done = false): Promise<(SectionChoice & { shared: boolean }) | null> {
	const data = await screen(svc, day);
	const items = byText(data);
	const tasks = texts.map((text) => items.get(text)!);
	if (done) tasks.push(doneItem(data));
	const found = sectionChoice(tasks, await svc.sectionOffer(day));
	return found && { ...found, shared: tasks.every((task) => task.group === tasks[0].group) };
}

async function toSection(svc: Svc, day: string, texts: readonly string[], name: GroupName): Promise<void> {
	const items = byText(await screen(svc, day));
	await svc.toSection(texts.map((text) => items.get(text)!.key), name);
}

async function written(day: string, texts: readonly string[], name: GroupName): Promise<string> {
	const { store, svc } = setup();
	await toSection(svc, day, texts, name);
	return store.text!;
}

describe("the sections a task's menu offers", () => {
	it("a task of Now today: the sections its list shows today, then the presets it lacks", async () => {
		expect(await choice(setup().svc, T, ["N1"])).toEqual({ names: ["Work", "Работа", "Пусто", "Morning", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: true });
	});

	it("an empty section is offered too, where its column draws it", async () => {
		expect((await choice(setup().svc, T, ["N3"]))?.names).toEqual(["Work", "Работа", "Пусто", "Morning", "Afternoon", "Evening"]);
		expect((await choice(setup().svc, T, ["S1"]))?.names).toEqual(["Later", "Morning", "Empty", "Afternoon", "Evening"]);
		expect((await choice(setup().svc, D, ["S1"]))?.names).toEqual(["Trip", "Later", "Morning", "Empty", "Afternoon", "Evening"]);
	});

	it("a task in a section: that one is current", async () => {
		expect((await choice(setup().svc, T, ["N3"]))?.current).toBe("Work");
	});

	it("a task of Soon today: the sections of Soon without a date; one with only another day's tasks is none of them, an empty one is", async () => {
		expect(await choice(setup().svc, T, ["S1"])).toEqual({ names: ["Later", "Morning", "Empty", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: true });
	});

	it("a task of Soon on a later day: that day's sections first, then those of Soon without a date", async () => {
		expect((await choice(setup().svc, D, ["S1"]))?.names).toEqual(["Trip", "Later", "Morning", "Empty", "Afternoon", "Evening"]);
		expect((await choice(setup().svc, D, ["SD"]))?.names).toEqual(["Trip", "Later", "Morning", "Empty", "Afternoon", "Evening"]);
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
		expect(await choice(setup().svc, T, ["N1", "N3"])).toEqual({ names: ["Work", "Работа", "Пусто", "Morning", "Afternoon", "Evening"], current: null, ungrouped: "No section", shared: false });
		expect(await choice(setup().svc, T, ["N3", "N3b"])).toMatchObject({ current: "Work", shared: true });
		expect(await choice(setup().svc, D, ["SD", "S1"])).toMatchObject({ names: ["Trip", "Later", "Morning", "Empty", "Afternoon", "Evening"], current: null, shared: true });
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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into its own section, as New section with its name: nothing written", async () => {
		expect(await written(T, ["N3"], "Work")).toBe(FILE);
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
			### Пусто
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
			### Empty

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
			### Пусто
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
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("one task into an empty section", async () => {
		expect(await written(T, ["N1"], "Пусто")).toMatchInlineSnapshot(`
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
			### Пусто
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
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("the last task out of its section: the section goes", async () => {
		expect(await written(T, ["N4"], null)).toMatchInlineSnapshot(`
			"## Inbox

			- [ ] I1
			- [ ] I2
			### Ideas
			- [ ] I3

			## Now

			- [ ] N1
				- [ ] N1a
			- [ ] NE ⏰ 2026-10-30 19:00-20:00
			- [ ] N4 📅 2026-10-30
			### Work
			- [ ] N3
			- [ ] N3b
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
		expect(await written(T, ["N4"], "Work")).toMatchInlineSnapshot(`
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
			- [ ] N4 📅 2026-10-30
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто
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
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			### Later
			- [ ] S2
			- [ ] SD 📅 2026-11-03
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			- [ ] ST 📅 2026-11-03
			### Later
			- [ ] S2
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

			## Backlog

			- [ ] B1
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several into an empty section, one of them the last of its own", async () => {
		expect(await written(T, ["N4", "N1"], "Пусто")).toMatchInlineSnapshot(`
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
			### Пусто
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
			### Empty

			## Backlog

			- [ ] B1
			### Someday
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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("several into the section they share: nothing written", async () => {
		expect(await written(T, ["N3b", "N3"], "Work")).toBe(FILE);
	});

	it("several, some already in the section: only the others move, the rest stay where they are", async () => {
		const text = await written(T, ["N3", "N4"], "Work");
		expect(text).toContain(["### Work", "- [ ] N3", "- [ ] N3b", "- [ ] N4 📅 2026-10-30", "### Пусто"].join("\n"));
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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			- [ ] S2
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

			## Backlog

			- [ ] B1
			### Someday
			- [ ] B2

			## Done

			- [x] X1
			"
		`);
	});

	it("a task changed in the file since it was read: rejected, nothing written", async () => {
		const { store, svc } = setup();
		const n1 = byText(await screen(svc, T)).get("N1")!;
		const stale = { ...n1.key, raw: "- [ ] N1 before" };
		await expect(svc.toSection([stale], "Work")).rejects.toBeInstanceOf(StaleTaskError);
		await expect(svc.toSection([stale, byText(await screen(svc, T)).get("N4")!.key], "Work")).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(FILE);
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
			### Пусто

			## Soon

			- [ ] S1
			- [ ] SD 📅 2026-11-03
			### Later
			- [ ] S2
			### Trip
			- [ ] ST 📅 2026-11-03
			### Morning
			- [ ] SM
			### Empty

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
			### Пусто
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
			### Empty

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

const NO_MENU = { rename: false, remove: false };

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
		expect(listView([item("A", null)], true)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [expect.objectContaining({ text: "A" })], can: NO_MENU }] });
	});

	it("a header when the only group is a section", () => {
		expect(listView([item("A", "Экскурсия")], true).showsHeaders).toBe(true);
	});

	it("a list that shows no sections: all its tasks outside any, without headers, an empty one too", () => {
		expect(listView([item("A", null), item("B", "X")], false)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [expect.objectContaining({ text: "A" }), expect.objectContaining({ text: "B" })], can: NO_MENU }] });
		expect(listView([], false)).toEqual({ showsHeaders: false, groups: [{ name: null, items: [], can: NO_MENU }] });
		expect(listView([], true)).toEqual({ showsHeaders: false, groups: [] });
	});
});

describe("listView with empty sections", () => {
	const sections = (...names: [GroupName, boolean][]) => names.map(([name, empty]) => ({ name, empty }));
	const names = (view: { groups: readonly { name: GroupName; items: readonly TaskItem[] }[] }) => view.groups.map((g) => [g.name, g.items.length]);

	it("puts an empty section where it stands in the file, after the group drawn above it", () => {
		const view = listView([item("A", null), item("B", "Evening")], true, sections([null, false], ["Morning", true], ["Evening", false], ["Later", true]));
		expect(names(view)).toEqual([[null, 1], ["Morning", 0], ["Evening", 1], ["Later", 0]]);
	});

	it("an empty section first in the file comes first; one section, empty, turns the headers on", () => {
		const view = listView([item("A", null)], true, sections(["Morning", true], [null, false]));
		expect(view.groups.map((g) => g.name)).toEqual(["Morning", null]);
		expect(view.showsHeaders).toBe(true);
	});

	it("a section with tasks the column does not show stays out", () => {
		expect(listView([item("A", null)], true, sections([null, false], ["Evening", false])).groups).toHaveLength(1);
	});

	it("a list that shows no sections draws no empty one", () => {
		expect(listView([item("A", null)], false, sections(["Morning", true], [null, false]))).toEqual({ showsHeaders: false, groups: [{ name: null, items: [expect.objectContaining({ text: "A" })], can: NO_MENU }] });
	});
});
