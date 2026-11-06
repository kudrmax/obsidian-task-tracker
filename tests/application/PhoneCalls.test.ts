import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../src/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext, doorMethods, HOST_CALENDAR_METHODS, HOST_DAY_METHODS, HOST_TASK_METHODS } from "../../src/application/PhoneCalls";
import type { Clock } from "../../src/application/ports";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { UndoHistory } from "../../src/application/UndoHistory";
import { settingsFrom } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * The door answers every call as the plugin's own services do, over the same text, and every answer crosses JavaScriptCore
 * as plain JSON: no Date, no function, no class, no undefined field.
 */

const NOW = new Date(2026, 10, 4, 9, 30);
const T = "2026-11-04";
const LATER = "2026-11-06";
const clock: Clock = { now: () => NOW };
const SETTINGS = JSON.stringify({ labels: [{ name: "Fast", color: "green" }], groups: { presets: ["Home"], ungrouped: "No section" } });

const FILE = [
	"## Inbox",
	"",
	"- [ ] Idea",
	"- [ ] p1 Call the bank",
	"",
	"## Now",
	"",
	"- [ ] Morning run ⏰ 2026-11-04 07:00-08:00",
	"- [ ] Parent 📅 2026-11-04",
	"\t- [ ] Child one",
	"\t- [x] Child done",
	"\t\tA note",
	"- [/] In progress #label/Fast",
	"- [ ] Lunch ⏰ 2026-11-04 13:00-14:00 🔁 every day",
	"### Errands",
	"- [ ] Shop",
	"",
	"## Soon",
	"",
	"- [ ] Later",
	"- [ ] Dated 📅 2026-11-03",
	"",
	"## Backlog",
	"",
	"- [ ] Someday",
	"",
	"## Done",
	"",
	"- [x] Long ago",
	"",
].join("\n");

function service(text: string | null = FILE): { store: InMemoryTaskFileStore; svc: TaskServiceImpl } {
	const store = new InMemoryTaskFileStore(text);
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(settingsFrom(JSON.parse(SETTINGS))), clock, new UndoHistory(store)) };
}

const context = (tasks: string | null = FILE, extra: Partial<DoorContext> = {}): DoorContext => ({ tasks, settings: SETTINGS, nowMs: NOW.getTime(), ...extra });

/** The value as JSON reads it back: what the iOS app gets. */
const wire = <T>(value: T): T => (value === undefined ? null : JSON.parse(JSON.stringify(value))) as T;

