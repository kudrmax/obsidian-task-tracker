import { describe, expect, it } from "vitest";
import { acceptsDrop, type DropColumn, type DropFrom, type DropOrigin, type DropTo, placesInGap, type TaskItem, type TaskKey } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";
import { DEFAULT_SETTINGS } from "../../src/settings";

/** Today, a later day, a past day. */
const T = "2026-10-30";
const D = "2026-11-03";
const P = "2026-10-28";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };

/**
 * Every list with a task outside any section and one in a section; Now with subtasks, a task on today's timeline and
 * one overdue; Soon with a task for the later day; a task on the later day's timeline.
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
	"\t- [ ] N1b",
	"- [ ] N2 ⏰ 2026-10-30 10:00-11:00",
	"- [ ] NP 📅 2026-10-28",
	"- [ ] NP2 📅 2026-10-28",
	"### Work",
	"- [ ] N3",
	"",
	"## Soon",
	"",
	"- [ ] S1",
	"- [ ] S2",
	"- [ ] SD 📅 2026-11-03",
	"- [ ] ST ⏰ 2026-11-03 09:00-09:30",
	"### Later",
	"- [ ] S3",
	"",
	"## Backlog",
	"",
	"- [ ] B1",
	"### Someday",
	"- [ ] B2",
	"",
	"## Done",
	"",
].join("\n");

function setup(settings = new FakeSettingsStore()) {
	const store = new InMemoryTaskFileStore(FILE);
	const svc = new TaskServiceImpl(store, settings, clock);
	return { store, svc };
}

/** Minutes from the start of the day, which the settings start at 5, to `hour` o'clock: where a drop on the timeline lands. */
const hourAt = (hour: number) => (hour - DEFAULT_SETTINGS.dayStartHour) * 60;

type Svc = ReturnType<typeof setup>["svc"];

/** Every task the screen reads on these days, its subtasks too, by its text. */
async function itemsOf(svc: Svc): Promise<Map<string, TaskItem>> {
	const all: TaskItem[] = [];
	for (const day of [T, D, P]) {
		const view = await svc.dayView(day);
		all.push(...view.list, ...view.slotted);
	}
	all.push(...(await svc.soonWithoutDateView()), ...(await svc.inboxView()), ...(await svc.backlogView()));
	const byText = new Map<string, TaskItem>();
	const walk = (item: TaskItem) => {
		byText.set(item.text, item);
		item.subtasks.forEach(walk);
	};
	all.forEach(walk);
	return byText;
}

/** A drop as the gesture gives it: the tasks carried and where each came from, the target, the day the day column shows. */
interface DropCase {
	readonly name: string;
	readonly day: string;
	readonly tasks: readonly (readonly [string, DropFrom])[];
	readonly to: (key: (text: string) => TaskKey) => DropTo;
}

async function dropped(c: DropCase): Promise<string> {
	const { store, svc } = setup();
	const items = await itemsOf(svc);
	const key = (text: string): TaskKey => {
		const item = items.get(text);
		if (!item) throw new Error(`no task ${text}`);
		return item.key;
	};
	await svc.drop(c.tasks.map(([text, from]) => ({ key: key(text), from })), c.to(key), c.day);
	return store.text!;
}

