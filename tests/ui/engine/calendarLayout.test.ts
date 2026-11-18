import { describe, expect, it } from "vitest";
import { DESIGN, LAYOUT } from "../../../obsidian/ui/design";
import { resized } from "../../../obsidian/ui/engine/gestures/Resize";
import { hourOf, zoomAfterPinch } from "../../../obsidian/ui/engine/gestures/Zoom";
import { CARD, keptLength, layEvents, layTasks, stackEnd } from "../../../obsidian/ui/engine/layout/calendar";
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
	it("shrunk to a card's height or less, a task keeps no length (F103)", () => {
		expect(keptLength(60, 90, BASE_SCALE)).toBeNull();
		expect(keptLength(60, 120, BASE_SCALE)).toBe(60);
	});
});

const block = (more: Partial<Block>): Block => ({ id: "a", start: 600, length: 60, from: 600, clock: "15:00", endClock: "16:00", startParts: ["15", "00"], lengthParts: ["1", "H"], step: null, ...more });

/** The design's «Выделение и длительность» and «Задача, которую прошла линия «сейчас»». */
describe("resizing by the dots", () => {
	it("the bottom dot moves the end by the snap step, the start kept", () => {
		expect(resized(block({}), "end", y(32), BASE_SCALE, 0, true)).toMatchObject({ at: 600, end: 690 });
	});
	it("the top dot moves the start, the end kept", () => {
		expect(resized(block({}), "start", -y(30), BASE_SCALE, 0, true)).toMatchObject({ at: 570, end: 660 });
	});
	it("shrunk to the minimum, the task loses its length", () => {
		expect(resized(block({}), "end", -y(45), BASE_SCALE, 0, true)).toMatchObject({ at: 600, end: null });
	});
	it("a task without a length pulled up by its top dot: the start earlier, the old start its end", () => {
		expect(resized(block({ length: null, endClock: null }), "start", -y(60), BASE_SCALE, 0, true)).toMatchObject({ at: 540, end: 600 });
	});
	it("a task riding the now line: the bottom dot keeps its start in the file and ends where let go; the top dot writes a new start (F105)", () => {
		const riding = block({ start: 700, from: 600, length: 30 });
		expect(resized(riding, "end", y(60), BASE_SCALE, 0, true)).toMatchObject({ at: 600, end: 695 });
		expect(resized(riding, "start", -y(15), BASE_SCALE, 0, true)).toMatchObject({ at: 690, end: 730 });
	});
	it("the step follows the zoom: 5 minutes at 112 px an hour", () => {
		expect(resized(block({}), "end", new TimeScale(112).y(7), new TimeScale(112), 0, true)).toMatchObject({ end: 665 });
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