interface Case {
	readonly method: string;
	readonly args: (screen: ScreenView) => unknown[];
	readonly text?: string | null;
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const all = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
const named = (s: ScreenView, title: string): TaskItem => {
	const item = all(s).find((i) => i.title === title || i.text === title);
	if (!item) throw new Error(`no ${title}`);
	return item;
};
const key = (s: ScreenView, title: string) => named(s, title).key;
const menuScreen = (s: ScreenView) => ({ today: T, day: T, offer: s.offer });

/** Every TaskService method the door answers, with arguments taken from the screen as read. */
const TASK_CASES: readonly Case[] = [
	{ method: "priorityLevels", args: () => [] },
	{ method: "labelLevels", args: () => [] },
	{ method: "parseTitle", args: () => ["p1 Ring"] },
	{ method: "isBlank", args: () => ["p1 "] },
	{ method: "withPriority", args: () => ["Ring", "p1"] },
	{ method: "draftMarks", args: () => ["p2 Ring", null, ["Fast"]] },
	{ method: "screen", args: () => [T] },
	{ method: "screen", args: () => [LATER] },
	{ method: "screen", args: () => [T], text: null },
	{ method: "screen", args: () => [T], text: "## Now\n\n- [x] Closed\n- [ ] Open\n" },
	{ method: "dayView", args: () => [T] },
	{ method: "soonWithoutDateView", args: () => [] },
	{ method: "inboxView", args: () => [] },
	{ method: "backlogView", args: () => [] },
	{ method: "doneView", args: () => [] },
	{ method: "dayView", args: () => [T], text: null },
	{ method: "search", args: () => ["chil"] },
	{ method: "search", args: () => ["note"] },
	{ method: "search", args: () => ["  "] },
	{ method: "screenOf", args: (s) => [named(s, "Child one")] },
	{ method: "reveal", args: (s) => [named(s, "Child one")] },
	{ method: "reveal", args: (s) => [named(s, "Dated")] },
	{ method: "findIn", args: (s) => [s.day.list, key(s, "Child one")] },
	{ method: "listSections", args: () => [] },
	{ method: "sectionOffer", args: () => [LATER] },
	{ method: "createInList", args: () => [LATER, "New later"] },
	{ method: "createInSoon", args: () => ["New soon"] },
	{ method: "createAtTime", args: () => [T, 600, "At ten"] },
	{ method: "createInPlace", args: () => ["Placed", "p1", { kind: "list", list: "now", group: "Errands", before: null }, null, ["Fast"]] },
	{ method: "createInPlace", args: (s) => ["Sub", null, { kind: "subtask", parent: key(s, "Parent"), before: null }] },
	{ method: "createInPlace", args: () => ["   ", null, { kind: "day", date: T, group: null, before: null }] },
	{ method: "create", args: () => [{ text: "Drafted", placement: { kind: "soon" }, priority: null }] },
	{ method: "create", args: () => [{ text: "Slotted", placement: { kind: "now" }, priority: null }, { date: T, start: 900, end: 960 }] },
	{ method: "createSubtask", args: (s) => [key(s, "Parent"), { text: "Under", placement: { kind: "now" }, priority: null }] },
	{ method: "edit", args: (s) => [key(s, "Later"), { text: "Later, renamed", placement: { kind: "date", date: LATER }, priority: null }] },
	{ method: "placementOf", args: (s) => [named(s, "Dated")] },
	{ method: "dayColumn", args: () => [LATER] },
	{ method: "columnSections", args: () => ["day", T] },
	{ method: "placementOfDay", args: () => [LATER] },
	{ method: "listName", args: () => ["backlog"] },
	{ method: "dayOfPlacement", args: () => [{ kind: "now" }] },
	{ method: "setStatus", args: (s) => [key(s, "Lunch"), "done"] },
	{ method: "toggleDone", args: (s) => [key(s, "Idea")] },
	{ method: "setDueDate", args: (s) => [key(s, "Later"), LATER] },
	{ method: "setPriority", args: (s) => [key(s, "Idea"), "p1"] },
	{ method: "setLabels", args: (s) => [key(s, "Idea"), ["Fast"]] },
	{ method: "setLabelsAll", args: (s) => [[{ key: key(s, "Idea"), labels: ["Fast"] }, { key: key(s, "Someday"), labels: ["Fast"] }]] },
	{ method: "setReminder", args: (s) => [key(s, "Morning run"), "alarm"] },
	{ method: "togglePriority", args: (s) => [[key(s, "Idea"), key(s, "Someday")], "p1"] },
	{ method: "togglePriority", args: () => [[], "p1"] },
	{ method: "toggleLabel", args: (s) => [[key(s, "Idea")], "Fast"] },
	{ method: "removeDue", args: (s) => [[key(s, "Dated"), key(s, "Parent")]] },
	{ method: "menu", args: (s) => [named(s, "Parent"), "day", menuScreen(s)] },
	{ method: "bulkMenu", args: (s) => [[{ item: named(s, "Idea"), from: "inbox" }, { item: named(s, "Later"), from: "soon" }], menuScreen(s)] },
	{ method: "pickStatus", args: (s) => [[key(s, "Lunch")], "stop"] },
	{ method: "pickStatus", args: (s) => [[key(s, "Idea"), key(s, "Later")], "wontDo"] },
	{ method: "postponeAll", args: (s) => [[key(s, "Shop"), key(s, "Long ago")], LATER] },
	{ method: "removeAll", args: (s) => [[key(s, "Idea"), key(s, "Someday")]] },
	{ method: "carried", args: (s) => [key(s, "Parent"), [key(s, "Parent"), key(s, "Child one"), key(s, "Idea")]] },
	{ method: "setCollapsed", args: (s) => [key(s, "Parent"), true] },
	{ method: "unfoldAbove", args: (s) => [key(s, "Child one")] },
	{ method: "setRepeat", args: (s) => [key(s, "Later"), { kind: "schedule", every: 2, unit: "week", days: [0], dayOfMonth: null, from: null }] },
	{ method: "stop", args: (s) => [key(s, "Lunch")] },
	{ method: "rename", args: (s) => [key(s, "Idea"), "p1 Idea, better"] },
	{ method: "rename", args: (s) => [key(s, "Idea"), "Idea"] },
	{ method: "fullTree", args: (s) => [named(s, "Parent")] },
	{ method: "setDescription", args: (s) => [key(s, "Idea"), "- a point"] },
	{ method: "remove", args: (s) => [key(s, "Someday")] },
	{ method: "lineOf", args: (s) => [key(s, "Shop")] },
	{ method: "find", args: (s) => [key(s, "Shop"), "Shop"] },
	{ method: "moveBefore", args: (s) => [key(s, "Later"), key(s, "Shop"), T] },
	{ method: "nest", args: (s) => [key(s, "Shop"), key(s, "Parent"), null] },
	{ method: "setSlot", args: (s) => [key(s, "Shop"), { date: T, start: 1020, end: 1080 }] },
	{ method: "shownSpan", args: (s) => [named(s, "Morning run"), T] },
	{ method: "dropSpan", args: (s) => [named(s, "Morning run"), "timeline", 600] },
	{ method: "dropSpan", args: () => [null, "new", 1430] },
	{ method: "newSlot", args: () => [T, 615] },
	{ method: "stretch", args: (s) => [named(s, "Morning run"), T, "end", 540] },
	{ method: "resize", args: (s) => [key(s, "Morning run"), T, "end", 540, 15] },
	{ method: "resize", args: (s) => [key(s, "Morning run"), T, "end", 480, 15] },
	{ method: "clearSlot", args: (s) => [key(s, "Morning run")] },
	{ method: "clearSlot", args: (s) => [key(s, "Morning run"), { before: key(s, "Parent"), date: T }] },
	{ method: "moveToList", args: (s) => [key(s, "Later"), T] },
	{ method: "moveToSoon", args: (s) => [key(s, "Shop"), T] },
	{ method: "postpone", args: (s) => [key(s, "Shop"), LATER] },
	{ method: "moveToEnd", args: (s) => [key(s, "Later"), "backlog"] },
	{ method: "moveToGroup", args: (s) => [key(s, "Later"), "now", "Errands", null] },
	{ method: "createGroup", args: (s) => [key(s, "Later"), "soon", "Home"] },
	{ method: "toSection", args: (s) => [[key(s, "Idea")], "Home"] },
	{ method: "toSection", args: (s) => [[key(s, "Idea"), key(s, "Call the bank")], null] },
	{ method: "moveGroup", args: () => ["now", "Errands", "end"] },
	{ method: "renameGroup", args: () => ["now", "Errands", "Shopping"] },
	{ method: "renameGroup", args: () => ["now", "Errands", "Errands"] },
	{ method: "removeGroup", args: () => ["now", "Errands"] },
	{ method: "createSection", args: (s) => ["Evening", { kind: "day", date: T, group: null, before: key(s, "In progress") }] },
	{ method: "applyAll", args: (s) => [[{ key: key(s, "Idea"), change: { kind: "moveToEnd", section: "soon" } }, { key: key(s, "Shop"), change: { kind: "status", status: "done" } }]] },
	{ method: "drop", args: (s) => [[{ key: key(s, "Later"), from: "soon" }], { kind: "time", start: 660 }, T] },
	{ method: "drop", args: (s) => [[{ key: key(s, "Idea"), from: "inbox" }, { key: key(s, "Someday"), from: "backlog" }], { kind: "list", column: "soon", before: null }, T] },
	{ method: "normalize", args: () => [] },
	{ method: "normalize", args: () => [], text: "## Now\n\n- [ ] Old ⏰ 2026-10-01 10:00\n" },
	{ method: "createFile", args: () => [], text: null },
	{ method: "setStatus", args: (s) => [{ ...key(s, "Idea"), raw: "- [ ] Gone" }, "done"] },
];

/** What the service answers, and the text it leaves; an error by its code. */
async function serviceAnswer(c: Case, screen: ScreenView): Promise<{ result: unknown; text: string | null; steps: boolean }> {
	const { store, svc } = service(c.text === undefined ? FILE : c.text);
	const before = store.text;
	const history = (svc as unknown as { history: UndoHistory }).history;
	try {
		const result = await (svc as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[c.method](...c.args(screen));
		return { result: wire(result), text: store.text === before ? null : store.text, steps: history.canUndo() };
	} catch (e) {
		return { result: { error: (e as { code?: string }).code ?? "failed" }, text: null, steps: false };
	}
}

function doorAnswer(answer: DoorAnswer): { result: unknown; text: string | null; steps: boolean } {
	if (!answer.ok) return { result: { error: answer.error.code }, text: null, steps: false };
	return { result: answer.result, text: answer.tasks ?? null, steps: answer.step === true };
}

describe("the door's tasks.* calls", () => {
	it("answer as TaskServiceImpl does over the same text, and write the same file", async () => {
		const screen = await service().svc.screen(T);
		for (const c of TASK_CASES) {
			const door = callDoor(`tasks.${c.method}`, wire(c.args(screen)), context(c.text === undefined ? FILE : c.text));
			expect({ method: c.method, ...doorAnswer(door) }).toEqual({ method: c.method, ...(await serviceAnswer(c, screen)) });
		}
	});

	it("cover every method of TaskService but the host's own", () => {
		const declared = interfaceMethods("TaskService");
		const offered = doorMethods().filter((m) => m.startsWith("tasks.")).map((m) => m.slice("tasks.".length));
		expect([...offered, ...HOST_TASK_METHODS].sort()).toEqual(declared.sort());
		expect(new Set(TASK_CASES.map((c) => c.method))).toEqual(new Set(offered));
	});
});

/** The method names of an interface of contracts.ts. */
function interfaceMethods(name: string): string[] {
	const text = readFileSync("src/application/contracts.ts", "utf8");
	const body = text.slice(text.indexOf(`export interface ${name} {`));
	const block = body.slice(0, body.indexOf("\n}\n"));
	return [...block.matchAll(/^\t([a-zA-Z]+)\(/gm)].map((m) => m[1]);
}

describe("the door's other services", () => {
	it("cover DayService and CalendarService but what the host watches", () => {
		const offered = (space: string) => doorMethods().filter((m) => m.startsWith(`${space}.`)).map((m) => m.slice(space.length + 1));
		expect(interfaceMethods("DayService").filter((m) => !offered("days").includes(m)).sort()).toEqual([...HOST_DAY_METHODS].sort());
		expect(interfaceMethods("CalendarService").filter((m) => !offered("calendars").includes(m)).sort()).toEqual([...HOST_CALENDAR_METHODS].sort());
		expect(interfaceMethods("UndoService").filter((m) => !offered("history").includes(m))).toEqual(["onChange"]);
	});
});

const iso = (day: number, h: number) => new Date(2026, 10, day, h).toISOString();
const CALENDARS = {
	google: JSON.stringify({
		exportedAt: iso(4, 8),
		calendars: [{ calendar: "Personal", account: "max@gmail.com", calendarId: "p" }],
		events: [
			{ id: "l", title: "Lunch", start: iso(4, 13), end: iso(4, 14), allDay: false, calendar: "Personal", calendarId: "p", account: "max@gmail.com" },
			{ id: "b", title: "Breakfast", start: iso(4, 8), end: iso(4, 9), allDay: false, calendar: "Personal", calendarId: "p", account: "max@gmail.com" },
		],
	}),
	iphone: null,
	work: "{",
};

/** One call of every method the door answers, with arguments of its kind: each answer must survive JSON unchanged. */
function everyCall(screen: ScreenView): { method: string; args: unknown[]; context: DoorContext }[] {
	const card = (title: string, level = 0, group: string | null = null) => ({ key: key(screen, title), level, group });
	const look = { cards: { day: [card("Parent"), card("Child one", 1), card("In progress")], soon: [card("Later"), card("Dated")] }, sections: { day: [null, "Errands"] }, sectioned: { day: true }, day: T, shown: ["day"] };
	const gap = { kind: "gap", index: 1, level: 1, group: null };
	const rule = { kind: "afterDone", every: 1, unit: "day", days: [], dayOfMonth: null, from: null };
	const tasks = TASK_CASES.map((c) => ({ method: `tasks.${c.method}`, args: c.args(screen), context: context(c.text === undefined ? FILE : c.text) }));
	const plain = (method: string, ...args: unknown[]) => ({ method, args, context: context(FILE, { calendars: CALENDARS }) });
	const entry = (method: string, ...args: unknown[]) => plain(`entry.${method}`, null, look, ...args);
	const opened = callDoor("entry.openAtEnd", wire([null, look, "day"]), context()) as Extract<DoorAnswer, { ok: true }>;
	const typed = callDoor("entry.type", wire([(opened.result as { session: unknown }).session, look, "Buy milk"]), context()) as Extract<DoorAnswer, { ok: true }>;
	const entered = callDoor("entry.enter", wire([(typed.result as { session: unknown }).session, look]), context()) as Extract<DoorAnswer, { ok: true }>;
	const { session, jobs } = entered.result as { session: unknown; jobs: { id: string }[] };
	const job = jobs[0].id;
	return [
		...tasks,
		plain("days.today"),
		plain("days.relation", LATER),
		plain("days.step", T, -3),
		plain("days.boundary"),
		...["startHour", "hourAt", "offsetOfHour"].map((m) => plain(`boundary.${m}`, 3)),
		plain("boundary.dayOf", NOW.getTime()),
		plain("boundary.dayOfSlot", { date: T, start: 30, end: null }),
		plain("boundary.offsetOf", T, NOW.getTime()),
		plain("boundary.clipToDay", T, NOW.getTime() - 3_600_000 * 12, NOW.getTime()),
		plain("boundary.spanOf", { date: T, start: 600, end: 660 }, T),
		plain("boundary.slotAt", T, 600, null),
		plain("boundary.clamp", { date: T, start: 1430, end: 1500 }, 15),
		plain("calendars.events", T),
		plain("calendars.isPast", { endMs: NOW.getTime() }),
		plain("calendars.known"),
		plain("calendars.setShown", "max@gmail.com", "Personal", false),
		plain("history.undo"),
		plain("history.redo"),
		plain("history.canUndo"),
		plain("history.canRedo"),
		plain("sectionName.end", false, "enter", " Name "),
		plain("rules.constants"),
		plain("rules.nextProgress", ["todo", "inProgress"]),
		plain("rules.sameSlot", { date: T, start: 1, end: null }, { date: T, start: 1, end: null }),
		plain("rules.sameRule", rule, null),
		plain("rules.repeatParts", rule),
		plain("rules.repeatDraft", T, rule),
		plain("rules.editRepeat", wire(callDoor("rules.repeatDraft", [T, null], context()) as { result: unknown }).result, { what: "kind", to: "schedule" }),
		plain("rules.samePlacement", { kind: "now" }, { kind: "date", date: T }),
		...["keyId"].map((m) => plain(`rules.${m}`, key(screen, "Shop"))),
		...["sameLine", "samePlace", "sameTaskTree"].map((m) => plain(`rules.${m}`, key(screen, "Shop"), key(screen, "Parent"))),
		plain("rules.fitLevel", look.cards.day, gap),
		plain("rules.gapOfPlace", look.cards.day, { kind: "task", group: null, before: null }),
		plain("rules.levelRange", look.cards.day, 1, null),
		plain("rules.placeOfGap", look.cards.day, gap),
		plain("rules.shiftLevel", look.cards.day, gap, -1),
		plain("rules.gapAt", look.cards.day, 1, 0.6, [], true),
		plain("rules.groupPlaceOf", [null, "Errands"], 0, 2),
		plain("rules.placeOfDrop", look.cards.day, gap, null),
		plain("rules.sameGap", gap, gap),
		plain("rules.listView", screen.day.list, true, screen.sections.now),
		plain("rules.sectionChoice", [named(screen, "Shop")], screen.offer),
		plain("rules.cardDue", named(screen, "Dated"), T),
		plain("rules.textParts", "See [[Note|it]] and https://x.org"),
		plain("rules.oneLine", "a\r\nb"),
		plain("rules.sameLevels", [{ prefix: "p1", color: "red" }], [{ prefix: "p1", color: "red" }]),
		plain("rules.labelTitle", "Very_Fast"),
		plain("rules.sameLabels", [], []),
		plain("rules.isPresetColor", "red"),
		plain("rules.acceptsDrop", "inbox", ["soon"]),
		plain("rules.placesInGap", "soon", "day", false),
		...[
			["openAtEnd", "soon"],
			["openFromPlus"],
			["openIn", "day", "Errands"],
			["openSlot", { date: T, start: 600, end: null }],
			["openAtDrop", "day", { kind: "list", column: "day", before: null }],
			["subtaskSpot", key(screen, "Parent")],
			["renameSpot", named(screen, "Later"), false],
			["open", { kind: "list", column: "day", place: gap }],
			["state"],
			["renaming"],
			["listEntry", "day"],
			["placeOf", "day", { kind: "task", group: null, before: null }],
		].map(([m, ...a]) => entry(m as string, ...a)),
		...[["type", "x"], ["setPriority", "p1"], ["togglePriority", "p1"], ["setLabels", ["Fast"]], ["toggleLabel", "Fast"], ["setRepeat", rule], ["indent", 1], ["toggleSection"], ["enter"], ["blur"], ["escape"], ["choosePlace", { kind: "soon" }], ["moveToEnd", "soon"]].map(([m, ...a]) =>
			plain(`entry.${m}`, (opened.result as { session: unknown }).session, look, ...a),
		),
		...[["call", job], ["job", job], ["shown", job, null, {}], ["unshown", job], ["done", job]].map(([m, ...a]) => plain(`entry.${m}`, session, look, ...a)),
	];
}

describe("every answer of the door", () => {
	it("is plain JSON: it reads back from its text exactly as it was", async () => {
		const screen = await service().svc.screen(T);
		const calls = everyCall(screen);
		expect(new Set(calls.map((c) => c.method))).toEqual(new Set(doorMethods()));
		for (const { method, args, context } of calls) {
			const answer = callDoor(method, wire(args), context);
			expect({ method, answer }).toStrictEqual({ method, answer: JSON.parse(JSON.stringify(answer)) });
			if (!answer.ok) expect({ method, code: answer.error.code }).toEqual({ method, code: expect.stringMatching(/^(staleTask|tasksFileMissing)$/) });
		}
	});

	it("names a task gone stale and a missing file by their codes, and a method it lacks", () => {
		expect(callDoor("tasks.dayView", [T], context(null))).toMatchObject({ ok: false, error: { code: "tasksFileMissing" } });
		expect(callDoor("tasks.setStatus", [{ section: "now", index: 0, path: [], raw: "- [ ] Nothing" }, "done"], context())).toMatchObject({ ok: false, error: { code: "staleTask" } });
		expect(callDoor("tasks.onChange", [], context())).toMatchObject({ ok: false, error: { code: "unknownMethod" } });
		expect(callDoor("tasks.toString", [], context())).toMatchObject({ ok: false, error: { code: "unknownMethod" } });
	});
});

describe("the door's history", () => {
	it("takes a step back and does it again over the text, as UndoHistory does", () => {
		const done = callDoor("tasks.createInSoon", ["One more"], context()) as Extract<DoorAnswer, { ok: true }>;
		expect(done).toMatchObject({ step: true });
		expect(done.tasks).toContain("- [ ] One more");
		expect(callDoor("history.canUndo", [], context(done.tasks!, { history: done.history }))).toMatchObject({ result: true });
		const back = callDoor("history.undo", [], context(done.tasks!, { history: done.history })) as Extract<DoorAnswer, { ok: true }>;
		expect(back).toMatchObject({ result: "done", tasks: FILE });
		const again = callDoor("history.redo", [], context(back.tasks!, { history: back.history })) as Extract<DoorAnswer, { ok: true }>;
		expect(again).toMatchObject({ result: "done", tasks: done.tasks });
		expect(callDoor("history.undo", [], context(FILE))).toMatchObject({ result: "nothing" });
	});

	it("tidies the file without a step", () => {
		const tidied = callDoor("tasks.normalize", [], context("## Now\n\n- [ ] Old ⏰ 2026-10-01 10:00\n")) as Extract<DoorAnswer, { ok: true }>;
		expect(tidied.tasks).toContain("- [ ] Old 📅 2026-11-04\n");
		expect(tidied.step).toBeUndefined();
	});
});

describe("the door's quick entry", () => {
	it("runs a typed task as the plugin's session does: a job that calls createInPlace where the field stood", () => {
		const screen = { cards: { day: [] }, day: T, shown: ["day"] };
		let answer = callDoor("entry.openFromPlus", [null, screen], context()) as Extract<DoorAnswer, { ok: true }>;
		const step = (method: string, ...args: unknown[]) => {
			answer = callDoor(`entry.${method}`, wire([(answer.result as { session: unknown }).session, screen, ...args]), context()) as Extract<DoorAnswer, { ok: true }>;
			return answer.result as { state: { text: string; pending: { text: string }[] } | null; jobs: { id: string }[]; value: unknown };
		};
		step("type", "Buy milk");
		const entered = step("enter");
		expect(entered.state).toMatchObject({ text: "", pending: [{ text: "Buy milk" }] });
		const [job] = entered.jobs;
		expect(step("call", job.id).value).toEqual({ method: "createInPlace", args: ["Buy milk", null, { kind: "day", date: T, group: null, before: null }, null, []] });
		const shown = step("shown", job.id, null, { day: [] });
		expect(shown.state?.pending).toEqual([]);
		step("done", job.id);
		expect((answer.result as { session: { jobs: unknown[] } }).session.jobs).toEqual([]);
	});

	it("opens the plus in Inbox where the screen shows no day list", () => {
		const answer = callDoor("entry.openFromPlus", [null, { cards: {}, day: T, shown: ["inbox", "backlog", "soon"] }], context()) as Extract<DoorAnswer, { ok: true }>;
		expect(answer.result).toMatchObject({ state: { spot: { kind: "list", column: "inbox" } } });
	});
});
