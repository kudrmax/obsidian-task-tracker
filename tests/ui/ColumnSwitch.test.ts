// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RightMode } from "../../src/settings";
import { ColumnSwitch } from "../../src/ui/ColumnSwitch";
import { GestureArbiter } from "../../src/ui/gestures";

const LONG_PRESS = 250;
const STEP = 38;

function pointer(type: string, clientX: number): PointerEvent {
	return new PointerEvent(type, { clientX, clientY: 10, pointerId: 1, isPrimary: true, button: 0, bubbles: true });
}

/** happy-dom lays nothing out: the icon's width and the pill's place are what the stylesheet would give. */
function setUp(initial: RightMode, dot = false, arbiter = new GestureArbiter()) {
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
		arbiter,
	});
	const icons = [...control.el.querySelectorAll<HTMLElement>(".tc-seg-reel")[0].querySelectorAll<HTMLElement>(".tc-seg-icon")];
	for (const icon of control.el.querySelectorAll<HTMLElement>(".tc-seg-icon")) Object.defineProperty(icon, "offsetWidth", { get: () => STEP });
	const wheel = () => parseFloat(control.el.style.getPropertyValue("--tc-seg-pos"));
	const lit = () => [Math.round(wheel()), Math.round(wheel()) + 1];
	const depth = (column: number) => icons[column].style.getPropertyValue("--tc-seg-depth");
	const tap = (column: number) => {
		control.el.dispatchEvent(pointer("pointerdown", 50));
		control.el.dispatchEvent(pointer("pointerup", 50));
		icons[column].click();
	};
	const drag = (...xs: number[]) => {
		control.el.dispatchEvent(pointer("pointerdown", xs[0]));
		for (const x of xs.slice(1)) control.el.dispatchEvent(pointer("pointermove", x));
		control.el.dispatchEvent(pointer("pointerup", xs[xs.length - 1]));
		control.el.click();
	};
	return { control, changes, sources: () => sources, wheel, lit, depth, tap, drag };
}

