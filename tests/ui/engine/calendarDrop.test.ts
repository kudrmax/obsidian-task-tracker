// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MockPort } from "../../../obsidian/stand/MockPort";
import { calendarFile } from "../../../obsidian/stand/mockData";
import { DESIGN } from "../../../obsidian/ui/design";
import { BASE_SCALE, TimeScale } from "../../../obsidian/ui/engine/layout/timeScale";
import { createScreenStore } from "../../../obsidian/ui/engine/store";

const NOW = new Date(2026, 10, 18, 14, 20);

function calendar(delay: 0 | 300 = 0) {
	const port = new MockPort(() => NOW);
	port.delay = delay;
	port.reset(calendarFile(NOW));
	return { port, store: createScreenStore(port) };
}

const idOf = (port: MockPort, title: string): string => {
	const screen = port.read(0);
	const id = Object.keys(screen.cards).find((key) => screen.cards[key].title === title);
	if (!id) throw new Error(`no «${title}»`);
	return id;
};
const blockOf = (port: MockPort, title: string) => port.read(0).day.blocks.find((b) => b.id === idOf(port, title));
const dayTitles = (screen: ReturnType<MockPort["read"]>) => screen.lists.day.rows.flatMap((row) => (row.kind === "task" ? [screen.cards[row.id].title] : []));

describe("the calendar's time scale: a carried task's top to its start", () => {
	it("snaps to the 15-minute step at the base zoom", () => {
		expect(BASE_SCALE.start(0)).toBe(0);
		expect(BASE_SCALE.start(DESIGN.hourPx)).toBe(60);
		expect(BASE_SCALE.start(DESIGN.hourPx * 1.1)).toBe(60);
		expect(BASE_SCALE.start(DESIGN.hourPx * 1.2)).toBe(75);
	});
	it("stays within the day", () => {
		expect(BASE_SCALE.start(-200)).toBe(0);
		expect(BASE_SCALE.start(DESIGN.hourPx * 30)).toBe(TimeScale.DAY - BASE_SCALE.step);
	});
	it("the snap follows the zoom (F100): 30 minutes small, 15 normal, 5 large", () => {
		expect(new TimeScale(28).step).toBe(30);
		expect(new TimeScale(56).step).toBe(15);
		expect(new TimeScale(112).step).toBe(5);
		expect(new TimeScale(224).step).toBe(5);
		expect(new TimeScale(112).start(112 * 1.1)).toBe(65);
	});
	it("finer marks come with the zoom (F99): only hours at 56, «:30» at 112, quarters and bare 5-minute lines at 224", () => {
		expect(new TimeScale(56).marks()).toEqual([]);
		expect(new TimeScale(112).marks().slice(0, 2)).toEqual([
			{ minute: 30, label: ":30" },
			{ minute: 90, label: ":30" },
		]);
		const fine = new TimeScale(224).marks().filter((m) => m.minute < 60);
		expect(fine.filter((m) => m.label !== null).map((m) => m.label)).toEqual([":15", ":30", ":45"]);
		expect(fine.length).toBe(11);
	});
});

