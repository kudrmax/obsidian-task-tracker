import { describe, expect, it } from "vitest";
import type { DropColumn, DropOrigin, DropTo, ScreenView, TaskItem } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * What the engine's port asks while a finger moves, answered at once over one read of the file (`TaskService.reader`),
 * and the refusals and the resize a frontend used to assemble itself (`takes`, `opensGaps`, `resizedSlot`): each the
 * same answer as the service's own call.
 */

const T = "2026-11-18";
const LATER = "2026-11-20";
const PAST = "2026-11-16";
const clock: Clock = { now: () => new Date(2026, 10, 18, 13, 5) };

const FILE = [
	"## Inbox",
	"",
	"- [ ] Idea",
	"",
	"## Projects",
	"",
	"- Отчёты",
	"",
	"## Now",
	"",
	"- [ ] Standup ⏰ 2026-11-18 15:00-15:30",
	"- [ ] Parent",
	"\t- [ ] Child",
	"- [ ] Write report 🗂️ Отчёты",
	"### Evening",
	"- [ ] Read",
	"",
	"## Soon",
	"",
	"- [ ] Undated",
	"- [ ] Slotted later ⏰ 2026-11-20 09:00-10:00",
	"",
	"## Backlog",
	"",
	"- [ ] Someday",
	"",
	"## Done",
	"",
	"- [x] Old",
	"",
].join("\n");

function service(text: string | null = FILE) {
	const store = new InMemoryTaskFileStore(text);
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore({ ...DEFAULT_SETTINGS, dayStartHour: 0 }), clock) };
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.subtasks)]);
const everyItem = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
const named = (s: ScreenView, title: string): TaskItem => {
	const item = everyItem(s).find((i) => i.title === title);
	if (!item) throw new Error(`no ${title}`);
	return item;
};

const COLUMNS: readonly DropColumn[] = ["day", "soon", "inbox", "backlog"];

describe("TaskService.reader: one read of the file, answered at once", () => {
	it("draws the screen of any day, under its filter, as the service's screen does", async () => {
		const { svc } = service();
		const reader = await svc.reader();
		const filtered = await svc.reader("project:Отчёты");
		for (const date of [T, LATER, PAST]) {
			expect(reader.screen(date)).toEqual(await svc.screen(date));
			expect(filtered.screen(date)).toEqual(await svc.screen(date, "project:Отчёты"));
		}
	});

	it("gives each column's list as columnView over that screen", async () => {
		const { svc } = service();
		const reader = await svc.reader();
		for (const date of [T, LATER, PAST]) {
			const screen = await svc.screen(date);
			for (const column of COLUMNS) expect(reader.columnView(column, date)).toEqual(svc.columnView(screen, column));
		}
	});

	it("finds a task or a subtask by its id as the screen draws it, none for an id it lacks", async () => {
		const { svc } = service();
		const screen = await svc.screen(T);
		const reader = await svc.reader();
		for (const title of ["Idea", "Child", "Standup", "Old"]) expect(reader.item(named(screen, title).id)).toEqual(named(screen, title));
		const later = named(await svc.screen(LATER), "Slotted later");
		expect(reader.item(later.id)).toEqual(later);
		expect(reader.item("gone")).toBeNull();
	});

	it("previews a drop as dropPreview does, under its filter", async () => {
		const { svc } = service();
		const screen = await svc.screen(T);
		const tasks = [{ key: named(screen, "Undated").key, from: "soon" as const }];
		const to: DropTo = { kind: "time", start: 900 };
		expect((await svc.reader()).dropPreview(tasks, to, T)).toEqual(await svc.dropPreview(tasks, to, T));
		const filtered = await svc.reader("project:Отчёты");
		const report = [{ key: named(screen, "Write report").key, from: "day" as const }];
		const toSoon: DropTo = { kind: "list", column: "soon", before: null };
		expect(filtered.dropPreview(report, toSoon, T)).toEqual(await svc.dropPreview(report, toSoon, T, "project:Отчёты"));
	});

	it("opens a task's menu by its id over the screen of the day, as menu does over that screen", async () => {
		const { svc } = service();
		const screen = await svc.screen(T);
		const reader = await svc.reader();
		const read = named(screen, "Read");
		expect(reader.menu(read.id, "day", T)).toEqual(svc.menu(read, "day", { today: T, day: T, offer: screen.offer, projects: screen.projectTree }));
		expect(reader.menu("gone", "day", T)).toBeNull();
	});

	it("stretches and resizes a block by its id as stretch and resizedSlot do; none for a task off the timeline", async () => {
		const { svc } = service();
		const standup = named(await svc.screen(T), "Standup");
		const reader = await svc.reader();
		expect(reader.stretch(standup.id, T, "end", 1000)).toEqual(svc.stretch(standup, T, "end", 1000));
		expect(reader.resizedSlot(standup.id, T, "end", 990, 15)).toEqual(svc.resizedSlot(standup, T, "end", 990, 15));
		const idea = named(await svc.screen(T), "Idea");
		expect(reader.stretch(idea.id, T, "end", 700)).toBeNull();
		expect(reader.resizedSlot(idea.id, T, "end", 700, 15)).toBeNull();
	});

	it("keeps the read it was made over: a write after it shows in the next reader only", async () => {
		const { svc } = service();
		const reader = await svc.reader();
		const before = reader.screen(T);
		await svc.setStatus(named(before, "Idea").key, "done");
		expect(reader.screen(T)).toEqual(before);
		expect((await svc.reader()).screen(T).inbox).toEqual([]);
	});

	it("answers without a tasks file: the screen that says so, no task", async () => {
		const { svc } = service(null);
		const reader = await svc.reader();
		expect(reader.screen(T)).toEqual(await svc.screen(T));
		expect(reader.item("any")).toBeNull();
		expect(reader.takes(["timeline"], { kind: "list", column: "inbox", before: null })).toBe(false);
	});
});

