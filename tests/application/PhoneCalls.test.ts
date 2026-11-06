import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, callDoorJson, type DoorAnswer, type DoorContext, DOOR_COVERAGE, doorMethods, HOST_TASK_METHODS, plainJson } from "../../core/application/PhoneCalls";
import { ScreenSettingsImpl } from "../../core/application/ScreenSettingsImpl";
import { DEFAULT_ZOOM_LEVELS } from "../../core/application/timelineZoom";
import { SettingsServiceImpl } from "../../core/application/SettingsServiceImpl";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { settingsFrom } from "../../core/settings";
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

const LUNCH = "- [ ] Lunch ⏰ 2026-11-04 13:00-14:00 🔁 every day";

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
	{ method: "toggleCollapsed", args: (s) => [key(s, "Parent")] },
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
	{ method: "snap", args: () => [617, 56, 9] },
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
	{ method: "drop", args: (s) => [[{ key: key(s, "Idea"), from: "inbox" }], { kind: "place", column: "soon", place: { kind: "task", group: null, before: key(s, "Later") } }, T] },
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

const CONTRACTS = readFileSync("core/application/contracts.ts", "utf8");

/** Each interface a text declares, by name, with its body. */
function interfaces(text: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const m of text.matchAll(/^export interface (\w+)(?:<[^\n{]*>)?(?: extends [^\n{]+)? \{\n([\s\S]*?)^\}$/gm)) found.set(m[1], m[2]);
	return found;
}

/** The members of an interface body that are functions: methods, generic methods, and properties of a function type. */
function methodsOf(body: string): string[] {
	const names = new Set<string>();
	for (const m of body.matchAll(/^\t(?:readonly )?([A-Za-z_$][\w$]*)\??\s*(?:<[^\n]*?>)?\s*\(/gm)) names.add(m[1]);
	for (const m of body.matchAll(/^\t(?:readonly )?([A-Za-z_$][\w$]*)\??:\s*\(*\s*(?:<[^\n]*?>)?\s*\([^\n]*=>/gm)) names.add(m[1]);
	return [...names];
}

/** The method names of an interface of contracts.ts. */
function interfaceMethods(name: string): string[] {
	const body = interfaces(CONTRACTS).get(name);
	if (body === undefined) throw new Error(`no interface ${name} in contracts.ts`);
	return methodsOf(body);
}

describe("reading contracts.ts's interfaces", () => {
	it("finds methods, generic methods and properties of a function type, and nothing else", () => {
		const text = ["export interface Sample<T> extends Base {", "\tplain(a: number): void;", "\tgeneric<K extends string>(key: K): T;", "\toptional?(): void;", "\treadonly callback: (value: string) => void;", "\treadonly maybe: (() => Promise<void>) | null;", "\treadonly data: readonly string[];", "\tcount: number;", "}", ""].join("\n");
		expect(methodsOf(interfaces(text).get("Sample")!).sort()).toEqual(["callback", "generic", "maybe", "optional", "plain"]);
	});
});

describe("the door's coverage", () => {
	const offered = (space: string) => doorMethods().filter((m) => m.startsWith(`${space}.`)).map((m) => m.slice(space.length + 1));

	it("names every interface of contracts.ts with a method, and only those", () => {
		const withMethods = [...interfaces(CONTRACTS).entries()].filter(([, body]) => methodsOf(body).length > 0).map(([name]) => name);
		expect(Object.keys(DOOR_COVERAGE).sort()).toEqual(withMethods.sort());
	});

	it("answers each service's every method but the host's, in its space, and nothing it does not declare", () => {
		for (const [name, coverage] of Object.entries(DOOR_COVERAGE)) {
			if (!("space" in coverage)) {
				expect({ name, reason: coverage.hostOwned.length > 20 }).toEqual({ name, reason: true });
				continue;
			}
			const declared = interfaceMethods(name);
			expect({ name, methods: [...offered(coverage.space), ...coverage.host].sort() }).toEqual({ name, methods: [...declared, ...(coverage.own ?? [])].sort() });
			for (const own of coverage.own ?? []) expect({ name, own, declared: declared.includes(own) }).toEqual({ name, own, declared: false });
		}
	});

	it("answers in no space no interface names", () => {
		const spaces = new Set(Object.values(DOOR_COVERAGE).flatMap((c) => ("space" in c ? [c.space] : [])));
		const own = ["boundary", "entry", "sectionName", "repeatPage", "description", "rules", "reminders", "capture", "timeline"];
		expect(new Set(doorMethods().map((m) => m.split(".")[0]))).toEqual(new Set([...spaces, ...own]));
	});
});

describe("the door's screen settings", () => {
	it("answer what ScreenSettingsStore gives a screen over the same settings", () => {
		const door = callDoor("screenSettings.get", [], { tasks: null, settings: DATA, nowMs: NOW.getTime() });
		expect(door).toEqual({ ok: true, result: wire(new ScreenSettingsImpl(new FakeSettingsStore(settingsFrom(JSON.parse(DATA)))).get()) });
	});
});

describe("the door's timeline", () => {
	const levels = (settings?: string) => callDoor("timeline.zoomLevels", [], { tasks: null, settings, nowMs: NOW.getTime() });

	it("answers the zoom's levels data.json keeps", () => {
		expect(levels(JSON.stringify({ zoomLevels: [{ hourPx: 40 }, { hourPx: 80 }] }))).toEqual({ ok: true, result: [{ hourPx: 40 }, { hourPx: 80 }] });
	});

	it("answers the defaults for no data.json, or one without levels that read", () => {
		const defaults = { ok: true, result: wire(DEFAULT_ZOOM_LEVELS) };
		for (const settings of [undefined, "", DATA, JSON.stringify({ zoomLevels: [{ hourPx: -1 }] })]) expect(levels(settings)).toEqual(defaults);
	});
});

/** A data.json as the plugin writes it, with a key of the device's own the door must keep. */
const DATA = JSON.stringify(
	{ tasksFile: "Tasks.md", priorities: [{ prefix: "p1", color: "red" }, { prefix: "p2", color: "orange" }], labels: [{ name: "Fast", color: "green" }], groups: { presets: ["Home", "Work"], ungrouped: "No section" }, zoom: 3 },
	null,
	2,
);
const SHADES = { red: "#FF453A", orange: "#FF9F0A", yellow: "#FFD60A", green: "#30D158", teal: "#64D2FF", blue: "#0A84FF" };

/** Every SettingsService method the door answers, with arguments a settings screen sends. */
const SETTINGS_CASES: readonly (readonly [string, ...unknown[]])[] = [
	["form"],
	["setTasksFile", "Work/Tasks.md"],
	["setSection", "soon", "Скоро"],
	["setMarker", "slotMarker", "at:"],
	["setCount", "longPressMs", "450"],
	["setCount", "refreshSeconds", "120"],
	["setCount", "staleAfterMinutes", "-1"],
	["setDayStartHour", 4],
	["renameLevel", 1, " !! "],
	["recolourLevel", 0, "#123456"],
	["removeLevel", 0],
	["addLevel"],
	["moveLevel", 1, 0],
	["setLabelTag", " tags "],
	["setLabelTag", "two words"],
	["renameLabel", 0, " Very fast "],
	["recolourLabel", 0, "blue"],
	["removeLabel", 0],
	["addLabel"],
	["moveLabel", 0, 0],
	["colourOf", "#ff453a", SHADES],
	["colourOf", "#abcdef", SHADES],
	["colourOf", "nope", SHADES],
	["typedColour", "level", 0, "#123456", SHADES],
	["typedColour", "label", 0, "nope", SHADES],
	["renamePreset", 0, " Дом "],
	["removePreset", 1],
	["addPreset"],
	["movePreset", 1, 0],
	["setUngrouped", "  "],
	["setGoogleClientId", "client.apps.googleusercontent.com"],
	["setWorkCalendarFile", "cal/work.json"],
];

describe("the door's settings.* calls", () => {
	it("answer and write as SettingsServiceImpl does, every key of data.json it does not touch kept", async () => {
		for (const [method, ...args] of SETTINGS_CASES) {
			const store = new FakeSettingsStore(settingsFrom(JSON.parse(DATA)));
			let writes = 0;
			store.onChange(() => writes++);
			const result = await (new SettingsServiceImpl(store) as unknown as Record<string, (...a: unknown[]) => unknown>)[method](...args);
			const door = callDoor(`settings.${method}`, wire(args), { tasks: null, settings: DATA, nowMs: NOW.getTime() }) as Extract<DoorAnswer, { ok: true }>;
			const written = door.settings === undefined ? null : (JSON.parse(door.settings) as Record<string, unknown>);
			expect({ method, result: door.result, written: written && settingsFrom(written) }).toEqual({ method, result: wire(result ?? null), written: writes > 0 ? store.get() : null });
			if (written) expect({ method, zoom: written.zoom }).toEqual({ method, zoom: 3 });
		}
	});
});

describe("a settings write", () => {
	it("works with no settings in the context: the defaults, written over nothing", () => {
		const door = callDoor("settings.setDayStartHour", [4], { tasks: null, nowMs: NOW.getTime() }) as Extract<DoorAnswer, { ok: true }>;
		expect(door.ok).toBe(true);
		expect(JSON.parse(door.settings!)).toEqual({ dayStartHour: 4 });
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

describe("the door's calendars", () => {
	const files = { google: JSON.stringify({ exportedAt: iso(4, 8), device: "Mac", events: [] }), work: JSON.stringify({ exportedAt: iso(4, 8), device: "iPhone", events: [] }) };
	const detail = (fetched?: DoorContext["fetched"]) => {
		const door = callDoor("calendars.events", [T], context(FILE, { calendars: files, ...(fetched ? { fetched } : {}) })) as Extract<DoorAnswer, { ok: true }>;
		return Object.fromEntries((door.result as { statuses: { source: string; detail: string | null }[] }).statuses.map((st) => [st.source, st.detail]));
	};

	it("name the device of a file the host does not fetch itself; Google's alone is fetched when the context does not say", () => {
		expect(detail()).toEqual({ google: null, iphone: null, work: "iPhone" });
		expect(detail(["google", "work"])).toEqual({ google: null, iphone: null, work: null });
		expect(detail([])).toEqual({ google: "Mac", iphone: null, work: "iPhone" });
	});

	it("grey an event as CalendarDay does: over once its end has come", () => {
		const past = (endMs: number) => (callDoor("calendars.isPast", [{ endMs }], context()) as Extract<DoorAnswer, { ok: true }>).result;
		expect([past(NOW.getTime() - 1), past(NOW.getTime()), past(NOW.getTime() + 1)]).toEqual([true, true, false]);
	});
});

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
		plain("days.openAt", LATER),
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
		plain("calendars.files"),
		plain("calendars.sources"),
		plain("calendars.meetings", NOW.getTime() - 3_600_000 * 9, NOW.getTime() + 3_600_000 * 12),
		plain("reminders.list"),
		...["complete", "silence"].map((m) => plain(`reminders.${m}`, LUNCH)),
		plain("reminders.snooze", LUNCH, 15),
		plain("capture.add", "inbox", "Buy milk"),
		plain("capture.add", "inbox", "Idea", "Recording 1.m4a", "#transcribe"),
		plain("capture.lists"),
		plain("screenSettings.get"),
		...SETTINGS_CASES.map(([m, ...a]) => ({ method: `settings.${m}`, args: a, context: context(FILE, { settings: DATA }) })),
		plain("history.undo"),
		plain("history.redo"),
		plain("history.canUndo"),
		plain("history.canRedo"),
		plain("sectionName.end", false, "enter", " Name "),
		plain("repeatPage.end", rule, { rule: null }),
		plain("description.open", null),
		plain("description.typed", { file: "- a", typed: false }),
		plain("description.save", { file: "- a", typed: true }),
		plain("description.read", { file: "- a", typed: true }, "- b", { focused: false, pending: false }),
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
		plain("rules.usableColor", "#12AB34"),
		plain("rules.acceptsDrop", "inbox", ["soon"]),
		plain("rules.placesInGap", "soon", "day", false),
		plain("rules.shadesOf", "red", "dark"),
		plain("rules.inkOf", "#12AB34", "light"),
		plain("rules.contrast", "#FFFFFF", "#000000"),
		plain("rules.eventHex", { color: null, source: "google" }),
		plain("rules.bgAlphaFor", "work"),
		plain("rules.eventColors", "#0A84FF", 0.22, "light"),
		plain("rules.dayTitle", T, "other", T),
		plain("rules.dueLabel", T),
		plain("rules.eventLevels", [{ start: 60, end: 120 }, { start: 90, end: 100 }]),
		plain("rules.stackTasks", [{ start: 60, end: null }, { start: 60, end: 120 }], [{ start: 0, end: 30, level: 0 }], 50, { height: 35, gap: 2 }, { itemInset: 1, itemGap: 2, overlayInset: 18 }),
		plain("rules.overlayLeft", 2, { itemInset: 1, itemGap: 2, overlayInset: 18 }),
		plain("rules.eventLeft", { level: 1, layer: 0 }, { itemInset: 1, itemGap: 2, overlayInset: 18 }),
		plain("rules.stackCorner", { stacked: true, hiddenDuration: false }, 600, { start: 600, end: null }),
		plain("rules.timeParts", 605),
		plain("rules.durationParts", 90),
		plain("rules.pastEventPaint", "#000000", "#DADADA", "dark"),
		plain("rules.parseZoomLevels", "28, 56"),
		plain("rules.formatZoomLevels", [{ hourPx: 28 }, { hourPx: 56 }]),
		plain("rules.levelsFor", 30, [{ hourPx: 28 }, { hourPx: 56 }, { hourPx: 112 }]),
		plain("rules.gridAt", 192, { divisions: [5, 15, 30], labelGap: 40, tickMinutes: 5, tickGap: 16 }),
		plain("rules.gridMarks", { labels: 30, lines: 15 }, 2),
		plain("rules.zoomAfterPinch", 25, 30, [{ hourPx: 28 }, { hourPx: 56 }]),
		plain("rules.zoomShown", "wholeDay", null, [{ hourPx: 28 }, { hourPx: 56 }]),
		plain("timeline.zoomLevels"),
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
			expect(JSON.parse(callDoorJson(method, JSON.stringify(args), JSON.stringify(context), true))).toStrictEqual(answer);
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

describe("the door's JSON, strict", () => {
	class Box {
		readonly n = 1;
	}

	it("refuses what JSON would change on the way", () => {
		for (const bad of [{ at: new Date(0) }, { gone: undefined }, [() => 1], { box: new Box() }, { m: new Map() }, { n: Number.NaN }, [Infinity]]) {
			expect(() => plainJson(bad, true)).toThrow();
			expect(() => plainJson(bad)).not.toThrow();
		}
	});

	it("passes plain JSON as JSON.stringify writes it", () => {
		const value = { a: [1, "two", null, true, { b: Object.create(null) }] };
		expect(plainJson(value, true)).toBe(JSON.stringify(value));
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
