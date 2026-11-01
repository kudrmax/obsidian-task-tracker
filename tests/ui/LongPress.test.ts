// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LongPress } from "../../src/ui/drag/LongPress";

type Log = string[];

function pointer(type: string, x: number, y: number, pointerType = "touch"): PointerEvent {
	return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, isPrimary: true, button: 0, bubbles: true, pointerType });
}

function press(el: HTMLElement, log: Log, busy = () => false): LongPress {
	return new LongPress(el, {
		delayMs: () => 250,
		busy,
		onStart: (e) => log.push(`start ${e.clientX},${e.clientY}`),
		onTap: () => log.push("tap"),
		onLongTap: () => log.push("longtap"),
	});
}

describe("LongPress", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("starts a drag after the delay when a finger holds still", () => {
		const el = document.createElement("div");
		const log: Log = [];
		press(el, log);
		el.dispatchEvent(pointer("pointerdown", 10, 10));
		vi.advanceTimersByTime(249);
		expect(log).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(log).toEqual(["start 10,10"]);
	});

	it("lets a finger that wanders more than the tolerance scroll instead", () => {
		const el = document.createElement("div");
		const log: Log = [];
		press(el, log);
		el.dispatchEvent(pointer("pointerdown", 10, 10));
		el.dispatchEvent(pointer("pointermove", 10, 19));
		vi.advanceTimersByTime(300);
		expect(log).toEqual([]);
	});

	it("reports a tap when the finger lifts before the delay", () => {
		const el = document.createElement("div");
		const log: Log = [];
		press(el, log);
		el.dispatchEvent(pointer("pointerdown", 10, 10));
		vi.advanceTimersByTime(100);
		el.dispatchEvent(pointer("pointerup", 11, 10));
		vi.advanceTimersByTime(300);
		expect(log).toEqual(["tap"]);
	});

	it("starts at once when a mouse moves, and reports a long tap when it holds", () => {
		const el = document.createElement("div");
		const log: Log = [];
		press(el, log);
		el.dispatchEvent(pointer("pointerdown", 10, 10, "mouse"));
		el.dispatchEvent(pointer("pointermove", 12, 10, "mouse"));
		expect(log).toEqual([]);
		el.dispatchEvent(pointer("pointermove", 15, 10, "mouse"));
		expect(log).toEqual(["start 15,10"]);
		el.dispatchEvent(pointer("pointerup", 15, 10, "mouse"));

		el.dispatchEvent(pointer("pointerdown", 10, 10, "mouse"));
		vi.advanceTimersByTime(250);
		expect(log).toEqual(["start 15,10", "longtap"]);
	});

	it("does nothing while another gesture is busy", () => {
		const el = document.createElement("div");
		const log: Log = [];
		press(el, log, () => true);
		el.dispatchEvent(pointer("pointerdown", 10, 10));
		vi.advanceTimersByTime(300);
		expect(log).toEqual([]);
	});
});

describe("LongPress double click", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function clicking(): { el: HTMLElement; log: Log; click(pointerType?: string): void } {
		const el = document.createElement("div");
		const log: Log = [];
		new LongPress(el, {
			delayMs: () => 250,
			busy: () => false,
			onStart: () => log.push("start"),
			onTap: () => log.push("tap"),
			onDoubleTap: () => log.push("double"),
		});
		const click = (pointerType = "mouse") => {
			el.dispatchEvent(pointer("pointerdown", 10, 10, pointerType));
			el.dispatchEvent(pointer("pointerup", 10, 10, pointerType));
		};
		return { el, log, click };
	}

	it("reports a double tap and no tap when a mouse clicks twice quickly", () => {
		const { log, click } = clicking();
		click();
		vi.advanceTimersByTime(100);
		click();
		vi.advanceTimersByTime(1000);
		expect(log).toEqual(["double"]);
	});

	it("reports a single mouse click as a tap once the double click window passes", () => {
		const { log, click } = clicking();
		click();
		vi.advanceTimersByTime(249);
		expect(log).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(log).toEqual(["tap"]);
	});

	it("takes two slow clicks as two taps", () => {
		const { log, click } = clicking();
		click();
		vi.advanceTimersByTime(300);
		click();
		vi.advanceTimersByTime(300);
		expect(log).toEqual(["tap", "tap"]);
	});

	it("reports a finger's tap at once, with no double tap", () => {
		const { log, click } = clicking();
		click("touch");
		expect(log).toEqual(["tap"]);
		click("touch");
		expect(log).toEqual(["tap", "tap"]);
	});
});

describe("LongPress accepts", () => {
	it("ignores a press the element does not accept", () => {
		vi.useFakeTimers();
		const el = document.createElement("div");
		const onStart = vi.fn();
		new LongPress(el, { delayMs: () => 250, busy: () => false, onStart, accepts: () => false });
		el.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, isPrimary: true, button: 0, pointerType: "touch", clientX: 10, clientY: 10, bubbles: true }));
		vi.advanceTimersByTime(300);
		expect(onStart).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
