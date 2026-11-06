// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { DayBoundary } from "../../src/application/contracts";
import type { CalendarEvent, TaskItem } from "../../src/application/contracts";
import { Timeline } from "../../src/ui/Timeline";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { onDay } from "../fakes/itemOnDay";
import { withShownSpan } from "../fakes/timelineDeps";

/** One card and one gap: how far down a stack the next card stands. */
const STACK_STEP = DEFAULT_SETTINGS.cardHeight + DEFAULT_SETTINGS.cardGap;

function timeline(zoom: { hourPx: number }, boundary = DayBoundary.MIDNIGHT, tasks: TaskItem[] = []): Timeline {
	const view = new Timeline(document.createElement("div"), withShownSpan({
		theme: () => "dark",
		date: () => "2026-10-30",
		today: () => "2026-10-31",
		boundary: () => boundary,
		hourPx: () => zoom.hourPx,
		tasks: () => tasks,
		events: () => [],
		now: () => new Date(2026, 9, 31, 12, 0),
	}));
	view.render();
	return view;
}

function minorLabels(view: Timeline): string[] {
	return [...view.canvas.querySelectorAll(".tc-hour-label.is-minor")].map((label) => label.textContent ?? "");
}

describe("a day that starts at 4", () => {
	const late: TaskItem = onDay({ key: { section: "now", index: 0, path: [], raw: "" }, text: "Late", status: "todo", dueDate: null, slot: { date: "2026-10-31", start: 60, end: 120 }, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-10-30");

	it("labels the hours from 04 round to 04 the next morning, two digits each", () => {
		const labels = [...timeline({ hourPx: 56 }, new DayBoundary(4)).canvas.querySelectorAll(".tc-hour-label")].map((l) => l.textContent);
		expect(labels.slice(0, 2)).toEqual(["04", "05"]);
		expect(labels.slice(-5)).toEqual(["00", "01", "02", "03", "04"]);
	});

	it("places a slot after midnight below the evening, a pixel under its line", () => {
		const view = timeline({ hourPx: 56 }, new DayBoundary(4), [late]);
		const block = view.itemsEl.querySelector<HTMLElement>(".tc-block")!;
		expect(block.style.getPropertyValue("--tc-y")).toBe(`${21 * 56 + 1}px`);
		expect(view.slotAt(21 * 60, 22 * 60)).toEqual(late.slot);
	});
});

describe("Timeline grid", () => {
	it("labels only the hours at the base zoom", () => {
		const view = timeline({ hourPx: 56 });
		expect(view.canvas.querySelectorAll(".tc-hour-label")).toHaveLength(25);
		expect(minorLabels(view)).toEqual([]);
	});

	it("marks the half hours and then the quarters as it zooms in, and drops them as it zooms out", () => {
		const zoom = { hourPx: 112 };
		const view = timeline(zoom);
		expect(minorLabels(view)).toHaveLength(24);
		expect(minorLabels(view).slice(0, 2)).toEqual([":30", ":30"]);
		expect(view.canvas.querySelectorAll(".tc-hour-line.is-minor")).toHaveLength(24);

		zoom.hourPx = 224;
		view.layout();
		expect(minorLabels(view).slice(0, 4)).toEqual([":15", ":30", ":45", ":15"]);
		expect(view.canvas.querySelectorAll(".tc-hour-line.is-minor")).toHaveLength(24 * 11);

		zoom.hourPx = 56;
		view.layout();
		expect(minorLabels(view)).toEqual([]);
	});

	it("puts each mark at its minute", () => {
		const view = timeline({ hourPx: 112 });
		const first = view.canvas.querySelector<HTMLElement>(".tc-hour-line.is-minor")!;
		expect(first.style.getPropertyValue("--tc-y")).toBe("56px");
	});
});

describe("hour labels by the now line", () => {
	function hidden(hourPx: number, hours: number, minutes: number): string[] {
		const view = new Timeline(document.createElement("div"), withShownSpan({
			theme: () => "dark",
			date: () => "2026-10-31",
			today: () => "2026-10-31",
			boundary: () => new DayBoundary(4),
			hourPx: () => hourPx,
			tasks: () => [],
			events: () => [],
			now: () => new Date(2026, 10, 1, hours, minutes),
		}));
		view.render();
		return [...view.canvas.querySelectorAll(".tc-hour-label.is-hidden")].map((label) => label.textContent ?? "");
	}

	it("hides only the label the now pill covers, however small the hour", () => {
		expect(hidden(20, 0, 52)).toEqual(["01"]);
		expect(hidden(56, 0, 52)).toEqual(["01"]);
	});

	it("hides the label the pill touches from either side", () => {
		expect(hidden(20, 0, 38)).toEqual(["00", "01"]);
		expect(hidden(56, 0, 14)).toEqual(["00"]);
		expect(hidden(56, 0, 17)).toEqual([]);
	});
});

describe("task cards", () => {
	const task = (index: number, start: number, end: number | null): TaskItem => onDay({ key: { section: "now", index, path: [], raw: "" }, text: `T${index}`, status: "todo", dueDate: null, slot: { date: "2026-10-30", start, end }, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-10-30");

	it("stands the cards in the page in the stack's order, so a card over a long one is drawn over it", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [task(0, 900, null), task(1, 840, 960)]);
		const titles = [...view.itemsEl.querySelectorAll(".tc-block")].map((b) => b.textContent);
		expect(titles).toEqual(["T1", "T0"]);
		const over = view.itemsEl.querySelectorAll<HTMLElement>(".tc-block")[1];
		expect(over.classList.contains("is-over")).toBe(true);
		expect(over.style.getPropertyValue("--tc-x")).toBe("19px");
	});

	it("tints the card of a task with a priority", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [{ ...task(0, 900, null), priority: { prefix: "p2", color: "orange" } }, task(1, 1020, null)]);
		const cards = view.itemsEl.querySelectorAll<HTMLElement>(".tc-block-card");
		expect(cards[0].dataset.priority).toBe("orange");
		expect(cards[1].hasAttribute("data-priority")).toBe(false);
	});

	it("shows the dots over the selected card only", () => {
		const tasks = [task(0, 1020, null), task(1, 1020, null)];
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, tasks);
		const grips = view.itemsEl.querySelector<HTMLElement>(".tc-grips")!;
		expect(grips.classList.contains("is-shown")).toBe(false);
		view.select(tasks[1]);
		expect(grips.classList.contains("is-shown")).toBe(true);
		expect(grips.style.getPropertyValue("--tc-y")).toBe(`${17 * 56 + 1 + STACK_STEP}px`);
	});

	it("marks a drop with a line at its very minute and leaves the cards where they are", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [task(0, 1020, null)]);
		view.showDrop({ start: 1035, end: null });
		const line = document.body.querySelector<HTMLElement>(".tc-drop")!;
		expect(line.style.getPropertyValue("--tc-y")).toBe(`${17.25 * 56}px`);
		expect(line.textContent).toBe("17:15");
		expect(view.itemsEl.querySelector<HTMLElement>(".tc-block")!.style.getPropertyValue("--tc-y")).toBe(`${17 * 56 + 1}px`);
		view.clearDrop();
		expect(document.body.querySelector(".tc-drop")).toBeNull();
	});
});

