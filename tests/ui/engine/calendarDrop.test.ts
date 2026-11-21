// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { calendarFile } from "../../../obsidian/stand/mockData";
import { DESIGN } from "../../../obsidian/ui/shared/design";
import { BASE_SCALE, TimeScale } from "../../../obsidian/ui/engine/layout/timeScale";
import type { ScreenData, ScreenPort } from "../../../obsidian/ui/engine/port";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { settled, standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);

async function calendar(delay: 0 | 300 = 0) {
	const source = await standPort(NOW, calendarFile(NOW), delay);
	const port = source.port;
	return { port, source, store: createScreenStore(port) };
}

const idOf = (port: ScreenPort, title: string): string => {
	const screen = port.read(0);
	const id = Object.keys(screen.cards).find((key) => screen.cards[key].title === title);
	if (!id) throw new Error(`no «${title}»`);
	return id;
};
const blockOf = (port: ScreenPort, title: string) => port.read(0).day.blocks.find((b) => b.id === idOf(port, title));
const dayTitles = (screen: ScreenData) => screen.lists.day.rows.flatMap((row) => (row.kind === "task" ? [screen.cards[row.id].title] : []));

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
	it("a task without a time goes onto the calendar at that minute without a length (Decision 27), out of today's list", async () => {
		const { port } = await calendar();
		const preview = port.preview(idOf(port, "Разобрать почту"), { list: "day", before: null, dayOffset: 0, at: 600 });
		const block = preview.day.blocks.find((b) => preview.cards[b.id].title === "Разобрать почту");
		expect(block).toMatchObject({ start: 600, length: null, clock: "15:00", endClock: null });
		expect(dayTitles(preview)).not.toContain("Разобрать почту");
	});
	it("a block moved keeps its length; into today's list it loses its time", async () => {
		const { port } = await calendar();
		const lunch = blockOf(port, "Обед");
		expect(lunch).toBeDefined();
		const id = idOf(port, "Обед");
		const moved = port.preview(id, { list: "day", before: null, dayOffset: 0, at: 900 }).day.blocks.find((b) => b.id === id);
		expect(moved).toMatchObject({ start: 900, length: lunch?.length });
		const listed = port.preview(id, { list: "day", before: idOf(port, "Полить цветы"), dayOffset: 0 });
		expect(listed.day.blocks.some((b) => b.id === id)).toBe(false);
		expect(dayTitles(listed).indexOf("Обед")).toBe(dayTitles(listed).indexOf("Полить цветы") - 1);
	});
	it("Soon refuses a block from the calendar (the core's `acceptsDrop`, Decision 135 (5)); another day's calendar takes a time", async () => {
		const { port } = await calendar();
		const lunch = idOf(port, "Обед");
		expect(port.takes(lunch, { list: "soon", before: null, dayOffset: 0 })).toBe(false);
		expect(port.takes(idOf(port, "Полить цветы"), { list: "day", before: null, dayOffset: 1, at: 60 })).toBe(true);
		const tomorrow = port.preview(idOf(port, "Полить цветы"), { list: "day", before: null, dayOffset: 1, at: 60 });
		expect(tomorrow.day.blocks.map((b) => tomorrow.cards[b.id].title)).toEqual(["Полить цветы"]);
	});
	it("a move's end: a length written, or none", async () => {
		const { port } = await calendar();
		const lunch = blockOf(port, "Обед");
		const id = idOf(port, "Обед");
		expect(port.preview(id, { list: "day", before: null, dayOffset: 0, at: lunch?.start ?? 0, end: (lunch?.start ?? 0) + 90 }).day.blocks.find((b) => b.id === id)).toMatchObject({ length: 90 });
		expect(port.preview(id, { list: "day", before: null, dayOffset: 0, at: lunch?.start ?? 0, end: null }).day.blocks.find((b) => b.id === id)).toMatchObject({ length: null });
	});
	it("a task put on a past day's calendar goes to Now, dated today, and not onto the past day (the core's drop: its landing is away)", async () => {
		const { port, source } = await calendar();
		const id = idOf(port, "Сдать отчёт");
		await port.move(id, { list: "day", before: null, dayOffset: -1, at: 600 });
		expect(source.fileText().split("## Soon")[0]).toContain("Сдать отчёт 📅 2026-11-18");
		const yesterday = port.read(-1);
		expect(yesterday.day.blocks.map((b) => yesterday.cards[b.id].title)).toEqual([]);
	});
	it("an open task of today whose time has passed rides the now line, its time in the file unchanged (F96)", async () => {
		const { port, source } = await calendar();
		const late = blockOf(port, "Прошедшая по времени");
		expect(late).toMatchObject({ start: 14 * 60 + 20 - 5 * 60, length: 30, clock: "13:15" });
		expect(source.fileText()).toContain("Прошедшая по времени 📅 2026-11-18 📌 2026-11-18 13:15-13:45");
	});
	it("a folded task's block is named by its next open step (F94); events: the one over is past", async () => {
		const { port } = await calendar();
		expect(port.read(0).cards[blockOf(port, "Переезд")?.id ?? ""]?.step).toBe("Упаковать книги");
		port.read(-1);
		await settled(5);
		const events = port.read(0).day.events;
		expect(events.find((e) => e.title === "Стендап")?.past).toBe(true);
		expect(events.find((e) => e.title === "Звонок с клиентом")?.past).toBe(false);
		expect(port.read(-1).day.events.every((e) => e.past)).toBe(true);
		expect(port.read(0).day.allDay.map((e) => e.title)).toEqual(["День рождения Кости"]);
	});
	/**
	 * Max, 2026-11-20 (the stand's review, #6): «Переезд» carried onto the calendar turned into «Упаковать книги». The block
	 * is named by the folded task's next step (F94), while the list's card drew the task's own title alone; one card face
	 * names both, so the list's card shows the same step under the task's title (F79), off the calendar and back.
	 */
	it("a folded task's card names its next step in a list as its block does on the calendar, carried both ways", async () => {
		const { port } = await calendar();
		const id = blockOf(port, "Переезд")?.id ?? "";
		await port.move(id, { list: "day", before: null, dayOffset: 0 });
		const inList = port.read(0);
		expect(inList.day.blocks.some((b) => b.id === id)).toBe(false);
		expect(inList.lists.day.rows.some((row) => row.kind === "task" && row.id === id)).toBe(true);
		expect(inList.cards[id]).toMatchObject({ title: "Переезд", step: "Упаковать книги", folded: true });
		await port.move(id, { list: "day", before: null, dayOffset: 0, at: 600 });
		expect(port.read(0).cards[id]).toMatchObject({ title: "Переезд", step: "Упаковать книги", folded: true });
		expect(port.read(0).cards[idOf(port, "Разобрать почту")]).toMatchObject({ step: null, folded: false });
	});
});

