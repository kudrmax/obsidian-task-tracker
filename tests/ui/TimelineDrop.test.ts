// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DayBoundary, type TaskItem } from "../../src/application/contracts";
import type { Timeline } from "../../src/ui/Timeline";
import type { TaskDragPayload } from "../../src/ui/drag/DropTarget";
import { TimelineDrop } from "../../src/ui/drag/TimelineDrop";

const DAY = "2026-11-05";

/** A timeline a minute a pixel tall from the top of the window. */
function fakeTimeline() {
	const shown: { start: number; end: number | null }[] = [];
	const timeline = {
		el: document.createElement("div"),
		minutesAt: (y: number) => y,
		viewBox: () => new DOMRect(0, -100, 400, 2000),
		showDrop: (span: { start: number; end: number | null }) => shown.push(span),
		clearDrop: () => {},
		landing: () => null,
		slotAt: (start: number, end: number | null) => DayBoundary.MIDNIGHT.slotAt(DAY, start, end),
	};
	return { timeline: timeline as unknown as Timeline, shown };
}

const drag = (durationMin: number | null): TaskDragPayload => ({ item: {} as TaskItem, from: "timeline", durationMin, grabPx: 0 });

describe("the timeline as a place to drop", () => {
	const target = (step = 5) => {
		const fake = fakeTimeline();
		return { drop: new TimelineDrop(fake.timeline, { step: () => step }), shown: fake.shown };
	};

	it("keeps a task with a duration within the day, as long as it was", () => {
		const { drop, shown } = target();
		drop.preview(0, 1400, drag(60));
		expect(shown[shown.length - 1]).toEqual({ start: 1380, end: 1440 });
		expect(drop.slot).toEqual({ date: DAY, start: 1380, end: 1440 });
	});

	it("starts a task without a duration five minutes before the day ends at the latest", () => {
		const { drop } = target();
		drop.preview(0, 1439, drag(null));
		expect(drop.slot).toEqual({ date: DAY, start: 1435, end: null });
		drop.previewNew(1500);
		expect(drop.slot).toEqual({ date: DAY, start: 1435, end: null });
	});

	it("starts no earlier than the day", () => {
		const { drop } = target();
		drop.preview(0, -40, drag(30));
		expect(drop.slot).toEqual({ date: DAY, start: 0, end: 30 });
	});

	it("snaps the start to the step", () => {
		const { drop } = target(15);
		drop.preview(0, 607, drag(null));
		expect(drop.slot).toEqual({ date: DAY, start: 600, end: null });
		drop.preview(0, 1433, drag(60));
		expect(drop.slot).toEqual({ date: DAY, start: 1380, end: 1440 });
	});
});
