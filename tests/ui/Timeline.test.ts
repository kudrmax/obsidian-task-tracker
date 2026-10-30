// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DayBoundary } from "../../src/application/contracts";
import type { TaskItem } from "../../src/application/contracts";
import { Timeline } from "../../src/ui/Timeline";

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
	const late: TaskItem = { key: { section: "now", index: 0, raw: "" }, text: "Late", status: "todo", dueDate: null, slot: { date: "2026-10-31", start: 60, end: 120 } };

	it("labels the hours from 4 round to 3", () => {
		const labels = [...timeline({ hourPx: 56 }, new DayBoundary(4)).canvas.querySelectorAll(".tc-hour-label")].map((l) => l.textContent);
		expect(labels.slice(0, 2)).toEqual(["4", "5"]);
		expect(labels.slice(-4)).toEqual(["0", "1", "2", "3"]);
	});

	it("places a slot after midnight below the evening", () => {
		const view = timeline({ hourPx: 56 }, new DayBoundary(4), [late]);
		const block = view.itemsEl.querySelector<HTMLElement>(".tc-block")!;
		expect(block.style.getPropertyValue("--tc-y")).toBe(`${21 * 56}px`);
		expect(view.slotAt(21 * 60, 22 * 60)).toEqual(late.slot);
	});
});

describe("Timeline grid", () => {
	it("labels only the hours at the base zoom", () => {
		const view = timeline({ hourPx: 56 });
		expect(view.canvas.querySelectorAll(".tc-hour-label")).toHaveLength(24);
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