describe("ColumnSwitch", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("turns the wheel so that its window shows the two columns on the screen, the icons out of it standing deeper", () => {
		const calendar = setUp("calendar");
		expect(calendar.lit()).toEqual([2, 3]);
		expect([0, 1, 2, 3].map(calendar.depth)).toEqual(["2", "1", "0", "0"]);
		expect(setUp("soon").lit()).toEqual([1, 2]);
		const inbox = setUp("inbox");
		expect(inbox.lit()).toEqual([0, 1]);
		expect([0, 1, 2, 3].map(inbox.depth)).toEqual(["0", "0", "1", "2"]);
	});

	it("holds a neighbour on each side of the window only where the wheel has one", () => {
		const sides = (s: ReturnType<typeof setUp>) => ["--tc-seg-before", "--tc-seg-after"].map((name) => s.control.el.style.getPropertyValue(name));
		expect(sides(setUp("inbox"))).toEqual(["0", "1"]);
		expect(sides(setUp("soon"))).toEqual(["1", "1"]);
		expect(sides(setUp("calendar"))).toEqual(["1", "0"]);
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 100));
		s.control.el.dispatchEvent(pointer("pointermove", 157));
		expect(sides(s)).toEqual(["0.5", "1"]);
	});

	it("draws the wheel twice, the copy under the window turning with it", () => {
		const s = setUp("soon");
		const [track, lens] = s.control.el.querySelectorAll(".tc-seg-reel");
		expect(lens.parentElement!.classList.contains("tc-seg-pill")).toBe(true);
		expect([...lens.querySelectorAll<HTMLElement>(".tc-seg-icon")].map((icon) => icon.style.getPropertyValue("--tc-seg-depth"))).toEqual(
			[...track.querySelectorAll<HTMLElement>(".tc-seg-icon")].map((icon) => icon.style.getPropertyValue("--tc-seg-depth")),
		);
	});

	it("moves to the nearest place that shows a tapped column, and stays for a column already shown", () => {
		const s = setUp("calendar");
		s.tap(3);
		s.tap(2);
		expect(s.changes).toEqual([]);
		s.tap(1);
		expect(s.changes).toEqual(["soon"]);
		s.tap(0);
		expect(s.changes).toEqual(["soon", "inbox"]);
		s.tap(2);
		expect(s.changes).toEqual(["soon", "inbox", "soon"]);
		s.tap(3);
		expect(s.changes).toEqual(["soon", "inbox", "soon", "calendar"]);
		const far = setUp("calendar");
		far.tap(0);
		expect(far.changes).toEqual(["inbox"]);
	});

	it("turns the wheel the way the finger goes, within its ends, the screen staying put until let go", () => {
		const s = setUp("soon");
		s.control.el.dispatchEvent(pointer("pointerdown", 100));
		s.control.el.dispatchEvent(pointer("pointermove", 81));
		expect(s.wheel()).toBe(1.5);
		expect(s.depth(0)).toBe("1.5");
		s.control.el.dispatchEvent(pointer("pointermove", 75));
		expect(s.lit()).toEqual([2, 3]);
		s.control.el.dispatchEvent(pointer("pointermove", 0));
		expect(s.wheel()).toBe(2);
		s.control.el.dispatchEvent(pointer("pointermove", 130));
		expect(s.lit()).toEqual([0, 1]);
		s.control.el.dispatchEvent(pointer("pointermove", 300));
		expect(s.wheel()).toBe(0);
		expect(s.changes).toEqual([]);
	});

	it("settles on the nearest place when let go, and a drag is not a tap", () => {
		const s = setUp("calendar");
		s.drag(100, 115);
		expect(s.changes).toEqual([]);
		expect(s.wheel()).toBe(2);
		s.drag(100, 125);
		expect(s.changes).toEqual(["soon"]);
		s.drag(100, 90, 75);
		expect(s.changes).toEqual(["soon", "calendar"]);
		s.drag(100, 180);
		expect(s.changes).toEqual(["soon", "calendar", "inbox"]);
	});

	it("holds the screen while the wheel is turned, and waits while another gesture holds it", () => {
		const arbiter = new GestureArbiter();
		const s = setUp("calendar", false, arbiter);
		s.control.el.dispatchEvent(pointer("pointerdown", 100));
		s.control.el.dispatchEvent(pointer("pointermove", 115));
		expect(arbiter.busy).toBe(true);
		s.control.el.dispatchEvent(pointer("pointermove", 180));
		s.control.el.dispatchEvent(pointer("pointerup", 180));
		expect(arbiter.busy).toBe(false);
		expect(s.changes).toEqual(["inbox"]);
		arbiter.claim("swipe");
		s.drag(100, 0);
		expect(s.changes).toEqual(["inbox"]);
		expect(s.wheel()).toBe(0);
	});

	it("glides to a place the screen asks for, as after a tap", () => {
		const s = setUp("soon");
		s.control.show("calendar");
		expect(s.changes).toEqual(["calendar"]);
		expect(s.lit()).toEqual([2, 3]);
		expect(s.control.el.classList.contains("is-settling")).toBe(true);
		s.control.show("calendar");
		expect(s.changes).toEqual(["calendar"]);
	});

	it("opens the sources when held while the calendar shows, and does not flip", () => {
		const s = setUp("calendar");
		s.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		s.control.el.dispatchEvent(pointer("pointerup", 50));
		s.control.el.querySelector<HTMLElement>(".tc-seg-icon")!.click();
		expect(s.sources()).toBe(1);
		expect(s.changes).toEqual([]);
		const lists = setUp("soon");
		lists.control.el.dispatchEvent(pointer("pointerdown", 50));
		vi.advanceTimersByTime(LONG_PRESS);
		expect(lists.sources()).toBe(0);
	});

	it("puts the dot of a stale source on the calendar, under the window too", () => {
		expect(setUp("soon", true).control.el.querySelectorAll(".tc-dot.is-shown").length).toBe(2);
		expect(setUp("soon").control.el.querySelector(".tc-dot.is-shown")).toBeNull();
	});
});
