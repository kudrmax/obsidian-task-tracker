// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../src/application/contracts";
import type { TaskItem } from "../../src/application/contracts";
import { Timeline } from "../../src/ui/Timeline";
import { DEFAULT_SETTINGS } from "../../src/settings";

/** One card and one gap: how far down a stack the next card stands. */
const STACK_STEP = DEFAULT_SETTINGS.cardHeight + DEFAULT_SETTINGS.cardGap;

function timeline(zoom: { hourPx: number }, boundary = DayBoundary.MIDNIGHT, tasks: TaskItem[] = []): Timeline {
	const view = new Timeline(document.createElement("div"), {
		theme: () => "dark",
		date: () => "2026-10-30",
		today: () => "2026-10-31",
		boundary: () => boundary,
		hourPx: () => zoom.hourPx,
		tasks: () => tasks,
		events: () => [],
		now: () => new Date(2026, 9, 31, 12, 0),
	});
	view.render();
	return view;
}

function minorLabels(view: Timeline): string[] {
	return [...view.canvas.querySelectorAll(".tc-hour-label.is-minor")].map((label) => label.textContent ?? "");
}

describe("a day that starts at 4", () => {
	const late: TaskItem = { key: { section: "now", index: 0, path: [], raw: "" }, text: "Late", status: "todo", dueDate: null, slot: { date: "2026-10-31", start: 60, end: 120 }, priority: null, subtasks: [], progress: null, parentText: null, group: null };

	it("labels the hours from 4 round to 4 the next morning", () => {
		const labels = [...timeline({ hourPx: 56 }, new DayBoundary(4)).canvas.querySelectorAll(".tc-hour-label")].map((l) => l.textContent);
		expect(labels.slice(0, 2)).toEqual(["4", "5"]);
		expect(labels.slice(-5)).toEqual(["0", "1", "2", "3", "4"]);
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

describe("task cards", () => {
	const task = (index: number, start: number, end: number | null): TaskItem => ({ key: { section: "now", index, path: [], raw: "" }, text: `T${index}`, status: "todo", dueDate: null, slot: { date: "2026-10-30", start, end }, priority: null, subtasks: [], progress: null, parentText: null, group: null });

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

describe("tasks the now line has passed", () => {
	const hourPx = 56;
	const task = (index: number, start: number, end: number | null, status: TaskItem["status"] = "todo"): TaskItem => ({ key: { section: "now", index, path: [], raw: "" }, text: `T${index}`, status, dueDate: null, slot: { date: "2026-10-31", start, end }, priority: null, subtasks: [], progress: null, parentText: null, group: null });

	function onToday(tasks: TaskItem[], date = "2026-10-31"): HTMLElement[] {
		const view = new Timeline(document.createElement("div"), {
			theme: () => "dark",
			date: () => date,
			today: () => "2026-10-31",
			boundary: () => DayBoundary.MIDNIGHT,
			hourPx: () => hourPx,
			tasks: () => tasks,
			events: () => [],
			now: () => new Date(2026, 9, 31, 12, 0),
		});
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
