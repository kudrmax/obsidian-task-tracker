import { describe, expect, it } from "vitest";
import { durationParts, followNow, gridAt, itemBox, layoutColumns, scrollPlace, stackTasks, stretchedSpan, timeParts } from "../../src/ui/timelineLayout";

describe("layoutColumns", () => {
	it("gives a lone event the whole width", () => {
		expect(layoutColumns([{ start: 540, end: 600 }])).toEqual([{ col: 0, cols: 1 }]);
	});

	it("splits two overlapping events into two columns, in order of start", () => {
		expect(layoutColumns([{ start: 900, end: 990 }, { start: 930, end: 960 }])).toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }]);
	});

	it("keeps a chain in one cluster: the third overlaps the second but not the first", () => {
		const boxes = layoutColumns([{ start: 600, end: 660 }, { start: 630, end: 720 }, { start: 690, end: 750 }]);
		expect(boxes.map((b) => b.cols)).toEqual([2, 2, 2]);
		expect(boxes.map((b) => b.col)).toEqual([0, 1, 0]);
	});

	it("starts a new cluster when nothing overlaps any more, and touching ends do not overlap", () => {
		const boxes = layoutColumns([{ start: 600, end: 660 }, { start: 660, end: 720 }, { start: 700, end: 760 }]);
		expect(boxes).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 2 }, { col: 1, cols: 2 }]);
	});

	it("answers in the order given, whatever the order of starts", () => {
		expect(layoutColumns([{ start: 930, end: 960 }, { start: 900, end: 990 }])).toEqual([{ col: 1, cols: 2 }, { col: 0, cols: 2 }]);
	});
});

describe("itemBox", () => {
	it("lays a block one pixel under its start and two pixels short of its end", () => {
		expect(itemBox(660, 720, 56)).toEqual({ top: 617, height: 54, tiny: false });
		expect(itemBox(540, 555, 56)).toEqual({ top: 505, height: 12, tiny: true });
	});

	it("calls a block tiny under 24 px", () => {
		expect(itemBox(0, 30, 56).tiny).toBe(false);
		expect(itemBox(0, 30, 28).tiny).toBe(true);
	});
});