describe("TaskService.takes: whether the place the finger is over takes the carried cards", () => {
	const list = (column: DropColumn): DropTo => ({ kind: "list", column, before: null });
	const cases: readonly { readonly to: DropTo; readonly from: readonly DropOrigin[]; readonly takes: boolean }[] = [
		{ to: list("inbox"), from: ["day"], takes: false },
		{ to: list("inbox"), from: ["timeline"], takes: false },
		{ to: list("inbox"), from: ["soon", "backlog"], takes: true },
		{ to: list("backlog"), from: ["new"], takes: true },
		{ to: list("soon"), from: ["timeline"], takes: false },
		{ to: list("soon"), from: ["day"], takes: true },
		{ to: list("day"), from: ["timeline", "inbox"], takes: true },
		{ to: { kind: "time", start: 600 }, from: ["inbox"], takes: true },
		{ to: { kind: "time", start: 600 }, from: ["inbox", "soon"], takes: false },
		{ to: { kind: "place", column: "inbox", place: { kind: "task", group: null, before: null } }, from: ["day"], takes: false },
		{ to: { kind: "group", list: "now", date: null, group: "Evening", before: null }, from: ["timeline"], takes: true },
		{ to: { kind: "group", list: "inbox", date: null, group: null, before: null }, from: ["timeline"], takes: false },
		{ to: { kind: "title", list: "soon", date: null }, from: ["timeline"], takes: false },
		{ to: { kind: "title", list: "soon", date: LATER }, from: ["timeline"], takes: true },
		{ to: { kind: "clearSlot" }, from: ["timeline"], takes: true },
	];

	it("refuses as the docs' table says, the reader and the service alike", async () => {
		const { svc } = service();
		const reader = await svc.reader();
		for (const c of cases) {
			expect({ ...c, takes: reader.takes(c.from, c.to) }).toEqual(c);
			expect({ ...c, takes: await svc.takes(c.from, c.to) }).toEqual(c);
		}
	});

	it("reads a place under a task by the column its task stands in; a closed task takes none", async () => {
		const { svc } = service();
		const screen = await svc.screen(T);
		const under = (title: string): DropTo => ({ kind: "nest", parent: named(screen, title).key, before: null });
		expect(await svc.takes(["timeline"], under("Idea"))).toBe(false);
		expect(await svc.takes(["timeline"], under("Parent"))).toBe(true);
		expect(await svc.takes(["soon"], under("Idea"))).toBe(true);
		expect(await svc.takes(["inbox"], under("Old"))).toBe(false);
		expect((await svc.reader()).takes(["timeline"], under("Idea"))).toBe(false);
	});
});

describe("TaskService.opensGaps: whether a list opens a place between its cards for the carried ones", () => {
	it("a list that shows sections opens one for any card; one without, only for its own cards and the plus", () => {
		const { svc } = service();
		expect(svc.opensGaps(["inbox"], "day", T)).toBe(true);
		expect(svc.opensGaps(["inbox"], "day", PAST)).toBe(false);
		expect(svc.opensGaps(["day", "new"], "day", PAST)).toBe(true);
		expect(svc.opensGaps(["day", "inbox"], "day", PAST)).toBe(false);
		expect(svc.opensGaps(["timeline"], "soon", T)).toBe(true);
	});
});

describe("TaskService.resizedSlot: where a dot let go puts the task, writing nothing", () => {
	it("is the slot resize writes; null where resize writes nothing", async () => {
		const { store, svc } = service();
		const standup = named(await svc.screen(T), "Standup");
		expect(svc.resizedSlot(standup, T, "end", 930, 15)).toBeNull();
		expect(svc.resizedSlot(standup, T, "end", 990, 15)).toEqual({ date: T, start: 900, end: 990 });
		expect(svc.resizedSlot(standup, T, "start", 870, 15)).toEqual({ date: T, start: 870, end: 930 });
		await svc.resize(standup.key, T, "end", 990, 15);
		expect(store.text).toContain("- [ ] Standup ⏰ 2026-11-18 15:00-16:30");
	});
});
