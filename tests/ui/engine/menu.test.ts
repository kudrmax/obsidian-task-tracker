// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LAYOUT } from "../../../obsidian/ui/design";
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { calendarFile, mockFile } from "../../../obsidian/stand/mockData";
import { LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";
import { groupsAbove } from "../../../obsidian/ui/engine/layers/split";
import { monthGrid, monthOf, monthTitle } from "../../../obsidian/ui/engine/layout/month";
import type { TaskMenuModel } from "../../../obsidian/ui/engine/port";
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

describe("the stand's task menu (the plugin's rules, the simplest)", () => {
	it("offers Done, the progress tile named for what it sets, and Won't do, which asks", () => {
		const p = port();
		const open = taskMenu(p, "Задача с описанием");
		expect(open.statuses).toEqual([
			{ id: "done", confirm: false },
			{ id: "inProgress", confirm: false },
			{ id: "wontDo", confirm: true },
		]);
		const going = taskMenu(p, "Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки");
		expect(going.statuses[1].id).toBe("stopProgress");
		expect(open.remove).toEqual({ confirm: true });
	});

	it("offers no tile for the day a task stands on, and Remove due date only for a day that isn't today", () => {
		const p = port();
		const today = taskMenu(p, "Задача с описанием");
		expect(today.moves).toEqual(["tomorrow", "pick"]);
		expect(today.date.removable).toBe(false);
		const inbox = taskMenu(p, p.read(0).cards[p.read(0).lists.inbox.rows.find((r) => r.kind === "task")!.id].title);
		expect(inbox.moves).toEqual(["today", "tomorrow", "pick"]);
	});

	it("names the rows of the edit group as the plugin does: Reminder for a timed task, Add description without one, Section in a list with sections", () => {
		const p = port(calendarFile(NOW));
		const timed = taskMenu(p, "Тренировка", "calendar");
		expect(timed.edits.map((e) => e.id)).toEqual(["rename", "reminder", "repeat", "project", "subtask", "firstStep"]);
		expect(timed.edits.find((e) => e.id === "reminder")?.value).toBe("live");
		expect(timed.peek).toBe("разминка, потом зал");
		const plain = taskMenu(p, "Купить подарок");
		expect(plain.edits.map((e) => e.id)).toContain("description");
		const inbox = port();
		const first = inbox.read(0).lists.inbox.rows.find((r) => r.kind === "task")!.id;
		expect((inbox.menu(first, "list") as TaskMenuModel).edits.map((e) => e.id)).toContain("section");
		expect((inbox.menu(first, "calendar") as TaskMenuModel).edits.map((e) => e.id)).not.toContain("section");
	});

	it("shows a calendar task's open subtasks in its menu (F107), and none in a stack's own menu", () => {
		const p = port(calendarFile(NOW));
		const folded = taskMenu(p, "Переезд", "calendar");
		expect(folded.subtasks).toEqual(["k10", "k11"]);
		expect(p.menu("k10", "stack").kind === "task" && (p.menu("k10", "stack") as TaskMenuModel).edits.map((e) => e.id)).not.toContain("subtask");
	});

	it("disables Project on a subtask", () => {
		const p = port(calendarFile(NOW));
		const sub = p.menu("k10", "stack") as TaskMenuModel;
		expect(sub.edits.find((e) => e.id === "project")?.disabled).toBe(true);
	});

	it("writes what was tapped: a move to the end of Now, a level on and off, a day picked, Delete", async () => {
		const p = port(calendarFile(NOW));
		await p.act("g1", { kind: "move", id: "today" });
		expect(p.fileText()).toMatch(/Купить подарок 📅 2026-11-18\n(?![\s\S]*## Soon[\s\S]*Купить подарок)/);
		await p.act("g2", { kind: "priority", prefix: "p1" });
		expect(p.fileText()).toContain("p1 Сдать отчёт");
		await p.act("g2", { kind: "priority", prefix: "p1" });
		expect(p.fileText()).not.toContain("p1 Сдать отчёт");
		await p.act("g3", { kind: "date", date: "2026-11-25" });
		expect(p.fileText()).toContain("Написать письмо 📅 2026-11-25");
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
	it("splits a panel too tall for either side: as many first groups over the copy as fit there whole", () => {
		expect(groupsAbove([100, 200, 300], 400, 500, 500, true)).toBe(0);
		expect(groupsAbove([100, 200, 300], 400, 500, 100, true)).toBe(4);
		expect(groupsAbove([100, 200, 300], 400, 250, 250, true)).toBe(2);
		expect(groupsAbove([100, 200, 300], 400, 150, 150, true)).toBe(1);
		expect(groupsAbove([100], 400, 150, 300, false)).toBe(0);
		/** The test Obsidian, 2026-11-20: a calendar task's copy at the window's bottom left its Delete in a part of no height. */
		expect(groupsAbove([82, 164, 246, 600, 688], 732, 674, 10, true, 44)).toBe(6);
		expect(groupsAbove([82, 164, 246, 600, 688], 732, 674, 100, true, 44)).toBe(4);
		/** Room for a few rows under the copy: the split stands, the part under it scrolling. */
		expect(groupsAbove([82, 164, 246, 600, 688], 900, 472, 218, true, 44)).toBe(3);
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
		expect(bar).toMatchObject({ indents: true, canIndent: false, canOutdent: false, where: { id: "inbox" } });
		expect(bar.projects).not.toBeNull();
		store.getState().indentEntry(1);
		expect(store.getState().entry!.at.depth).toBe(0);
	});

	it("a subtask's rename has no place and no project; a block's has the flag and the project; a stack card's the flag only", () => {
		const lists = screen().store;
		const sub = (["inbox", "soon", "day"] as const).flatMap((l) => lists.getState().shown.lists[l].rows).find((r) => r.kind === "task" && r.depth > 0)!.id;
		lists.getState().openMenu(sub);
		lists.getState().startRename();
		let s = lists.getState();
		expect(s.entryBar(s.entry!, s.draft, s.entryText)).toMatchObject({ indents: true, canIndent: false, projects: null, where: null });
		const store = createScreenStore(port(calendarFile(NOW)));
		store.getState().start();
		store.getState().openMenu("k8", "calendar");
		store.getState().startRename();
		s = store.getState();
		expect(s.entry).toMatchObject({ renaming: "k8", stack: false });
		const block = s.entryBar(s.entry!, s.draft, s.entryText);
		expect(block).toMatchObject({ indents: false, where: null });
		expect(block.projects).not.toBeNull();
		store.getState().openEntry(null);
		store.getState().openMenu("k8", "calendar");
		const child = (store.getState().layer!.model as { subtasks: readonly string[] }).subtasks[0];
		store.getState().openMenu(child, "stack");
		store.getState().startRename();
		s = store.getState();
		expect(s.layer?.id).toBe(child);
		expect(s.entry).toMatchObject({ renaming: child, stack: true });
		expect(s.entryBar(s.entry!, s.draft, s.entryText)).toMatchObject({ indents: false, projects: null, where: null });
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

	it("a mouse's second press within a double click of the click that opened the menu renames; later, or a finger's, doesn't (F117)", () => {
		const { store } = screen();
		const id = firstInbox(store);
		store.getState().openMenu(id, "list", false, 1000);
		expect(store.getState().pressAgain(1000 + LAYOUT.doubleClickMs + 1)).toBe(false);
		expect(store.getState().layer).not.toBeNull();
		store.getState().openMenu(id, "list", false, 2000);
		expect(store.getState().pressAgain(2000 + LAYOUT.doubleClickMs)).toBe(true);
		expect(store.getState().layer).toBeNull();
		expect(store.getState().entry).toMatchObject({ renaming: id });
		store.getState().openEntry(null);
		store.getState().openMenu(id, "list", false, null);
		expect(store.getState().pressAgain(1)).toBe(false);
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
