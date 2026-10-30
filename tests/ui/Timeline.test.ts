// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Timeline } from "../../src/ui/Timeline";

function timeline(zoom: { hourPx: number }): Timeline {
	const view = new Timeline(document.createElement("div"), {
		theme: () => "dark",
		date: () => "2026-10-30",
		today: () => "2026-10-31",
		hourPx: () => zoom.hourPx,
		tasks: () => [],
		events: () => [],
		now: () => new Date(2026, 9, 31, 12, 0),
	});
	view.render();
	return view;
}

function minorLabels(view: Timeline): string[] {
	return [...view.canvas.querySelectorAll(".tc-hour-label.is-minor")].map((label) => label.textContent ?? "");
}

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