const SINGLE: readonly DropCase[] = [
	{ name: "today's list → the timeline", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "a later day's list → its timeline: Soon with that day", day: D, tasks: [["SD", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "today's list → a later day's timeline: Now goes to Soon", day: D, tasks: [["N3", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "Soon → the timeline", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "Inbox → the timeline", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "Backlog → the timeline", day: T, tasks: [["B2", "backlog"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "a subtask → the timeline: it becomes a task", day: T, tasks: [["N1a", "day"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "the timeline → another time, with its duration", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "time", start: hourAt(15) }) },
	{ name: "the timeline → today's list before a task", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "the timeline → the end of a list", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the later day's timeline → its list", day: D, tasks: [["ST", "timeline"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the timeline → a section of today's list", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "the timeline → under a task", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: null }) },
	{ name: "clearSlot", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "clearSlot" }) },
	{ name: "a past day's list → before another of its tasks", day: P, tasks: [["NP2", "day"]], to: (k) => ({ kind: "list", column: "day", before: k("NP") }) },
	{ name: "a past day's list → its end", day: P, tasks: [["NP", "day"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Soon → a past day's list", day: P, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Inbox → a past day's list", day: P, tasks: [["I2", "inbox"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Backlog → a past day's list", day: P, tasks: [["B1", "backlog"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Soon → today's list without sections", day: T, tasks: [["S2", "soon"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "Soon → a later day's list without sections", day: D, tasks: [["S2", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "today's list → before a task", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "Soon's own card → before another in Soon", day: T, tasks: [["S2", "soon"]], to: (k) => ({ kind: "list", column: "soon", before: k("S1") }) },
	{ name: "Soon's own card → the end of Soon", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "today's list → the end of Soon", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "a later day's list → the end of Soon", day: D, tasks: [["SD", "day"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "Inbox → the end of Inbox", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "Soon → the end of Inbox", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "Soon → the end of Backlog", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "backlog", before: null }) },
	{ name: "Inbox → before a task of Backlog", day: T, tasks: [["I1", "inbox"]], to: (k) => ({ kind: "list", column: "backlog", before: k("B1") }) },
	{ name: "Soon → a section of today's list", day: T, tasks: [["S1", "soon"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "Inbox → the end of a section of today's list", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "Backlog → No section of today's list", day: T, tasks: [["B2", "backlog"]], to: (k) => ({ kind: "group", list: "now", date: null, group: null, before: k("N1") }) },
	{ name: "today's list → its section", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "Soon → a later day's list in a section", day: D, tasks: [["S1", "soon"]], to: () => ({ kind: "group", list: "soon", date: D, group: "Later", before: null }) },
	{ name: "today's list → a later day's list", day: D, tasks: [["N1", "day"]], to: (k) => ({ kind: "group", list: "soon", date: D, group: null, before: k("SD") }) },
	{ name: "a later day's list → a section of Soon", day: D, tasks: [["SD", "day"]], to: (k) => ({ kind: "group", list: "soon", date: null, group: "Later", before: k("S3") }) },
	{ name: "today's list → Soon", day: T, tasks: [["N3", "day"]], to: () => ({ kind: "group", list: "soon", date: null, group: null, before: null }) },
	{ name: "Inbox → Soon", day: T, tasks: [["I3", "inbox"]], to: (k) => ({ kind: "group", list: "soon", date: null, group: null, before: k("S2") }) },
	{ name: "Soon → a section of Inbox", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "group", list: "inbox", date: null, group: "Ideas", before: null }) },
	{ name: "today's list → Inbox", day: T, tasks: [["NP", "day"]], to: (k) => ({ kind: "group", list: "inbox", date: null, group: null, before: k("I2") }) },
	{ name: "Inbox → a section of Backlog", day: T, tasks: [["I1", "inbox"]], to: (k) => ({ kind: "group", list: "backlog", date: null, group: "Someday", before: k("B2") }) },
	{ name: "Backlog → Inbox", day: T, tasks: [["B1", "backlog"]], to: () => ({ kind: "group", list: "inbox", date: null, group: null, before: null }) },
	{ name: "a subtask → a section: it becomes a task", day: T, tasks: [["N1b", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "a subtask → before its sibling", day: T, tasks: [["N1b", "day"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1a") }) },
	{ name: "today's list → under a task, last", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: null }) },
	{ name: "Soon → under a task of today", day: T, tasks: [["S1", "soon"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1b") }) },
	{ name: "Inbox → under a task of Inbox", day: T, tasks: [["I2", "inbox"]], to: (k) => ({ kind: "nest", parent: k("I1"), before: null }) },
	{ name: "Backlog → under a task of Soon", day: T, tasks: [["B1", "backlog"]], to: (k) => ({ kind: "nest", parent: k("S2"), before: null }) },
	{ name: "a task → under a subtask", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "nest", parent: k("N1a"), before: null }) },
];

const SEVERAL: readonly DropCase[] = [
	{ name: "the day and Soon → before a task of a past day's list", day: P, tasks: [["NP2", "day"], ["S1", "soon"]], to: (k) => ({ kind: "list", column: "day", before: k("NP") }) },
	{ name: "the day and Soon → a past day's list's end", day: P, tasks: [["NP", "day"], ["S2", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the day, Soon and Inbox → a section of today's list", day: T, tasks: [["N1", "day"], ["S1", "soon"], ["I1", "inbox"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "Soon and Inbox → a later day's list", day: D, tasks: [["S2", "soon"], ["I2", "inbox"]], to: (k) => ({ kind: "group", list: "soon", date: D, group: null, before: k("SD") }) },
	{ name: "Soon and Inbox → Backlog", day: T, tasks: [["S1", "soon"], ["I3", "inbox"]], to: () => ({ kind: "group", list: "backlog", date: null, group: "Someday", before: null }) },
	{ name: "the day and Backlog → Inbox", day: T, tasks: [["N3", "day"], ["B1", "backlog"]], to: (k) => ({ kind: "group", list: "inbox", date: null, group: null, before: k("I1") }) },
	{ name: "two → under a task", day: T, tasks: [["N3", "day"], ["S1", "soon"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1b") }) },
	{ name: "the day and Soon → the end of Soon", day: T, tasks: [["N3", "day"], ["S2", "soon"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "the day and Soon → before a task of Soon", day: T, tasks: [["N3", "day"], ["S2", "soon"]], to: (k) => ({ kind: "list", column: "soon", before: k("S1") }) },
	{ name: "Soon and Inbox → the end of Inbox", day: T, tasks: [["S1", "soon"], ["I3", "inbox"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "a task with its own subtask → a section: the subtask goes along", day: T, tasks: [["N1", "day"], ["N1a", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "several → the timeline: nothing", day: T, tasks: [["N1", "day"], ["S1", "soon"]], to: () => ({ kind: "time", start: hourAt(12) }) },
];

/** The file after each drop, as the view and the bulk controller wrote it before the table moved here: `__snapshots__/drops.test.ts.snap` is that record. */
describe("what a drop writes (spec §5.1)", () => {
	describe("one task", () => {
		for (const c of SINGLE) it(c.name, async () => expect(await dropped(c)).toMatchSnapshot());
	});

	describe("several tasks", () => {
		for (const c of SEVERAL) it(c.name, async () => expect(await dropped(c)).toMatchSnapshot());
	});
});

describe("a drop on the timeline", () => {
	const midnight = () => setup(new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 0 }));
	const at = async (text: string, from: DropFrom, start: number, day = T) => {
		const { store, svc } = midnight();
		const item = (await itemsOf(svc)).get(text)!;
		await svc.drop([{ key: item.key, from }], { kind: "time", start }, day);
		return store.text!.split("\n").find((line) => line.includes(` ${text} `) || line.endsWith(` ${text}`));
	};

	it("a card from the timeline keeps its duration; the same task from a list gets none", async () => {
		expect(await at("N2", "timeline", 15 * 60)).toBe("- [ ] N2 ⏰ 2026-10-30 15:00-16:00");
		expect(await at("N2", "day", 15 * 60)).toBe("- [ ] N2 ⏰ 2026-10-30 15:00");
	});

	it("stands within the day: a card as long as it is, one without a duration five minutes before the end at the latest", async () => {
		expect(await at("N2", "timeline", 23 * 60 + 30)).toBe("- [ ] N2 ⏰ 2026-10-30 23:00-24:00");
		expect(await at("N1", "day", 24 * 60 + 10)).toMatch(/N1 📌 2026-10-30 23:55$/);
		expect(await at("N1", "day", -20)).toMatch(/N1 📌 2026-10-30 00:00$/);
	});

	it("dropSpan answers where the line under the finger stands, as the drop writes it", async () => {
		const { svc } = midnight();
		const n2 = (await itemsOf(svc)).get("N2")!;
		expect(svc.dropSpan(n2, "timeline", 23 * 60 + 30)).toEqual({ start: 23 * 60, end: 24 * 60 });
		expect(svc.dropSpan(n2, "day", 600)).toEqual({ start: 600, end: null });
		expect(svc.dropSpan(null, "new", 1500)).toEqual({ start: 1435, end: null });
	});
});

describe("which drops a target takes", () => {
	const ORIGINS: readonly DropOrigin[] = ["day", "soon", "inbox", "backlog", "timeline", "new"];
	const TAKES: Readonly<Record<DropColumn, readonly DropOrigin[]>> = {
		day: ["day", "soon", "inbox", "backlog", "timeline", "new"],
		soon: ["day", "soon", "inbox", "backlog", "new"],
		inbox: ["soon", "inbox", "backlog", "new"],
		backlog: ["soon", "inbox", "backlog", "new"],
	};

	for (const [column, takes] of Object.entries(TAKES) as [DropColumn, readonly DropOrigin[]][])
		it(`${column} takes a task from ${takes.join(", ")}`, () => {
			expect(ORIGINS.filter((from) => acceptsDrop(column, [from]))).toEqual(takes);
		});

	it("a list takes several only when it takes each by where it came from", () => {
		expect(acceptsDrop("inbox", ["soon", "backlog"])).toBe(true);
		expect(acceptsDrop("inbox", ["soon", "day"])).toBe(false);
		expect(acceptsDrop("soon", ["day", "inbox"])).toBe(true);
		expect(acceptsDrop("day", ["soon", "inbox", "backlog"])).toBe(true);
	});

	it("the timeline takes one task from anywhere, a new one too, never several", () => {
		for (const from of ORIGINS) expect(acceptsDrop("timeline", [from])).toBe(true);
		expect(acceptsDrop("timeline", ["day", "soon"])).toBe(false);
	});

	it("a list with sections shows a place for a task from anywhere; one without, only for its own task and a new one", () => {
		expect(placesInGap("day", "soon", true)).toBe(true);
		expect(placesInGap("day", "soon", false)).toBe(false);
		expect(placesInGap("day", "timeline", false)).toBe(false);
		expect(placesInGap("day", "day", false)).toBe(true);
		expect(placesInGap("day", "new", false)).toBe(true);
	});
});
