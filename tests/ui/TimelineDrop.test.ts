// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { type DaySpan, DayBoundary, type DropOrigin, type TaskItem } from "../../src/application/contracts";
import type { Timeline } from "../../src/ui/Timeline";
import type { TaskDragPayload } from "../../src/ui/drag/DropTarget";
import { TimelineDrop } from "../../src/ui/drag/TimelineDrop";

const DAY = "2026-11-05";

/** A timeline a minute a pixel tall from the top of the window. */
function fakeTimeline() {
	const shown: DaySpan[] = [];
	const timeline = {
		el: document.createElement("div"),
		minutesAt: (y: number) => y,
		viewBox: () => new DOMRect(0, -100, 400, 2000),
		showDrop: (span: DaySpan) => shown.push(span),
		clearDrop: () => {},
		landing: () => null,
	};
	return { timeline: timeline as unknown as Timeline, shown };
}

const card = { durationMin: 60 } as TaskItem;
const drag = (from: TaskDragPayload["from"]): TaskDragPayload => ({ item: card, from, grabPx: 0 });

describe("the timeline as a place to drop", () => {
	const target = (step = 5) => {
		const fake = fakeTimeline();
		const asked: [TaskItem | null, DropOrigin, number][] = [];
		const drop = new TimelineDrop(fake.timeline, {
			snap: (minute) => Math.min(1440, Math.max(0, Math.round(minute / step) * step)),
			span: (item, from, start) => {
				asked.push([item, from, start]);
				return { start: start + 1, end: null };
			},
			newSlot: (start) => DayBoundary.MIDNIGHT.slotAt(DAY, start, null),
		});
		return { drop, shown: fake.shown, asked };
	};

	it("shows the span the service places the card at, and drops the snapped start", () => {
		const { drop, shown, asked } = target(15);
		drop.preview(0, 607, drag("timeline"));
		expect(asked).toEqual([[card, "timeline", 600]]);
		expect(shown).toEqual([{ start: 601, end: null }]);
		expect(drop.drop()).toEqual({ kind: "time", start: 600 });
	});

	it("asks for a list card as from its list", () => {
		const { drop, asked } = target();
		drop.preview(0, 1439, drag("day"));
		expect(asked).toEqual([[card, "day", 1440]]);
	});

	it("a long tap asks for a new task, and its slot is the service's", () => {
		const { drop, asked } = target();
		drop.previewNew(702);
		expect(asked).toEqual([[null, "new", 700]]);
		expect(drop.slot).toEqual({ date: DAY, start: 700, end: null });
	});
});