describe("a field on the timeline", () => {
	const task = (index: number, start: number, end: number | null): TaskItem => onDay({ key: { section: "now", index, path: [], raw: `T${index}` }, text: `T${index}`, status: "todo", dueDate: null, slot: { date: "2026-10-30", start, end }, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, group: null, description: null, list: "now", isSubtask: false }, "2026-10-30");
	const box = (node: HTMLElement) => ["--tc-y", "--tc-len", "--tc-x"].map((p) => node.style.getPropertyValue(p));
	const fieldBox = (view: Timeline) => view.itemsEl.querySelector<HTMLElement>(".tc-quick-row")!;

	it("stands a new task's field where the drop target lands a task, the slot's time on its right", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [task(0, 1020, null)]);
		view.showDrop({ start: 1035, end: null });
		const landing = view.landing()!;
		view.clearDrop();
		const field = document.createElement("textarea");
		view.showField({ date: "2026-10-30", start: 1035, end: null }, field);
		const holder = fieldBox(view);
		expect(holder.contains(field)).toBe(true);
		expect(holder.classList.contains("tc-block")).toBe(true);
		expect(holder.style.getPropertyValue("--tc-y")).toBe(`${landing.y}px`);
		expect(holder.style.getPropertyValue("--tc-x")).toBe(`${landing.x}px`);
		expect(holder.style.getPropertyValue("--tc-len")).toBe(`${landing.height}px`);
		expect(holder.querySelector(".tc-field-time")!.textContent).toBe("17:15");
	});

	it("has the stack make room for the field, as for a task dropped there", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [task(0, 1020, null)]);
		view.showField({ date: "2026-10-30", start: 1020, end: null }, document.createElement("textarea"));
		expect(fieldBox(view).style.getPropertyValue("--tc-y")).toBe(`${17 * 56 + 1}px`);
		expect(view.itemsEl.querySelector<HTMLElement>(".tc-block:not(.tc-quick-row)")!.style.getPropertyValue("--tc-y")).toBe(`${17 * 56 + 1 + STACK_STEP}px`);
	});

	it("keeps the field, the same element, across a redraw, and takes it away on clearField", () => {
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [task(0, 1020, null)]);
		const field = document.createElement("textarea");
		view.showField({ date: "2026-10-30", start: 600, end: null }, field);
		const holder = fieldBox(view);
		view.render();
		view.showField({ date: "2026-10-30", start: 600, end: null }, field);
		expect(fieldBox(view)).toBe(holder);
		expect(holder.contains(field)).toBe(true);
		view.clearField();
		expect(view.itemsEl.querySelector(".tc-quick-row")).toBeNull();
		expect(view.itemsEl.contains(field)).toBe(false);
	});

	it("turns a renamed task's card into the field: the card hides, the field takes its place and size", () => {
		const tasks = [task(0, 900, 960), task(1, 1020, null)];
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, tasks);
		const field = document.createElement("textarea");
		view.showRename(tasks[0], field);
		const block = [...view.itemsEl.querySelectorAll<HTMLElement>(".tc-block:not(.tc-quick-row)")].find((b) => b.textContent === "T0")!;
		expect(block.classList.contains("is-renaming")).toBe(true);
		expect(box(fieldBox(view))).toEqual(box(block));
		expect(fieldBox(view).querySelector(".tc-field-time")).toBeNull();
		view.render();
		const redrawn = [...view.itemsEl.querySelectorAll<HTMLElement>(".tc-block:not(.tc-quick-row)")].find((b) => b.textContent === "T0")!;
		expect(redrawn.classList.contains("is-renaming")).toBe(true);
		view.clearField();
		expect(view.itemsEl.querySelector(".is-renaming")).toBeNull();
	});

	it("hides the dots of the selected task while the field renames it, and shows them again after", () => {
		const tasks = [task(0, 900, 960)];
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, tasks);
		view.select(tasks[0]);
		const grips = view.itemsEl.querySelector(".tc-grips")!;
		expect(grips.classList.contains("is-shown")).toBe(true);
		view.showRename(tasks[0], document.createElement("textarea"));
		expect(grips.classList.contains("is-shown")).toBe(false);
		view.clearField();
		expect(grips.classList.contains("is-shown")).toBe(true);
	});
});

