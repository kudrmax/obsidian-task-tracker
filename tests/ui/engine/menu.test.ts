// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { calendarFile, mockFile } from "../../../obsidian/stand/mockData";
import { LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";
import { blockTop } from "../../../obsidian/ui/engine/layers/block";
import { monthGrid, monthOf, monthTitle } from "../../../obsidian/ui/engine/layout/month";
import type { EntryBar, TaskMenuModel } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { tileRows } from "../../../obsidian/ui/engine/view/TaskMenu";

const NOW = new Date(2026, 10, 18, 14, 20);

function port(file = mockFile(NOW)) {
	const p = new MockPort(() => NOW);
	p.delay = 0;
	p.reset(file);
	return p;
}
const taskMenu = (p: MockPort, title: string, from: "list" | "calendar" | "stack" = "list"): TaskMenuModel => {
	const data = p.read(0);
	const id = Object.values(data.cards).find((c) => c.title === title)?.id;
	if (!id) throw new Error(`no card «${title}»`);
	const model = p.menu(id, from);
	if (model.kind !== "task") throw new Error("not a task's menu");
	return model;
};

const shape = (model: TaskMenuModel) => model.layout.map(({ group, actions }) => [group, actions.map((a) => a.id)]);
const ids = (model: TaskMenuModel, group: string) => model.layout.find((g) => g.group === group)?.actions.map((a) => a.id) ?? [];
const barOf = (bar: EntryBar) => bar.bar.map(({ group, actions }) => [group, actions.map((a) => `${a.id}${a.disabled ? " off" : ""}${a.lit ? " lit" : ""}`)]);

describe("the stand's task menu, read from the core's table (task actions spec)", () => {
	it("stands statuses, levels, the copy, When, Edit, the rows and Delete, top to bottom, as Max ordered them", () => {
		const p = port();
		expect(shape(taskMenu(p, "Задача с описанием"))).toEqual([
			["statuses", ["done", "progress", "wontDo"]],
			["levels", ["level"]],
			["copy", []],
			["when", ["tomorrow", "pickDate", "repeat"]],
			["edit", ["rename", "project", "section"]],
			["rows", ["firstStep", "subtask", "openFull", "openInObsidian"]],
			["remove", ["delete"]],
		]);
	});

	it("names the progress tile for what it sets, and lets Won't do and Delete ask", () => {
		const p = port();
		const open = taskMenu(p, "Задача с описанием").layout[0].actions;
		expect(open.map((a) => [a.status, a.asks])).toEqual([
			["done", false],
			["inProgress", false],
			["wontDo", true],
		]);
		const going = taskMenu(p, "Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки");
		expect(going.layout[0].actions[1].status).toBe("stopProgress");
		expect(taskMenu(p, "Задача с описанием").layout[taskMenu(p, "Задача с описанием").layout.length - 1].actions[0]).toMatchObject({ id: "delete", asks: true });
	});

	it("offers no day tile for the day a task stands on, each tile with the day it writes; Remove due date only off today", () => {
		const p = port();
		const today = taskMenu(p, "Задача с описанием");
		expect(ids(today, "when")).toEqual(["tomorrow", "pickDate", "repeat"]);
		expect(today.layout.find((g) => g.group === "when")!.actions[0].date).toBe("2026-11-19");
		expect(today.date.removable).toBe(false);
		const inbox = taskMenu(p, p.read(0).cards[p.read(0).lists.inbox.rows.find((r) => r.kind === "task")!.id].title);
		expect(ids(inbox, "when")).toEqual(["today", "tomorrow", "pickDate", "repeat"]);
	});

	it("offers Reminder on a timed task, Description on one without, Section where the column shows sections", () => {
		const p = port(calendarFile(NOW));
		const timed = taskMenu(p, "Тренировка", "calendar");
		expect(ids(timed, "when")).toContain("reminder");
		expect(ids(timed, "edit")).toEqual(["rename", "project"]);
		expect(ids(timed, "rows")).toContain("subtask");
		expect(timed.peek).toBe("разминка, потом зал");
		expect(ids(taskMenu(p, "Купить подарок"), "edit")).toContain("description");
		const inbox = port();
		const first = inbox.read(0).lists.inbox.rows.find((r) => r.kind === "task")!.id;
		expect(ids(inbox.menu(first, "list") as TaskMenuModel, "edit")).toContain("section");
		expect(ids(inbox.menu(first, "calendar") as TaskMenuModel, "edit")).not.toContain("section");
	});

	it("shows a calendar task's open subtasks in its menu (F107); a stack's card offers no Subtask, and its Project is off", () => {
		const p = port(calendarFile(NOW));
		expect(taskMenu(p, "Переезд", "calendar").subtasks).toEqual(["k10", "k11"]);
		const sub = p.menu("k10", "stack") as TaskMenuModel;
		expect(ids(sub, "rows")).not.toContain("subtask");
		expect(sub.layout.find((g) => g.group === "edit")!.actions.find((a) => a.id === "project")?.disabled).toBe(true);
	});

	it("offers Pick a date's lists above the month, the task's own on; none for a subtask", () => {
		const p = port();
		const inbox = taskMenu(p, p.read(0).cards[p.read(0).lists.inbox.rows.find((r) => r.kind === "task")!.id].title);
		expect(inbox.places.map((place) => [place.id, place.on])).toEqual([
			["inbox", true],
			["backlog", false],
			["soon", false],
			["now", false],
		]);
		expect((port(calendarFile(NOW)).menu("k10", "stack") as TaskMenuModel).places).toEqual([]);
	});

	it("writes what was tapped: a day, a level on and off, a day picked, a list, Delete, a status", async () => {
		const p = port(calendarFile(NOW));
		await p.act("g1", { kind: "date", date: "2026-11-18" });
		expect(p.fileText()).toMatch(/Купить подарок 📅 2026-11-18\n(?![\s\S]*## Soon[\s\S]*Купить подарок)/);
		await p.act("g2", { kind: "priority", prefix: "p1" });
		expect(p.fileText()).toContain("p1 Сдать отчёт");
		await p.act("g2", { kind: "priority", prefix: "p1" });
		expect(p.fileText()).not.toContain("p1 Сдать отчёт");
		await p.act("g3", { kind: "date", date: "2026-11-25" });
		expect(p.fileText()).toContain("Написать письмо 📅 2026-11-25");
		await p.act("g3", { kind: "sendTo", list: "backlog" });
		expect(p.fileText()).toMatch(/## Backlog[\s\S]*- \[ \] Написать письмо\n/);
		await p.act("g4", { kind: "delete" });
		expect(p.fileText()).not.toContain("Забрать посылку");
		await p.act("g5", { kind: "status", id: "wontDo" });
		expect(p.fileText()).toContain("- [-] Обновить резюме");
		expect(Object.values(p.read(0).cards).map((c) => c.title)).not.toContain("Обновить резюме");
	});

	it("an event's menu is its one row", () => {
		expect(port(calendarFile(NOW)).menu("ev2", "calendar")).toEqual({ kind: "event", title: "Встреча с дизайнером" });
	});
});

describe("the menu's layout", () => {
	/** Max, 2026-11-20: the menu is one piece under its task's copy, as iOS's context menu; never split around the copy. */
	it("stands the block over its task; higher where the room under it can't take the panel; the copy no higher than the window's top", () => {
		const room = { top: 0, bottom: 800 };
		expect(blockTop(100, 35, 400, 12, room, 10)).toBe(100);
		expect(blockTop(600, 35, 400, 12, room, 10)).toBe(800 - 10 - 400 - 12 - 35);
		expect(blockTop(600, 35, 900, 12, room, 10)).toBe(10);
		expect(blockTop(600, 35, 0, 12, room, 10)).toBe(600);
	});

	it("lays tiles in rows of at most three, as even as they go", () => {
		expect(tileRows([1, 2, 3, 4]).map((r) => r.length)).toEqual([2, 2]);
		expect(tileRows([1, 2, 3, 4, 5]).map((r) => r.length)).toEqual([3, 2]);
		expect(tileRows([1, 2]).map((r) => r.length)).toEqual([2]);
	});

	it("draws a month as six weeks from Monday", () => {
		const cells = monthGrid(monthOf("2026-11-18"));
		expect(cells).toHaveLength(42);
		expect(cells[0]).toEqual({ date: "2026-10-26", day: 26, other: true });
		expect(cells[6]).toEqual({ date: "2026-11-01", day: 1, other: false });
		expect(monthTitle(monthOf("2026-11-18", 2))).toBe("January 2027");
	});

	it("keeps a layer mounted as long as the design's motion tokens say", () => {
		const css = readFileSync(join(process.cwd(), "styles.css"), "utf8");
		expect(css).toContain(`--tc-duration-menu: ${LAYER_MS.open}ms;`);
		expect(css).toContain(`--tc-duration-collapse: ${LAYER_MS.close}ms;`);
	});
});

describe("the menu's fields and the plus, in the store", () => {
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	const screen = () => {
		const p = port();
		const store = createScreenStore(p);
		store.getState().start();
		return { p, store };
	};
	const firstInbox = (store: ReturnType<typeof createScreenStore>) => store.getState().shown.lists.inbox.rows.find((r) => r.kind === "task")!.id;

	it("the plus opens the field at the end of the day's list while it shows, else of Inbox's last section (F174)", () => {
		const { store } = screen();
		store.getState().plusTap(["soon", "day"]);
		expect(store.getState().entry).toMatchObject({ at: { list: "day", before: null, depth: 0 }, renaming: null, stack: false });
		store.getState().plusTap(["inbox", "soon"]);
		const entry = store.getState().entry!.at;
		expect(entry.list).toBe("inbox");
		expect(store.getState().shown.lists.inbox.rows.find((r) => r.kind === "section" && r.id === entry.section)).toMatchObject({ title: "Идеи" });
	});

	/** Max, 2026-11-20: «Rename and creating a task are literally one interface». */
	it("Rename is the new task's field: the card's place, the title in it, the bar as the plugin's rename has it (quick-add spec §4.8)", () => {
		const { store } = screen();
		const id = firstInbox(store);
		store.getState().openMenu(id);
		store.getState().startRename();
		const s = store.getState();
		expect(s.layer).toBeNull();
		expect(s.entry).toMatchObject({ renaming: id, stack: false, at: { list: "inbox", before: id, depth: 0 } });
		expect(s.entryText).toBe(s.shown.cards[id].title);
		const bar = s.entryBar(s.entry!, s.draft, s.entryText);
		expect(barOf(bar)).toEqual([
			["shifts", ["outdent off", "indent off"]],
			["flag", [s.draft.level ? "level lit" : "level"]],
			["marks", ["project", "repeat", "description"]],
			["place", ["pickDate"]],
		]);
		expect(bar.where?.id).toBe("inbox");
		store.getState().indentEntry(1);
		expect(store.getState().entry!.at.depth).toBe(0);
	});

	it("a subtask's rename has no place and no project; a block's has no shifts and no place; a stack card's neither shifts, project nor place", () => {
		const lists = screen().store;
		const sub = (["inbox", "soon", "day"] as const).flatMap((l) => lists.getState().shown.lists[l].rows).find((r) => r.kind === "task" && r.depth > 0)!.id;
		lists.getState().openMenu(sub);
		lists.getState().startRename();
		let s = lists.getState();
		expect(barOf(s.entryBar(s.entry!, s.draft, s.entryText))).toEqual([
			["shifts", ["outdent off", "indent off"]],
			["flag", ["level"]],
			["marks", ["repeat", "description"]],
		]);
		const store = createScreenStore(port(calendarFile(NOW)));
		store.getState().start();
		store.getState().openMenu("k8", "calendar");
		store.getState().startRename();
		s = store.getState();
		expect(s.entry).toMatchObject({ renaming: "k8", stack: false });
		expect(barOf(s.entryBar(s.entry!, s.draft, s.entryText))).toEqual([
			["flag", ["level"]],
			["marks", ["project", "repeat", "description"]],
		]);
		store.getState().openEntry(null);
		store.getState().openMenu("k8", "calendar");
		const child = (store.getState().layer!.model as { subtasks: readonly string[] }).subtasks[0];
		store.getState().openMenu(child, "stack");
		store.getState().startRename();
		s = store.getState();
		expect(s.layer?.id).toBe(child);
		expect(s.entry).toMatchObject({ renaming: child, stack: true });
		expect(barOf(s.entryBar(s.entry!, s.draft, s.entryText))).toEqual([
			["flag", ["level"]],
			["marks", ["repeat", "description"]],
		]);
	});

	it("Enter on a rename shows the new name at once, writes it and opens a new task's field right under it (F117, F298)", async () => {
		const { p, store } = screen();
		const rows = store.getState().shown.lists.inbox.rows;
		const id = firstInbox(store);
		const after = rows[rows.findIndex((r) => r.id === id) + 1];
		store.getState().openMenu(id);
		store.getState().startRename();
		store.getState().commitEntry("Новое имя", true);
		expect(store.getState().shown.cards[id].title).toBe("Новое имя");
		expect(store.getState().entry).toMatchObject({ renaming: null, at: { list: "inbox", before: after?.kind === "task" ? after.id : null } });
		await settle();
		await settle();
		expect(p.fileText()).toContain("Новое имя");
	});

	it("an empty or unchanged name writes nothing; the port decides, not the store", async () => {
		const { p, store } = screen();
		const id = firstInbox(store);
		const title = store.getState().shown.cards[id].title;
		const before = p.fileText();
		for (const text of ["   ", title]) {
			store.getState().openMenu(id);
			store.getState().startRename();
			store.getState().commitEntry(text, false);
			expect(store.getState().entry).toBeNull();
		}
		await settle();
		expect(p.fileText()).toBe(before);
		expect(store.getState().shown.cards[id].title).toBe(title);
	});

	/** Max, 2026-11-20: waiting out a double click felt like lag; double click is withdrawn, a click opens the menu at once. */
	it("a click opens the task's menu at once; a second click does nothing more: rename is the menu's", () => {
		const { store } = screen();
		const id = firstInbox(store);
		store.getState().openMenu(id, "list", false);
		expect(store.getState().layer?.id).toBe(id);
		store.getState().openMenu(id, "list", false);
		expect(store.getState().layer?.id).toBe(id);
		expect(store.getState().entry).toBeNull();
	});

	it("Escape with a bar's panel open closes the panel alone; a new field opens with none (the audit's 6, 7)", () => {
		const { store } = screen();
		store.getState().plusTap(["soon", "day"]);
		store.getState().typeEntry("Флажок");
		store.getState().showEntryPanel("where");
		store.getState().escapeEntry();
		expect(store.getState().entryPanel).toBeNull();
		expect(store.getState().entry).not.toBeNull();
		store.getState().showEntryPanel("priority");
		store.getState().openEntry(null);
		store.getState().plusTap(["soon", "day"]);
		expect(store.getState().entryPanel).toBeNull();
		store.getState().escapeEntry();
		expect(store.getState().entry).toBeNull();
	});

	it("a place the layout can't show keeps the field where it stands and writes there (the audit's 9)", async () => {
		const { store } = screen();
		store.getState().plusTap(["soon", "day"]);
		const at = store.getState().entry!.at;
		store.getState().entryPlace("inbox", null, ["soon", "day"]);
		const field = store.getState().entry!;
		expect(field.at).toMatchObject({ list: at.list, away: { list: "inbox" } });
		expect(store.getState().entryBar(field, store.getState().draft, "").where?.id).toBe("inbox");
		store.getState().commitEntry("В инбокс", true);
		await settle();
		await settle();
		expect(store.getState().shown.lists.inbox.rows.some((r) => store.getState().shown.cards[r.id]?.title === "В инбокс")).toBe(true);
	});

	it("a task just typed lets the next field under it go a level in, before its write is read back (the audit's 8)", () => {
		const p = port();
		p.delay = 300;
		const store = createScreenStore(p);
		store.getState().start();
		store.getState().plusTap(["soon", "day"]);
		store.getState().entryPlace("date", "2026-11-27", ["inbox", "soon", "day"]);
		store.getState().commitEntry("A", true);
		const s = store.getState();
		expect(barOf(s.entryBar(s.entry!, s.draft, "")).find(([group]) => group === "shifts")).toEqual(["shifts", ["outdent off", "indent"]]);
		store.getState().indentEntry(1);
		expect(store.getState().entry!.at.depth).toBe(1);
	});

	it("Add subtask in a list opens the field under the task's last subtask, written as its last subtask (F124)", async () => {
		const p = port(calendarFile(NOW));
		const store = createScreenStore(p);
		store.getState().start();
		store.getState().openMenu("g1");
		store.getState().startSubtask();
		expect(store.getState().entry).toMatchObject({ at: { list: "soon", depth: 1, under: "g1" }, stack: false });
		store.getState().commitEntry("Шаг", true);
		await settle();
		await settle();
		expect(p.fileText()).toMatch(/Купить подарок\n\t- \[ \] Шаг/);
	});

	it("Add subtask on the calendar types into the menu's stack, a subtask each Enter, the menu showing it (F108)", async () => {
		const p = port(calendarFile(NOW));
		const store = createScreenStore(p);
		store.getState().start();
		store.getState().openMenu("k8", "calendar");
		store.getState().startSubtask();
		expect(store.getState().entry).toMatchObject({ stack: true, renaming: null });
		store.getState().indentEntry(1);
		expect(store.getState().entry!.at.depth).toBeUndefined();
		store.getState().commitEntry("Отключить интернет", true);
		await settle();
		await settle();
		const model = store.getState().layer?.model;
		expect(model?.kind === "task" && model.subtasks.length).toBe(3);
		expect(store.getState().entry).toMatchObject({ stack: true });
		store.getState().commitEntry("", true);
		expect(store.getState().layer).toBeNull();
		expect(store.getState().entry).toBeNull();
	});
});

describe("the stand's calendar at any hour of its day (verifier, 2026-11-20)", () => {
	const blocksAt = (h: number, m: number) => {
		const clock = new Date(2026, 10, 20, h, m);
		const p = new MockPort(() => clock);
		p.reset(calendarFile(clock));
		return { blocks: p.read(0).day.blocks, now: p.now().minute, events: p.read(0).day.events };
	};

	it("at noon the plan stands as before: an hour after the present hour, over eight hours", () => {
		const { blocks, now } = blocksAt(12, 0);
		const starts = blocks.filter((b) => b.id !== "k12").map((b) => b.start);
		expect(Math.min(...starts)).toBe(Math.floor(now / 60) * 60 + 60);
		expect(Math.max(...starts) - Math.min(...starts)).toBe(420);
	});

	it("after midnight (the stand's day starts at 05:00) the plan still stands ahead of the now line, inside the day", () => {
		const { blocks, now, events } = blocksAt(0, 12);
		const ahead = blocks.filter((b) => b.id !== "k12");
		expect(ahead.every((b) => b.start > now)).toBe(true);
		expect(ahead.every((b) => b.start + (b.length ?? 30) <= 24 * 60)).toBe(true);
		expect(new Set(ahead.map((b) => b.start)).size).toBeGreaterThan(5);
		expect(events.every((e) => e.end <= 24 * 60)).toBe(true);
	});
});

describe("the field's description, projects and new section (task actions spec, Decisions 101–103)", () => {
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
	const screen = (file = mockFile(NOW)) => {
		const p = port(file);
		const store = createScreenStore(p);
		store.getState().start();
		return { p, store };
	};

	it("Description opens a line under the title; Enter writes both, and the next field opens without one", async () => {
		const { p, store } = screen();
		store.getState().plusTap(["soon", "day"]);
		store.getState().openDescription();
		expect(store.getState().draft.descriptionLine).toBe("");
		store.getState().typeDescription("с подробностями");
		const bar = store.getState().entryBar(store.getState().entry!, store.getState().draft, "");
		expect(bar.bar.flatMap((g) => g.actions).find((a) => a.id === "description")?.lit).toBe(true);
		store.getState().commitEntry("С описанием", true);
		expect(store.getState().draft.descriptionLine).toBeNull();
		await settle();
		await settle();
		expect(p.fileText()).toMatch(/- \[ \] С описанием[^\n]*\n\t- с подробностями/);
	});

	it("a rename's Description opens holding the task's own; only a changed one is written, an emptied one taken off", async () => {
		const { p, store } = screen(calendarFile(NOW));
		const id = Object.values(store.getState().shown.cards).find((c) => c.title === "Тренировка")!.id;
		store.getState().openMenu(id, "calendar");
		store.getState().startRename();
		store.getState().openDescription();
		expect(store.getState().draft.descriptionLine).toBe("разминка, потом зал");
		store.getState().typeDescription("");
		store.getState().commitEntry("Тренировка", false);
		await settle();
		await settle();
		expect(p.fileText()).not.toContain("разминка, потом зал");
		store.getState().openMenu("g1");
		store.getState().startRename();
		store.getState().openDescription();
		expect(store.getState().draft.descriptionLine).toBe("");
	});

	it("Project is several checks: each toggles beside the others and is written with the task; No project takes all off", async () => {
		const { p, store } = screen();
		store.getState().plusTap(["soon", "day"]);
		store.getState().toggleProject("Дом");
		store.getState().toggleProject("Отпуск");
		const bar = store.getState().entryBar(store.getState().entry!, store.getState().draft, "");
		expect(bar.projects.filter((o) => o.on).map((o) => o.name)).toEqual(["Дом", "Отпуск"]);
		store.getState().commitEntry("Два проекта", true);
		expect(store.getState().draft.projects).toEqual(["Дом", "Отпуск"]);
		store.getState().clearProjects();
		expect(store.getState().draft.projects).toEqual([]);
		await settle();
		await settle();
		expect(p.fileText()).toContain("Два проекта 📅");
		expect(p.fileText()).toMatch(/Два проекта[^\n]* 🗂️ Дом 🗂️ Отпуск/);
	});

	it("New section, where the column shows sections, makes the field write a section's name there", async () => {
		const { store } = screen();
		store.getState().plusTap(["inbox", "soon"]);
		const bar = store.getState().entryBar(store.getState().entry!, store.getState().draft, "");
		expect(bar.bar[0]).toMatchObject({ group: "mode", actions: [{ id: "newSection", lit: false }] });
		store.getState().toggleSection();
		const section = store.getState().entryBar(store.getState().entry!, store.getState().draft, "");
		expect(section.bar.map((g) => g.group)).toEqual(["mode"]);
		store.getState().commitEntry("Новый раздел", true);
		expect(store.getState().entry).toBeNull();
		await settle();
		await settle();
		expect(store.getState().shown.lists.inbox.rows.some((r) => r.kind === "section" && r.title === "Новый раздел")).toBe(true);
	});

	it("Repeat is on the calendar's field too", () => {
		const { store } = screen(calendarFile(NOW));
		store.getState().openEntry({ list: "day", before: null, dayOffset: 0, at: 600 });
		const bar = store.getState().entryBar(store.getState().entry!, store.getState().draft, "");
		expect(bar.bar.flatMap((g) => g.actions).map((a) => a.id)).toContain("repeat");
	});
});