describe("stackTasks", () => {
	const H = 56;
	const CARD = { height: 40, gap: 4 };
	const at = (h: number, m = 0) => h * 60 + m;

	it("puts a task at a time on its hour line, 40 px whatever the zoom", () => {
		expect(stackTasks([{ start: at(14), end: null }], [], H, CARD)).toEqual([{ top: 785, height: 40, left: 1, overlay: false, stacked: false, hiddenDuration: false }]);
		expect(stackTasks([{ start: at(14), end: null }], [], 28, CARD)[0]).toMatchObject({ top: 393, height: 40 });
	});

	it("gives a task with a duration its length, two pixels short, but never under 40", () => {
		expect(stackTasks([{ start: at(11), end: at(12) }], [], H, CARD)[0]).toMatchObject({ top: 617, height: 54, hiddenDuration: false });
		expect(stackTasks([{ start: at(11), end: at(12) }], [], 28, CARD)[0]).toMatchObject({ top: 309, height: 40, hiddenDuration: true });
	});

	it("stacks tasks of one time under each other 4 px apart, and every task of the stack shows its start", () => {
		const boxes = stackTasks(
			[
				{ start: at(17), end: null },
				{ start: at(17), end: null },
				{ start: at(17, 5), end: null },
				{ start: at(17, 10), end: null },
				{ start: at(14), end: null },
			],
			[],
			H,
			CARD,
		);
		expect(boxes.map((b) => b.top)).toEqual([953, 997, 1041, 1085, 785]);
		expect(boxes.map((b) => b.stacked)).toEqual([true, true, true, true, false]);
	});

	it("keeps the file order among tasks of one start, whatever order they come in", () => {
		const boxes = stackTasks([{ start: at(17, 5), end: null }, { start: at(17), end: null }], [], H, CARD);
		expect(boxes.map((b) => b.top)).toEqual([997, 953]);
	});

	it("ends a pushed long task at its own end, never under 40", () => {
		const boxes = stackTasks([{ start: at(14), end: null }, { start: at(14, 30), end: at(16, 30) }], [], H, CARD);
		expect(boxes[1]).toMatchObject({ top: 829, height: 94, stacked: true });
		expect(boxes[0].stacked).toBe(true);
	});

	it("lays a task that starts in a long one's body over it, 18 px in and ringed; nesting adds up", () => {
		const boxes = stackTasks(
			[
				{ start: at(14), end: at(18) },
				{ start: at(15), end: at(17) },
				{ start: at(16), end: null },
			],
			[],
			H,
			CARD,
		);
		expect(boxes.map((b) => b.left)).toEqual([1, 19, 37]);
		expect(boxes.map((b) => b.overlay)).toEqual([false, true, true]);
		expect(boxes.map((b) => b.top)).toEqual([785, 841, 897]);
	});

	it("leaves a long task's head alone: a task starting under it is pushed below the head", () => {
		const boxes = stackTasks([{ start: at(14), end: at(16) }, { start: at(14, 15), end: null }], [], H, CARD);
		expect(boxes[1]).toMatchObject({ top: 829, left: 19, overlay: true, stacked: true });
	});

	it("lays a task over an event 18 px in, ringed, without moving the event", () => {
		const boxes = stackTasks([{ start: at(15, 30), end: null }, { start: at(18), end: null }], [{ start: at(15), end: at(16, 30) }], H, CARD);
		expect(boxes[0]).toMatchObject({ left: 18, overlay: true });
		expect(boxes[1]).toMatchObject({ left: 1, overlay: false });
	});

	it("takes the card's height and gap from the settings", () => {
		const boxes = stackTasks([{ start: at(17), end: null }, { start: at(17), end: null }, { start: at(17, 30), end: at(19) }], [], H, { height: 35, gap: 2 });
		expect(boxes.map((b) => b.top)).toEqual([953, 990, 1027]);
		expect(boxes.map((b) => b.height)).toEqual([35, 35, 36]);
	});
});

describe("durationParts and timeParts", () => {
	it("writes a duration as a number over its unit", () => {
		expect(durationParts(45)).toEqual(["45", "MIN"]);
		expect(durationParts(60)).toEqual(["1", "H"]);
		expect(durationParts(90)).toEqual(["1:30", "H"]);
		expect(durationParts(120)).toEqual(["2", "H"]);
	});

	it("writes a start as the hours over the minutes", () => {
		expect(timeParts(17 * 60)).toEqual(["17", "00"]);
		expect(timeParts(9 * 60 + 5)).toEqual(["9", "05"]);
	});
});

describe("stretchedSpan", () => {
	it("keeps a duration taller than a card", () => {
		expect(stretchedSpan({ start: 840, end: null }, { start: 840, end: 930 }, "end", 56, 40)).toEqual({ start: 840, end: 930 });
	});

	it("drops a duration of 40 px or less: 45 minutes at 56 px an hour, 15 at 112", () => {
		expect(stretchedSpan({ start: 840, end: 960 }, { start: 840, end: 885 }, "end", 56, 40)).toEqual({ start: 840, end: null });
		expect(stretchedSpan({ start: 840, end: null }, { start: 840, end: 870 }, "end", 112, 40)).toEqual({ start: 840, end: 870 });
		expect(stretchedSpan({ start: 840, end: null }, { start: 840, end: 855 }, "end", 112, 40)).toEqual({ start: 840, end: null });
	});

	it("measures against the card's height from the settings", () => {
		expect(stretchedSpan({ start: 840, end: null }, { start: 840, end: 880 }, "end", 56, 35)).toEqual({ start: 840, end: 880 });
		expect(stretchedSpan({ start: 840, end: null }, { start: 840, end: 880 }, "end", 56, 40)).toEqual({ start: 840, end: null });
	});

	it("makes the old start the end when the start dot of a task without a duration is pulled up", () => {
		expect(stretchedSpan({ start: 840, end: null }, { start: 750, end: 840 }, "start", 56, 40)).toEqual({ start: 750, end: 840 });
		expect(stretchedSpan({ start: 840, end: null }, { start: 825, end: 840 }, "start", 56, 40)).toEqual({ start: 840, end: null });
	});
});