describe("a renamed task in progress on the timeline", () => {
	const task = (status: TaskItem["status"]): TaskItem => onDay({ key: { section: "now", index: 0, path: [], raw: "T0" }, text: "T0", status, dueDate: null, slot: { date: "2026-10-30", start: 900, end: 960 }, reminder: "notification", repeat: null, open: status === "todo" || status === "inProgress", repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, group: null, description: null, list: "now", isSubtask: false }, "2026-10-30");

	it("keeps its strip at the field's left, and a task not in progress has none", () => {
		const doing = task("inProgress");
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, [doing]);
		const field = document.createElement("textarea");
		view.showRename(doing, field);
		const box = view.itemsEl.querySelector<HTMLElement>(".tc-quick-row")!;
		expect(box.querySelectorAll(".tc-progress-dot")).toHaveLength(1);
		view.showRename(doing, field);
		expect(box.querySelectorAll(".tc-progress-dot")).toHaveLength(1);
		view.showRename(task("todo"), field);
		expect(box.querySelector(".tc-progress-dot")).toBeNull();
	});
});

describe("tasks the now line has passed", () => {
	const hourPx = 56;
	const task = (index: number, start: number, end: number | null, status: TaskItem["status"] = "todo"): TaskItem => onDay({ key: { section: "now", index, path: [], raw: "" }, text: `T${index}`, status, dueDate: null, slot: { date: "2026-10-31", start, end }, reminder: "notification", repeat: null, open: status === "todo" || status === "inProgress", repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-10-30");

	function onToday(tasks: TaskItem[], date = "2026-10-31"): HTMLElement[] {
		const view = new Timeline(document.createElement("div"), withShownSpan({
			theme: () => "dark",
			date: () => date,
			today: () => "2026-10-31",
			boundary: () => DayBoundary.MIDNIGHT,
			hourPx: () => hourPx,
			tasks: () => tasks,
			events: () => [],
			now: () => new Date(2026, 9, 31, 12, 0),
		}));
		view.render();
		return tasks.map((t) => [...view.itemsEl.querySelectorAll<HTMLElement>(".tc-block")].find((b) => b.textContent?.startsWith(t.text))!);
	}

	const y = (block: HTMLElement) => block.style.getPropertyValue("--tc-y");
	const meta = (block: HTMLElement) => [...block.querySelectorAll(".tc-block-meta > span")].map((s) => s.textContent);

	it("stands a task left undone past its time on the now line, marked no other way than a card on its time", () => {
		const [late] = onToday([task(0, 600, null)]);
		expect(y(late)).toBe(`${12 * hourPx + 1}px`);
		expect(late.className).toBe("tc-block");
		expect(late.querySelector(".tc-block-meta")!.classList.contains("is-hidden")).toBe(true);
	});

	it("carries a task with a duration along whole", () => {
		const [late] = onToday([task(0, 600, 720)]);
		expect(y(late)).toBe(`${12 * hourPx + 1}px`);
		expect(late.style.getPropertyValue("--tc-len")).toBe(`${2 * hourPx - 2}px`);
	});

	it("carries a task in progress too", () => {
		const [doing] = onToday([task(0, 600, null, "inProgress")]);
		expect(y(doing)).toBe(`${12 * hourPx + 1}px`);
	});

	it("marks a task in progress with one dot before its title, and no other card", () => {
		const [plain, doing] = onToday([task(0, 540, null), task(1, 600, null, "inProgress")]);
		expect(plain.querySelector(".tc-progress-dot")).toBeNull();
		const card = doing.querySelector(".tc-block-card")!;
		expect(card.querySelectorAll(":scope > .tc-progress-dot")).toHaveLength(1);
		expect(card.querySelector(":scope > .tc-progress-dot")!.nextElementSibling!.classList.contains("tc-card-title")).toBe(true);
	});

	it("writes a task in progress pushed down the stack at its own time, not the line's", () => {
		const [, doing] = onToday([task(0, 540, null), task(1, 600, null, "inProgress")]);
		expect(y(doing)).toBe(`${12 * hourPx + 1 + STACK_STEP}px`);
		expect(meta(doing)).toEqual(["10", "00"]);
	});

	it("leaves a task at the very minute or later on its time", () => {
		const [now, later] = onToday([task(0, 720, null), task(1, 840, null)]);
		expect(y(now)).toBe(`${12 * hourPx + 1}px`);
		expect(y(later)).toBe(`${14 * hourPx + 1}px`);
	});

	it("stacks several late tasks under the line in their order", () => {
		const [first, second] = onToday([task(0, 540, null), task(1, 600, null)]);
		expect(y(first)).toBe(`${12 * hourPx + 1}px`);
		expect(y(second)).toBe(`${12 * hourPx + 1 + STACK_STEP}px`);
		expect(meta(second)).toEqual(["10", "00"]);
	});

	it("moves nothing on another day", () => {
		const [past] = onToday([{ ...task(0, 600, null), slot: { date: "2026-11-02", start: 600, end: null } }], "2026-11-02");
		expect(y(past)).toBe(`${10 * hourPx + 1}px`);
	});
});

describe("the minute's tick", () => {
	const hourPx = 56;
	const task = (start: number): TaskItem => onDay({ key: { section: "now", index: 0, path: [], raw: "" }, text: "T", status: "todo", dueDate: null, slot: { date: "2026-10-31", start, end: null }, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-10-30");
	const meeting: CalendarEvent = { id: "m", title: "Meeting", start: new Date(2026, 9, 31, 9), end: new Date(2026, 9, 31, 10), allDay: false, calendar: "Work", color: "#0A84FF", source: "google", account: null, calendarId: null };

	function ticking(tasks: TaskItem[]) {
		const clock = { now: new Date(2026, 9, 31, 12, 0) };
		const view = new Timeline(document.createElement("div"), withShownSpan({
			theme: () => "dark",
			date: () => "2026-10-31",
			today: () => "2026-10-31",
			boundary: () => DayBoundary.MIDNIGHT,
			hourPx: () => hourPx,
			tasks: () => tasks,
			events: () => [meeting],
			now: () => clock.now,
		}));
		view.render();
		return { view, clock };
	}

	it("greys an event the now line has passed and keeps the rest in their colour", () => {
		const { view, clock } = ticking([]);
		const block = view.itemsEl.querySelector<HTMLElement>(".tc-event")!;
		expect(block.classList.contains("is-past")).toBe(true);
		clock.now = new Date(2026, 9, 31, 9, 30);
		view.tickNow();
		expect(block.classList.contains("is-past")).toBe(false);
	});

	it("greys an event the moment it ends, on the tick", () => {
		const { view, clock } = ticking([]);
		const block = view.itemsEl.querySelector<HTMLElement>(".tc-event")!;
		clock.now = new Date(2026, 9, 31, 9, 59);
		view.tickNow();
		expect(block.classList.contains("is-past")).toBe(false);
		clock.now = new Date(2026, 9, 31, 10, 0);
		view.tickNow();
		expect(block.classList.contains("is-past")).toBe(true);
	});

	it("moves the now line and the pill's time without drawing the items again", () => {
		const { view, clock } = ticking([task(840)]);
		const items = [...view.itemsEl.children];
		const line = view.canvas.querySelector<HTMLElement>(".tc-now")!;
		clock.now = new Date(2026, 9, 31, 12, 7);
		view.tickNow();
		expect([...view.itemsEl.children]).toEqual(items);
		expect(view.canvas.querySelector(".tc-now")).toBe(line);
		expect(line.querySelector(".tc-now-pill")!.textContent).toBe("12:07");
		expect(line.style.getPropertyValue("--tc-y")).toBe(`${12 * hourPx + (7 * hourPx) / 60}px`);
	});

	it("a task that passed the now line follows it on the tick", () => {
		const { view, clock } = ticking([task(600)]);
		const block = view.itemsEl.querySelector<HTMLElement>(".tc-block")!;
		const line = view.canvas.querySelector<HTMLElement>(".tc-now")!;
		clock.now = new Date(2026, 9, 31, 13, 0);
		view.tickNow();
		expect(block.style.getPropertyValue("--tc-y")).toBe(`${13 * hourPx + 1}px`);
		expect(line.style.getPropertyValue("--tc-y")).toBe(`${13 * hourPx}px`);
	});
});

describe("the timeline's size", () => {
	it("stops watching its size once destroyed", () => {
		const real = globalThis.ResizeObserver;
		const disconnect = vi.fn();
		globalThis.ResizeObserver = class {
			observe(): void {}
			unobserve(): void {}
			disconnect = disconnect;
		} as unknown as typeof ResizeObserver;
		try {
			const view = timeline({ hourPx: 56 });
			expect(disconnect).not.toHaveBeenCalled();
			view.destroy();
			expect(disconnect).toHaveBeenCalledOnce();
		} finally {
			globalThis.ResizeObserver = real;
		}
	});

	/** A timeline put on noon at 40 % of its height, its height as the test says, and the resizes it hears. */
	function anchored() {
		const real = globalThis.ResizeObserver;
		let resized = () => {};
		globalThis.ResizeObserver = class {
			constructor(run: () => void) {
				resized = run;
			}
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		} as unknown as typeof ResizeObserver;
		const view = timeline({ hourPx: 56 });
		globalThis.ResizeObserver = real;
		document.body.appendChild(view.el);
		view.el.style.paddingBottom = "0px";
		let height = 600;
		Object.defineProperty(view.el, "clientHeight", { configurable: true, get: () => height });
		Object.defineProperty(view.canvas, "offsetHeight", { configurable: true, get: () => 24 * 56 });
		view.scrollTo(12 * 60, 0.4);
		expect(view.el.scrollTop).toBeGreaterThan(0);
		return { view, resize: (to: number) => ((height = to), resized()) };
	}

	it("keeps the minute it was put on in place while it settles its height", () => {
		const { view, resize } = anchored();
		const before = view.el.scrollTop;
		resize(300);
		expect(view.el.scrollTop).toBe(before + 0.4 * 300);
		view.destroy();
		view.el.remove();
	});

	it("stands still as the keyboard shrinks the view once a finger touched the screen anywhere", () => {
		const { view, resize } = anchored();
		const before = view.el.scrollTop;
		document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
		resize(300);
		expect(view.el.scrollTop).toBe(before);
		view.destroy();
		view.el.remove();
	});
});

describe("measuring once (block 3)", () => {
	/** A timeline at 100 on the screen, its canvas 8 below while it is not scrolled, scrolled as the test says. */
	function framed() {
		const view = timeline({ hourPx: 56 });
		let scrollTop = 0;
		Object.defineProperty(view.el, "scrollTop", { configurable: true, get: () => scrollTop, set: (v: number) => (scrollTop = v) });
		const viewRect = vi.fn(() => new DOMRect(0, 100, 300, 600));
		const canvasRect = vi.fn(() => new DOMRect(0, 108 - scrollTop, 300, 24 * 56));
		view.el.getBoundingClientRect = viewRect;
		view.canvas.getBoundingClientRect = canvasRect;
		return { view, viewRect, canvasRect, scroll: (by: number) => (scrollTop += by) };
	}
	const lineY = () => parseFloat(document.body.querySelector<HTMLElement>(".tc-drop")!.style.getPropertyValue("--tc-y"));

	it("measures itself once for a whole drop, following a scroll by scrollTop", () => {
		const { view, viewRect, canvasRect, scroll } = framed();
		view.showDrop({ start: 600, end: null });
		for (let i = 0; i < 20; i++) {
			scroll(7);
			view.minutesAt(300);
			view.showDrop({ start: 600 + 15 * (i % 3), end: null });
		}
		expect(viewRect).toHaveBeenCalledTimes(1);
		expect(canvasRect).toHaveBeenCalledTimes(1);
		const before = view.minutesAt(300);
		scroll(56);
		expect(view.minutesAt(300)).toBeCloseTo(before + 60);
		view.clearDrop();
		view.minutesAt(300);
		expect(canvasRect).toHaveBeenCalledTimes(2);
	});

	it("writes the drop's time only when its minute changes", () => {
		const { view } = framed();
		view.showDrop({ start: 600, end: null });
		const watch = new MutationObserver(() => undefined);
		watch.observe(document.body.querySelector(".tc-drop")!, { childList: true, characterData: true, subtree: true });
		for (let i = 0; i < 10; i++) view.showDrop({ start: 600, end: null });
		expect(watch.takeRecords()).toEqual([]);
		view.showDrop({ start: 615, end: null });
		expect(watch.takeRecords().length).toBeGreaterThan(0);
		watch.disconnect();
		view.clearDrop();
	});

	it("moves the drop line with the day under a still minute", () => {
		const { view, scroll } = framed();
		view.showDrop({ start: 600, end: null });
		const before = lineY();
		scroll(20);
		view.showDrop({ start: 600, end: null });
		expect(lineY()).toBe(before - 20);
		view.clearDrop();
	});

	it("sets the hour on the canvas, the only rule that reads it", () => {
		const view = timeline({ hourPx: 56 });
		expect(view.canvas.style.getPropertyValue("--tc-hour")).toBe("56px");
		expect(view.el.style.getPropertyValue("--tc-hour")).toBe("");
	});

	it("keeps the room as it is while a pinch zooms", () => {
		const view = timeline({ hourPx: 56 });
		const set = vi.spyOn(view.canvas.style, "setProperty");
		view.zoomTo(600, 300);
		view.zoomTo(600, 310);
		expect(set.mock.calls.filter(([name]) => name === "--tc-room-top").length).toBeLessThanOrEqual(1);
	});
});

describe("a stretched block while its new time is written (block 3)", () => {
	const task = (start: number, end: number): TaskItem => onDay({ key: { section: "now", index: 0, path: [], raw: "" }, text: "T", status: "todo", dueDate: null, slot: { date: "2026-10-30", start, end }, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: false }, "2026-10-30");
	const block = (view: Timeline) => view.itemsEl.querySelector<HTMLElement>(".tc-block")!;
	const length = (el: HTMLElement) => el.style.getPropertyValue("--tc-len");

	it("keeps a block stretched across a redraw until its new time comes", () => {
		const tasks = [task(600, 660)];
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, tasks);
		const unstretched = length(block(view));
		view.stretchTo(block(view), { start: 600, end: 720 }, "end");
		const stretched = length(block(view));
		expect(stretched).not.toBe(unstretched);
		const before = block(view);
		view.render();
		expect(block(view)).not.toBe(before);
		expect(block(view).classList.contains("is-resizing")).toBe(true);
		expect(length(block(view))).toBe(stretched);
		tasks[0] = task(600, 720);
		view.render();
		expect(block(view).classList.contains("is-resizing")).toBe(false);
		expect(length(block(view))).toBe(stretched);
	});

	it("puts the block back once its change is over, and leaves another task's stretch alone", () => {
		const tasks = [task(600, 660)];
		const view = timeline({ hourPx: 56 }, DayBoundary.MIDNIGHT, tasks);
		const unstretched = length(block(view));
		view.stretchTo(block(view), { start: 600, end: 720 }, "end");
		view.endStretch({ section: "now", index: 1, path: [], raw: "" });
		expect(block(view).classList.contains("is-resizing")).toBe(true);
		view.endStretch(tasks[0].key);
		expect(block(view).classList.contains("is-resizing")).toBe(false);
		expect(length(block(view))).toBe(unstretched);
	});
});

describe("a timeline beside another day's", () => {
	it("stands as the other stands: the same room around the hours and the same scroll", () => {
		const shown = timeline({ hourPx: 60 });
		const next = timeline({ hourPx: 60 });
		(shown as unknown as { setRoom(top: number, bottom: number): void }).setRoom(120, 40);
		Object.defineProperty(shown.el, "scrollTop", { value: 300, writable: true });
		next.alignWith(shown);
		expect(next.canvas.style.getPropertyValue("--tc-room-top")).toBe("120px");
		expect(next.canvas.style.getPropertyValue("--tc-room-bottom")).toBe("40px");
		expect(next.el.scrollTop).toBe(300);
	});

	it("keeps its scroll when its day ends sooner, taking the room under the hours it lacks", () => {
		const view = timeline({ hourPx: 60 });
		let top = 0;
		Object.defineProperty(view.el, "scrollTop", { get: () => top, set: (value: number) => (top = Math.min(value, view.canvas.style.getPropertyValue("--tc-room-bottom") === "50px" ? 400 : 350)) });
		view.holdScroll(400);
		expect(view.canvas.style.getPropertyValue("--tc-room-bottom")).toBe("50px");
		expect(view.el.scrollTop).toBe(400);
	});
});

describe("an event at the day's edges", () => {
	const event = (start: Date, end: Date): CalendarEvent => ({ id: "e", title: "E", start, end, allDay: false, calendar: "Work", color: "#0A84FF", source: "google", account: null, calendarId: null });

	function spans(boundary: DayBoundary, events: CalendarEvent[]): { start: number; end: number }[] {
		const view = new Timeline(document.createElement("div"), withShownSpan({
			theme: () => "dark",
			date: () => "2026-10-30",
			today: () => "2026-10-31",
			boundary: () => boundary,
			hourPx: () => 56,
			tasks: () => [],
			events: () => events,
			now: () => new Date(2026, 9, 31, 12, 0),
		}));
		view.render();
		return (view as unknown as { events: { start: number; end: number }[] }).events.map(({ start, end }) => ({ start, end }));
	}

	it("is cut where the day begins and ends", () => {
		expect(spans(DayBoundary.MIDNIGHT, [event(new Date(2026, 9, 29, 22), new Date(2026, 9, 31, 2))])).toEqual([{ start: 0, end: 1440 }]);
	});

	it("is cut at the edges of a day that starts at four", () => {
		expect(spans(new DayBoundary(4), [event(new Date(2026, 9, 30, 3), new Date(2026, 9, 31, 5))])).toEqual([{ start: 0, end: 1440 }]);
		expect(spans(new DayBoundary(4), [event(new Date(2026, 9, 31, 1), new Date(2026, 9, 31, 3))])).toEqual([{ start: 1260, end: 1380 }]);
	});

	it("stands as it is inside the day", () => {
		expect(spans(DayBoundary.MIDNIGHT, [event(new Date(2026, 9, 30, 9), new Date(2026, 9, 30, 10, 30))])).toEqual([{ start: 540, end: 630 }]);
	});
});
