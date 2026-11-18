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
	it("snaps to the 15-minute step", () => {
		expect(BASE_SCALE.start(0)).toBe(0);
		expect(BASE_SCALE.start(DESIGN.hourPx)).toBe(60);
		expect(BASE_SCALE.start(DESIGN.hourPx * 1.1)).toBe(60);
		expect(BASE_SCALE.start(DESIGN.hourPx * 1.2)).toBe(75);
	});
	it("stays within the day", () => {
		expect(BASE_SCALE.start(-200)).toBe(0);
		expect(BASE_SCALE.start(DESIGN.hourPx * 30)).toBe(TimeScale.DAY - TimeScale.STEP);
	});
});

describe("the stand's port onto and off the calendar (spec, Decisions 25)", () => {
	it("a task without a time goes onto the calendar at that minute for an hour, out of today's list", () => {
		const { port } = calendar();
		const preview = port.preview(idOf(port, "Разобрать почту"), { list: "day", before: null, dayOffset: 0, at: 600 });
		const block = preview.day.blocks.find((b) => preview.cards[b.id].title === "Разобрать почту");
		expect(block).toMatchObject({ start: 600, end: 660 });
		expect(dayTitles(preview)).not.toContain("Разобрать почту");
	});
	it("a block moved keeps its length; into today's list it loses its time", () => {
		const { port } = calendar();
		const lunch = blockOf(port, "Обед");
		expect(lunch).toBeDefined();
		const id = idOf(port, "Обед");
		const moved = port.preview(id, { list: "day", before: null, dayOffset: 0, at: 30 }).day.blocks.find((b) => b.id === id);
		expect(moved).toMatchObject({ start: 30, end: 30 + ((lunch?.end ?? 0) - (lunch?.start ?? 0)) });
		const listed = port.preview(id, { list: "day", before: idOf(port, "Полить цветы"), dayOffset: 0 });
		expect(listed.day.blocks.some((b) => b.id === id)).toBe(false);
		expect(dayTitles(listed).indexOf("Обед")).toBe(dayTitles(listed).indexOf("Полить цветы") - 1);
	});
	it("Soon refuses a task with a time and takes one without; only today's calendar takes a time", () => {
		const { port } = calendar();
		expect(port.takes(idOf(port, "Обед"), { list: "soon", before: null, dayOffset: 0 })).toBe(false);
		expect(port.takes(idOf(port, "Полить цветы"), { list: "soon", before: null, dayOffset: 0 })).toBe(true);
		expect(port.takes(idOf(port, "Полить цветы"), { list: "day", before: null, dayOffset: 1, at: 60 })).toBe(false);
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