describe("the stand's port onto and off the calendar (spec, Decisions 25)", () => {
	it("a task without a time goes onto the calendar at that minute without a length (Decision 27), out of today's list", () => {
		const { port } = calendar();
		const preview = port.preview(idOf(port, "Разобрать почту"), { list: "day", before: null, dayOffset: 0, at: 600 });
		const block = preview.day.blocks.find((b) => preview.cards[b.id].title === "Разобрать почту");
		expect(block).toMatchObject({ start: 600, length: null, clock: "15:00", endClock: null });
		expect(dayTitles(preview)).not.toContain("Разобрать почту");
	});
	it("a block moved keeps its length; into today's list it loses its time", () => {
		const { port } = calendar();
		const lunch = blockOf(port, "Обед");
		expect(lunch).toBeDefined();
		const id = idOf(port, "Обед");
		const moved = port.preview(id, { list: "day", before: null, dayOffset: 0, at: 900 }).day.blocks.find((b) => b.id === id);
		expect(moved).toMatchObject({ start: 900, length: lunch?.length });
		const listed = port.preview(id, { list: "day", before: idOf(port, "Полить цветы"), dayOffset: 0 });
		expect(listed.day.blocks.some((b) => b.id === id)).toBe(false);
		expect(dayTitles(listed).indexOf("Обед")).toBe(dayTitles(listed).indexOf("Полить цветы") - 1);
	});
	it("Soon takes a timed task, its time erased (F157); another day's calendar takes a time", () => {
		const { port } = calendar();
		const lunch = idOf(port, "Обед");
		expect(port.takes(lunch, { list: "soon", before: null, dayOffset: 0 })).toBe(true);
		const soon = port.preview(lunch, { list: "soon", before: null, dayOffset: 0 });
		expect(soon.day.blocks.some((b) => b.id === lunch)).toBe(false);
		expect(soon.lists.soon.rows.some((row) => row.id === lunch)).toBe(true);
		expect(port.takes(idOf(port, "Полить цветы"), { list: "day", before: null, dayOffset: 1, at: 60 })).toBe(true);
		const tomorrow = port.preview(idOf(port, "Полить цветы"), { list: "day", before: null, dayOffset: 1, at: 60 });
		expect(tomorrow.day.blocks.map((b) => tomorrow.cards[b.id].title)).toEqual(["Полить цветы"]);
	});
	it("a resize's end: a length written, or none", () => {
		const { port } = calendar();
		const lunch = blockOf(port, "Обед");
		const id = idOf(port, "Обед");
		expect(port.preview(id, { list: "day", before: null, dayOffset: 0, at: lunch?.from ?? 0, end: (lunch?.from ?? 0) + 90 }).day.blocks.find((b) => b.id === id)).toMatchObject({ length: 90 });
		expect(port.preview(id, { list: "day", before: null, dayOffset: 0, at: lunch?.from ?? 0, end: null }).day.blocks.find((b) => b.id === id)).toMatchObject({ length: null });
	});
	it("an open task of today whose time has passed rides the now line, its time in the file unchanged (F96)", () => {
		const { port } = calendar();
		const late = blockOf(port, "Прошедшая по времени");
		expect(late).toMatchObject({ start: 14 * 60 + 20 - 5 * 60, length: 30 });
		expect(late?.from).toBeLessThan(late?.start ?? 0);
		expect(port.fileText()).toContain("Прошедшая по времени 📅 2026-11-18 📌 2026-11-18 13:15-13:45");
	});
	it("a folded task's block is named by its next open step (F94); events: the one over is past", () => {
		const { port } = calendar();
		expect(blockOf(port, "Переезд")?.step).toBe("Упаковать книги");
		const events = port.read(0).day.events;
		expect(events.find((e) => e.title === "Стендап")?.past).toBe(true);
		expect(events.find((e) => e.title === "Звонок с клиентом")?.past).toBe(false);
		expect(port.read(-1).day.events.every((e) => e.past)).toBe(true);
		expect(port.read(0).day.allDay.map((e) => e.title)).toEqual(["День рождения Кости"]);
	});
	it("a preview counts a write not yet read back", async () => {
		const { port } = calendar(300);
		const mail = idOf(port, "Разобрать почту");
		const written = port.move(mail, { list: "day", before: null, dayOffset: 0, at: 600 });
		const next = port.preview(idOf(port, "Полить цветы"), { list: "soon", before: null, dayOffset: 0 });
		expect(next.day.blocks.some((b) => b.id === mail)).toBe(true);
		await written;
	});
});

/** The reviewer of E1, 2026-11-18: a second drag let go home during the first drop's write drew the first drop back. */
describe("a drag during a drop's write", () => {
	it("let go where it was taken, it leaves the screen as it stood at its lift, the first drop drawn", async () => {
		const { port, store } = calendar(300);
		const mail = idOf(port, "Разобрать почту");
		const flowers = idOf(port, "Полить цветы");
		store.getState().claim("drag");
		store.getState().lift(mail);
		const written = new Promise<void>((resolve) => {
			const off = port.subscribe(() => {
				off();
				resolve();
			});
		});
		store.getState().drop(mail, { list: "day", before: null, dayOffset: 0, at: 600 });
		expect(store.getState().shown.day.blocks.some((b) => b.id === mail)).toBe(true);
		store.getState().claim("drag");
		store.getState().lift(flowers);
		store.getState().carryInto(flowers, { list: "soon", before: null, dayOffset: 0 });
		store.getState().drop(flowers, null);
		expect(store.getState().shown.day.blocks.some((b) => b.id === mail)).toBe(true);
		expect(dayTitles(store.getState().shown)).toContain("Полить цветы");
		await written;
	});
});
