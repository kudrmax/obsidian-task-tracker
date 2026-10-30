// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RightMode } from "../../src/settings";
import { ColumnSwitch } from "../../src/ui/ColumnSwitch";

const LONG_PRESS = 250;
const STEP = 38;

function pointer(type: string, clientX: number): PointerEvent {
	return new PointerEvent(type, { clientX, clientY: 10, pointerId: 1, isPrimary: true, button: 0, bubbles: true });
}

/** happy-dom lays nothing out: the icon's width and the pill's place are what the stylesheet would give. */
function setUp(initial: RightMode, dot = false) {
	let mode = initial;
	const changes: RightMode[] = [];
	let sources = 0;
	const control = new ColumnSwitch(document.createElement("div"), {
		value: () => mode,
		onChange: (next) => {
			changes.push(next);
			mode = next;
			control.render();
		},
		dot: () => dot,
		onSources: () => sources++,
		longPressMs: () => LONG_PRESS,
	});
	const pill = control.el.querySelector<HTMLElement>(".tc-seg-pill")!;
	for (const icon of control.el.querySelectorAll<HTMLElement>(".tc-seg-icon")) Object.defineProperty(icon, "offsetWidth", { get: () => STEP });
	Object.defineProperty(pill, "offsetLeft", { get: () => (pill.style.left ? parseFloat(pill.style.left) : mode === "calendar" ? 2 + STEP : 2) });
	const lit = () => [...control.el.querySelectorAll(".tc-seg-icon.is-on")].map((icon) => [...control.el.querySelectorAll(".tc-seg-icon")].indexOf(icon));
	const tap = () => {
		control.el.dispatchEvent(pointer("pointerdown", 50));
		control.el.dispatchEvent(pointer("pointerup", 50));
		control.el.click();
	};
	const drag = (...xs: number[]) => {
		control.el.dispatchEvent(pointer("pointerdown", xs[0]));
		for (const x of xs.slice(1)) control.el.dispatchEvent(pointer("pointermove", x));
		control.el.dispatchEvent(pointer("pointerup", xs[xs.length - 1]));
		control.el.click();
	};
	return { control, pill, changes, sources: () => sources, lit, tap, drag };
}

describe("ColumnSwitch", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("lights the two columns the window shows and puts the pill over them", () => {
		const calendar = setUp("calendar");
		expect(calendar.lit()).toEqual([1, 2]);
		expect(calendar.control.el.classList.contains("is-lists")).toBe(false);
		expect(calendar.control.el.getAttribute("aria-checked")).toBe("true");
		const lists = setUp("soon");
		expect(lists.lit()).toEqual([0, 1]);
		expect(lists.control.el.classList.contains("is-lists")).toBe(true);
	});

	it("flips to the other side on a tap anywhere, like a toggle", () => {
		const s = setUp("calendar");
		s.tap();
		expect(s.changes).toEqual(["soon"]);
		s.tap();
		expect(s.changes).toEqual(["soon", "calendar"]);
	});

	it("carries the pill under the finger within its track, the screen staying put until let go", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 100));
		s.control.el.dispatchEvent(pointer("pointermove", 85));
		expect(s.pill.style.left).toBe("25px");
		expect(s.lit()).toEqual([1, 2]);
		s.control.el.dispatchEvent(pointer("pointermove", 70));
		expect(s.lit()).toEqual([0, 1]);
		s.control.el.dispatchEvent(pointer("pointermove", 0));
		expect(s.pill.style.left).toBe("2px");
		s.control.el.dispatchEvent(pointer("pointermove", 300));
		expect(s.pill.style.left).toBe("40px");
		expect(s.changes).toEqual([]);
	});

	it("settles on the nearer side when let go, and a drag is not a tap", () => {
		const s = setUp("calendar");
		s.drag(100, 85);
		expect(s.changes).toEqual([]);
		expect(s.pill.style.left).toBe("");
		s.drag(100, 75);
		expect(s.changes).toEqual(["soon"]);
		s.drag(100, 110, 125);
		expect(s.changes).toEqual(["soon", "calendar"]);
	});

	it("opens the sources when held while the calendar shows, and does not flip", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		s.control.el.dispatchEvent(pointer("pointerup", 50));
		s.control.el.click();
		expect(s.sources()).toBe(1);
		expect(s.changes).toEqual([]);
		const lists = setUp("soon");
		lists.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		expect(lists.sources()).toBe(0);
	});

	it("puts the dot of a stale source on the calendar", () => {
		expect(setUp("soon", true).control.el.querySelector(".tc-dot.is-shown")).not.toBeNull();
		expect(setUp("soon").control.el.querySelector(".tc-dot.is-shown")).toBeNull();
	});
});
