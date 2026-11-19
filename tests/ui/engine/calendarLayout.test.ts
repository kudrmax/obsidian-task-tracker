import { describe, expect, it } from "vitest";
import { DESIGN, LAYOUT } from "../../../obsidian/ui/design";
import { EdgeHeading } from "../../../obsidian/ui/engine/drag/edgeHeading";
import { edgeMinute, leastLength } from "../../../obsidian/ui/engine/gestures/Resize";
import { hourOf, roomMeasure, zoomAfterPinch } from "../../../obsidian/ui/engine/gestures/Zoom";
import { CARD, layEvents, layTasks, opening, stackEnd } from "../../../obsidian/ui/engine/layout/calendar";
import { BASE_SCALE, TimeScale } from "../../../obsidian/ui/engine/layout/timeScale";
import type { Block } from "../../../obsidian/ui/engine/port";

const y = (minute: number) => BASE_SCALE.y(minute);

/** The design's «Задачи на таймлайне»: the stack, read as the boards draw it. */
describe("the calendar's tasks", () => {
	it("a task without a length is a card's height at its time; with one, its length's height (F91)", () => {
		const [bare, long] = layTasks([{ start: 60, length: null }, { start: 300, length: 120 }], [], BASE_SCALE);
		expect(bare).toMatchObject({ top: y(60) + DESIGN.itemInset, height: CARD.height, stacked: false });
		expect(long).toMatchObject({ top: y(300) + DESIGN.itemInset, height: y(420) - DESIGN.itemInset - (y(300) + DESIGN.itemInset), stacked: false });
	});
	it("tasks standing close stack, one gap under the head before, all of the stack writing their start (F92)", () => {
		const boxes = layTasks([{ start: 60, length: 30 }, { start: 65, length: null }, { start: 600, length: null }], [], BASE_SCALE);
		expect(boxes[1].top).toBe(boxes[0].top + CARD.height + CARD.gap);
		expect(boxes.map((b) => b.stacked)).toEqual([true, true, false]);
		expect(boxes.map((b) => b.rank)).toEqual([0, 1, 2]);
	});
	it("a short length is written on the card (F93)", () => {
		const [short, tall] = layTasks([{ start: 60, length: 30 }, { start: 300, length: 90 }], [], BASE_SCALE);
		expect(short.shortLength).toBe(true);
		expect(tall.shortLength).toBe(false);
	});
	it("a task starting on a long task's body lies over it, further in", () => {
		const [long, over] = layTasks([{ start: 120, length: 120 }, { start: 180, length: null }], [], BASE_SCALE);
		expect(over.left).toBe(long.left + LAYOUT.overlayInset);
		expect(over.stacked).toBe(false);
	});
	it("a task over an event lies right of it; events overlapping lie shifted right, the later higher (F87)", () => {
		const events = layEvents([{ start: 420, end: 510 }, { start: 450, end: 480 }], BASE_SCALE);
		expect(events.map((e) => [e.left, e.level, e.layer])).toEqual([
			[DESIGN.itemInset, 0, 0],
			[LAYOUT.overlayInset, 1, 1],
		]);
		const [task] = layTasks([{ start: 460, length: null }], events, BASE_SCALE);
		expect(task.left).toBe(2 * LAYOUT.overlayInset);
	});
	it("a stack past midnight lengthens the day", () => {
		const boxes = layTasks([{ start: 1430, length: null }, { start: 1430, length: null }], [], BASE_SCALE);
		expect(stackEnd(boxes)).toBeGreaterThan(y(1440));
	});
});

/** The review of E3: a dot's gesture is only an edge and a minute; the port says the rest. */
describe("a dot's gesture", () => {
	const block: Block = { id: "a", start: 600, length: null, clock: "15:00", endClock: null, startParts: ["15", "00"], lengthParts: null, step: null };
	it("starts from where the dot stands: the top one at the start, the bottom one at the end (a task without a length: its start)", () => {
		expect(edgeMinute(block, "start")).toBe(600);
		expect(edgeMinute(block, "end")).toBe(600);
		expect(edgeMinute({ ...block, length: 45 }, "end")).toBe(645);
	});
	it("keeps no length at a card and its gap or less (the plugin's 35 + 2 px)", () => {
		expect(leastLength(BASE_SCALE)).toBeCloseTo((37 / 56) * 60);
		expect(leastLength(new TimeScale(112))).toBeCloseTo((37 / 112) * 60);
	});
});

describe("the room the calendar measures (review 6)", () => {
	it("what a person sees is the room less its foot; the whole day fits in it under the label's room, whatever the day's height now", () => {
		expect(roomMeasure(700, 100)).toEqual({ visible: 600, fit: (600 - 2 * DESIGN.labelLift) / 24 });
	});
	it("today opens with the now line at half of what is seen, with room over the first hour or under the last near them (the plugin's scrollPlace)", () => {
		expect(opening(600, 1344, 600)).toEqual({ above: 300, roomTop: 0, roomBottom: 0 });
		expect(opening(10, 1344, 600)).toMatchObject({ above: 300, roomTop: 300 - DESIGN.labelLift - 10, roomBottom: 0 });
		expect(opening(1340, 1344, 600).roomBottom).toBe(600 - 300 - (1344 + DESIGN.labelLift - 1340));
		expect(opening(100, 500, 600)).toEqual({ above: DESIGN.labelLift + 100, roomTop: 0, roomBottom: 0 });
	});
});

/** The review of E3: auto-scroll waits for a pointer heading into an edge (the plugin's AutoScroll). */
describe("heading into an edge", () => {
	it("a card lifted near the edge and held there heads nowhere", () => {
		const h = new EdgeHeading();
		expect(h.feed("list:day", 790, 1)).toBeNull();
		expect(h.feed("list:day", 790, 1)).toBeNull();
	});
	it("coming towards the bottom edge it heads into it; held still it keeps heading; turning back it stops", () => {
		const h = new EdgeHeading();
		h.feed("list:day", 600, 0);
		expect(h.feed("list:day", 780, 1)).toBe("list:day:1");
		expect(h.feed("list:day", 780, 1)).toBe("list:day:1");
		expect(h.feed("list:day", 770, 1)).toBeNull();
	});
	it("coming into another room across its top edge moving down heads into nothing", () => {
		const h = new EdgeHeading();
		h.feed("list:soon", 780, 1);
		expect(h.feed("calendar-room:", 120, -1)).toBeNull();
		expect(h.feed("calendar-room:", 140, -1)).toBeNull();
	});
});

describe("the zoom", () => {
	it("let go at or under the whole day, it is the whole day; else where it was let go (F97)", () => {
		expect(zoomAfterPinch(30, 30.2)).toBe("wholeDay");
		expect(zoomAfterPinch(80, 30)).toBe(80);
	});
	it("draws between the whole day and the largest hour", () => {
		expect(hourOf("wholeDay", 30, 224)).toBe(30);
		expect(hourOf(400, 30, 224)).toBe(224);
		expect(hourOf(10, 30, 224)).toBe(30);
	});
});