describe("gridAt", () => {
	it("draws only the hours up to the base zoom: half an hour there is too close for a label", () => {
		expect(gridAt(28)).toEqual({ labels: 60, lines: 60 });
		expect(gridAt(56)).toEqual({ labels: 60, lines: 60 });
	});

	it("labels the half hours once they have room, then the quarters, then every five minutes", () => {
		expect(gridAt(80).labels).toBe(30);
		expect(gridAt(112).labels).toBe(30);
		expect(gridAt(160).labels).toBe(15);
		expect(gridAt(224).labels).toBe(15);
		expect(gridAt(480).labels).toBe(5);
	});

	it("adds bare lines every five minutes once those stand apart, between the labelled ones", () => {
		expect(gridAt(112).lines).toBe(30);
		expect(gridAt(160).lines).toBe(15);
		expect(gridAt(192)).toEqual({ labels: 15, lines: 5 });
		expect(gridAt(224)).toEqual({ labels: 15, lines: 5 });
	});
});

describe("scrollPlace", () => {
	const day = { canvasTop: 7, canvasHeight: 24 * 56, visible: 600 };

	it("scrolls a minute in the middle of the day to the middle of the visible height, with no room beyond the day", () => {
		expect(scrollPlace({ ...day, y: 12 * 56 }, 0.5)).toEqual({ roomTop: 0, roomBottom: 0, scrollTop: 7 + 12 * 56 - 300 });
	});

	it("leaves room under the day's last hour for a minute near it: 02:30 of a day that starts at 5 stands in the middle", () => {
		const y = 21.5 * 56;
		const place = scrollPlace({ ...day, y }, 0.5);
		expect(place.roomTop).toBe(0);
		expect(place.roomBottom).toBe(300 - (24 * 56 - y));
		expect(place.scrollTop).toBe(7 + y - 300);
	});

	it("leaves room over the day's first hour for a minute near it, and the timeline stays at its top", () => {
		expect(scrollPlace({ ...day, y: 56 }, 0.5)).toEqual({ roomTop: 300 - 7 - 56, roomBottom: 0, scrollTop: 0 });
	});

	it("puts the hour of another day at the very top", () => {
		expect(scrollPlace({ ...day, y: 9 * 56 }, 0)).toEqual({ roomTop: 0, roomBottom: 0, scrollTop: 7 + 9 * 56 });
	});

	it("leaves no room and no scroll when the whole day fits", () => {
		const whole = { canvasTop: 7, canvasHeight: 24 * 24, visible: 7 + 24 * 24 };
		expect(scrollPlace({ ...whole, y: 21.5 * 24 }, 0.5)).toEqual({ roomTop: 0, roomBottom: 0, scrollTop: 0 });
		expect(scrollPlace({ ...whole, y: 24 }, 0.5)).toEqual({ roomTop: 0, roomBottom: 0, scrollTop: 0 });
	});
});

describe("followNow", () => {
	it("leaves a span that starts at now or later alone", () => {
		expect(followNow({ start: 720, end: null }, 720)).toEqual({ start: 720, end: null });
		expect(followNow({ start: 780, end: 840 }, 720)).toEqual({ start: 780, end: 840 });
	});

	it("starts a passed span at now, its duration kept", () => {
		expect(followNow({ start: 600, end: null }, 720)).toEqual({ start: 720, end: null });
		expect(followNow({ start: 600, end: 660 }, 720)).toEqual({ start: 720, end: 780 });
	});
});
