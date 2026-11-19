// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { calendarFile, mockFile } from "../../../obsidian/stand/mockData";
import { LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";
import { groupsAbove } from "../../../obsidian/ui/engine/layers/split";
import { monthGrid, monthOf, monthTitle } from "../../../obsidian/ui/engine/layout/month";
import type { TaskMenuModel } from "../../../obsidian/ui/engine/port";
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