/** The reviewer of E1, 2026-11-18: a second drag let go home during the first drop's write drew the first drop back. */
describe("a drag during a drop's write", () => {
	it("let go where it was taken, it leaves the screen as it stood at its lift, the first drop drawn", async () => {
		const { port, store } = await calendar(300);
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

/** The plugin's resize (the core's `TimelineSpans.stretched` and `resized`, docs/plugin/tasks.md «Длительность») as the stand's port gives it. */
describe("what a dot writes (the port's rule)", () => {
	/** A card and its gap at the base zoom, in minutes: the shortest length kept is longer than that. */
	const LEAST = ((35 + 2) / 56) * 60;
	const to = (at: number, end: number | null) => ({ list: "day", before: null, dayOffset: 0, at, end });
	it("the bottom dot moves the end, the start kept; shrunk to a card and its gap the task loses its length", async () => {
		const { port } = await calendar();
		const lunch = idOf(port, "Обед");
		expect(port.resized(lunch, 0, "end", 750, LEAST)).toEqual(to(660, 750));
		expect(port.resized(lunch, 0, "end", 695, LEAST)).toEqual(to(660, null));
		expect(port.resized(lunch, 0, "end", 720, LEAST)).toBeNull();
	});
	it("the top dot moves the start, the end kept, never past the end", async () => {
		const { port } = await calendar();
		const lunch = idOf(port, "Обед");
		expect(port.resized(lunch, 0, "start", 600, LEAST)).toEqual(to(600, 720));
		expect(port.resized(lunch, 0, "start", 800, LEAST)).toEqual(to(720, null));
	});
	it("a task without a length: its top dot pulled down writes nothing; pulled up short of the minimum, nothing; pulled up enough, the old start becomes the end (review 1)", async () => {
		const { port } = await calendar();
		const bank = idOf(port, "Позвонить в банк");
		expect(port.resized(bank, 0, "start", 1440, LEAST)).toBeNull();
		expect(port.resized(bank, 0, "start", 675, LEAST)).toBeNull();
		expect(port.resized(bank, 0, "start", 630, LEAST)).toEqual(to(630, 690));
	});
	it("while a dot is held, the task is drawn stretched; a task without a length pulled down by its top dot stays where it was", async () => {
		const { port } = await calendar();
		const bank = idOf(port, "Позвонить в банк");
		const drawn = (screen: ScreenData) => screen.day.blocks.find((b) => b.id === bank);
		expect(drawn(port.stretched(bank, 0, "start", 900))).toMatchObject({ start: 690, length: null });
		expect(drawn(port.stretched(bank, 0, "start", 630))).toMatchObject({ start: 630, length: 60 });
		expect(drawn(port.stretched(bank, 0, "end", 750))).toMatchObject({ start: 690, length: 60 });
	});
	it("a task riding the now line: the bottom dot keeps its start in the file and ends where let go; the top dot writes a new start (F105)", async () => {
		const { port } = await calendar();
		const late = idOf(port, "Прошедшая по времени");
		expect(port.resized(late, 0, "end", 620, LEAST)).toEqual(to(495, 555));
		expect(port.resized(late, 0, "start", 545, LEAST)).toEqual(to(545, 590));
	});
});

/** The review of E3: a drag never takes the pointer from a pinch or a resize. */
describe("the gesture slot", () => {
	it("a drag takes it from the ribbon, never from a pinch or a resize", async () => {
		const { store } = await calendar();
		store.getState().claim("ribbon");
		expect(store.getState().claim("drag")).toBe(true);
		store.getState().release("drag");
		for (const held of ["zoom", "resize"] as const) {
			expect(store.getState().claim(held)).toBe(true);
			expect(store.getState().claim("drag")).toBe(false);
			store.getState().release(held);
		}
	});
	it("a resize let go where nothing changes, or cancelled, writes nothing and puts the task back", async () => {
		const { port, store, source } = await calendar();
		const lunch = idOf(port, "Обед");
		const before = source.fileText();
		store.getState().claim("resize");
		store.getState().startResize(lunch, "end");
		store.getState().resizeTo(lunch, "end", 900);
		expect(store.getState().shown.day.blocks.find((b) => b.id === lunch)?.length).toBe(240);
		expect(store.getState().endResize(lunch, "end", null, 37)).toBe(false);
		expect(store.getState().shown.day.blocks.find((b) => b.id === lunch)?.length).toBe(60);
		expect(store.getState().gesture).toBeNull();
		expect(store.getState().resizing).toBeNull();
		expect(source.fileText()).toBe(before);
	});
});

/** The review of E3: events take the plugin's per-colour paint (obsidian/ui/eventColors.ts), both themes from the port. */
describe("an event's paint", () => {
	it("deep colours take a lighter ground and a darker title on the light theme than bright ones; the work calendar's ground is a touch stronger", async () => {
		const { port } = await calendar();
		port.read(0);
		await settled(5);
		const events = port.read(0).day.events;
		const work = events.find((e) => e.title === "Стендап")?.paint;
		const google = events.find((e) => e.title === "Встреча с дизайнером")?.paint;
		expect(work?.dark.bg).toBe("rgba(10, 132, 255, 0.24)");
		expect(work?.light.bg).toBe("rgba(10, 132, 255, 0.13)");
		expect(google?.dark.bg).toBe("rgba(255, 159, 10, 0.22)");
		expect(google?.light.bg).toBe("rgba(255, 159, 10, 0.16)");
		expect(google?.dark.text).toBe("#FFCF85");
	});
});
