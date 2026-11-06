import { describe, expect, it } from "vitest";
import { TimelineSpans } from "../../core/application/TimelineSpans";
import { DayBoundary } from "../../core/domain/DayBoundary";

const T = "2026-10-31";
const NOON = new Date(2026, 9, 31, 12, 0);
const spans = new TimelineSpans(DayBoundary.MIDNIGHT, NOON);
const task = (start: number, end: number | null, open = true) => ({ slot: { date: T, start, end }, open });
/** 40 px of a card and 2 px of gap at 56 px an hour. */
const MIN = (42 / 56) * 60;

describe("where a card stands", () => {
	it("stands on its time at the very minute or later", () => {
		expect(spans.shown(task(720, null), T)).toEqual({ start: 720, end: null });
		expect(spans.shown(task(780, 840), T)).toEqual({ start: 780, end: 840 });
	});

	it("rides the now line once open past its start, its duration kept", () => {
		expect(spans.shown(task(600, null), T)).toEqual({ start: 720, end: null });
		expect(spans.shown(task(600, 660), T)).toEqual({ start: 720, end: 780 });
	});

	it("stays on its time when closed, or on another day than today", () => {
		expect(spans.shown(task(600, 660, false), T)).toEqual({ start: 600, end: 660 });
		expect(spans.shown({ slot: { date: "2026-11-02", start: 600, end: null }, open: true }, "2026-11-02")).toEqual({ start: 600, end: null });
	});

	it("reads now by the day's boundary", () => {
		const atFour = new TimelineSpans(new DayBoundary(4), NOON);
		expect(atFour.shown({ slot: { date: T, start: 300, end: null }, open: true }, T)).toEqual({ start: 480, end: null });
	});
});

describe("a dot held", () => {
	it("moves the end no earlier than the start nor past the day", () => {
		expect(spans.stretched(task(840, 900), T, "end", 960)).toEqual({ start: 840, end: 960 });
		expect(spans.stretched(task(840, 900), T, "end", 800)).toEqual({ start: 840, end: 840 });
		expect(spans.stretched(task(840, 900), T, "end", 1500)).toEqual({ start: 840, end: 1440 });
	});

	it("moves the start no earlier than the day nor past the end", () => {
		expect(spans.stretched(task(840, 900), T, "start", 780)).toEqual({ start: 780, end: 900 });
		expect(spans.stretched(task(840, 900), T, "start", 960)).toEqual({ start: 900, end: 900 });
		expect(spans.stretched(task(840, 900), T, "start", -30)).toEqual({ start: 0, end: 900 });
	});

	it("pulls the start of a task without a duration earlier only, its old start becoming the end", () => {
		expect(spans.stretched(task(840, null), T, "start", 750)).toEqual({ start: 750, end: 840 });
		expect(spans.stretched(task(840, null), T, "start", 900)).toEqual({ start: 840, end: 840 });
		expect(spans.stretched(task(840, null), T, "end", 930)).toEqual({ start: 840, end: 930 });
	});

	it("stretches a card riding the now line from where it is shown", () => {
		expect(spans.stretched(task(600, 660), T, "end", 840)).toEqual({ start: 720, end: 840 });
		expect(spans.stretched(task(600, 660), T, "start", 690)).toEqual({ start: 690, end: 780 });
	});
});

describe("a dot let go", () => {
	it("writes the new span when it is taller than a card", () => {
		expect(spans.resized(task(840, null), T, "end", 930, MIN)).toEqual({ date: T, start: 840, end: 930 });
		expect(spans.resized(task(840, 900), T, "start", 780, MIN)).toEqual({ date: T, start: 780, end: 900 });
	});

	it("takes the duration away from a span no taller than a card, the task standing at its start", () => {
		expect(spans.resized(task(840, 960), T, "end", 885, MIN)).toEqual({ date: T, start: 840, end: null });
		expect(spans.resized(task(840, 960), T, "start", 930, MIN)).toEqual({ date: T, start: 930, end: null });
		expect(spans.resized(task(840, null), T, "end", 880, (37 / 56) * 60)).toEqual({ date: T, start: 840, end: 880 });
		expect(spans.resized(task(840, null), T, "end", 880, (40 / 56) * 60 + 5)).toBeNull();
	});

	it("measures against the card's minutes: 45 at 56 px an hour, 22.5 at 112", () => {
		const atDouble = (42 / 112) * 60;
		expect(spans.resized(task(840, null), T, "end", 870, atDouble)).toEqual({ date: T, start: 840, end: 870 });
		expect(spans.resized(task(840, 960), T, "end", 855, atDouble)).toEqual({ date: T, start: 840, end: null });
	});

	it("keeps the start of a task without a duration whose start dot came to nothing", () => {
		expect(spans.resized(task(840, null), T, "start", 750, MIN)).toEqual({ date: T, start: 750, end: 840 });
		expect(spans.resized(task(840, null), T, "start", 825, MIN)).toBeNull();
	});

	it("writes nothing when the span stays as shown", () => {
		expect(spans.resized(task(840, 960), T, "end", 960, MIN)).toBeNull();
		expect(spans.resized(task(840, 960), T, "start", 840, MIN)).toBeNull();
	});

	it("clamps the span to the day", () => {
		expect(spans.resized(task(1380, 1410), T, "end", 1500, MIN)).toEqual({ date: T, start: 1380, end: 1440 });
		expect(spans.resized(task(780, 840), T, "start", -60, MIN)).toEqual({ date: T, start: 0, end: 840 });
	});

	it("writes a slot past midnight on the clock's next date when the day starts later", () => {
		const atFour = new TimelineSpans(new DayBoundary(4), new Date(2026, 9, 30, 12));
		expect(atFour.resized({ slot: { date: "2026-10-31", start: 60, end: 120 }, open: true }, "2026-10-30", "end", 1380, MIN)).toEqual({ date: "2026-10-31", start: 60, end: 180 });
	});

	describe("on a task riding the now line", () => {
		it("keeps the file's start when the bottom dot stretches it: only how long it lasts changes", () => {
			expect(spans.resized(task(600, 660), T, "end", 840, MIN)).toEqual({ date: T, start: 600, end: 720 });
			expect(spans.resized(task(600, null), T, "end", 780, MIN)).toEqual({ date: T, start: 600, end: 660 });
		});

		it("keeps the file's start when the bottom dot takes the duration away", () => {
			expect(spans.resized(task(600, 660), T, "end", 735, MIN)).toEqual({ date: T, start: 600, end: null });
		});

		it("writes nothing when the bottom dot lets go where the card ends", () => {
			expect(spans.resized(task(600, 660), T, "end", 780, MIN)).toBeNull();
			expect(spans.resized(task(600, null), T, "end", 720, MIN)).toBeNull();
		});

		it("writes the top dot's minute as a new start, the end staying where the card shows it", () => {
			expect(spans.resized(task(600, 660), T, "start", 690, MIN)).toEqual({ date: T, start: 690, end: 780 });
			expect(spans.resized(task(600, 660), T, "start", 750, MIN)).toEqual({ date: T, start: 750, end: null });
			expect(spans.resized(task(600, null), T, "start", 630, MIN)).toEqual({ date: T, start: 630, end: 720 });
		});

		it("writes nothing when the top dot lets go where the card starts", () => {
			expect(spans.resized(task(600, 660), T, "start", 720, MIN)).toBeNull();
			expect(spans.resized(task(600, null), T, "start", 720, MIN)).toBeNull();
		});
	});
});
