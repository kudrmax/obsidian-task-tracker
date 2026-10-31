// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GestureArbiter } from "../../src/ui/gestures";
import type { Shift } from "../../src/ui/screens";
import { Swipe } from "../../src/ui/Swipe";

const SLOW_STEP_MS = 1000;
let now = 0;

/** An event `after` ms past the one before: a second by default, an unhurried finger. */
function pointer(type: string, x: number, y = 300, { after = SLOW_STEP_MS, id = 1, pointerType = "touch" } = {}): PointerEvent {
	const e = new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, isPrimary: id === 1, button: 0, bubbles: true, pointerType });
	now += after;
	Object.defineProperty(e, "timeStamp", { value: now });
	return e;
}

function setUp(arbiter = new GestureArbiter()) {
	const root = document.createElement("div");
	const inner = root.appendChild(document.createElement("div"));
	const sheet = root.appendChild(document.createElement("div"));
	const shifts: Shift[] = [];
	new Swipe(root, { arbiter, accepts: (target) => target !== sheet, onSwipe: (shift) => shifts.push(shift) });
	const swipe = (from: HTMLElement, ...points: [number, number][]) => {
		from.dispatchEvent(pointer("pointerdown", ...points[0]));
		for (const point of points.slice(1)) from.dispatchEvent(pointer("pointermove", ...point));
		from.dispatchEvent(pointer("pointerup", ...points[points.length - 1]));
	};
	return { root, inner, sheet, shifts, arbiter, swipe };
}

describe("Swipe", () => {
	it("steps on when the finger goes left, and back when it goes right, from anywhere on the screen", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [280, 302], [200, 305]);
		swipe(inner, [100, 300], [120, 298], [250, 290]);
		expect(shifts).toEqual([1, -1]);
	});

	it("holds the screen while the finger is on its way, and lets it go when lifted", () => {
		const { inner, arbiter } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 280));
		expect(arbiter.busy).toBe(true);
		inner.dispatchEvent(pointer("pointerup", 200));
		expect(arbiter.busy).toBe(false);
	});

	it("leaves a finger that goes up or down to the scroll", () => {
		const { inner, shifts, arbiter, swipe } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300, 300));
		inner.dispatchEvent(pointer("pointermove", 295, 280));
		expect(arbiter.busy).toBe(false);
		inner.dispatchEvent(pointer("pointermove", 150, 270));
		inner.dispatchEvent(pointer("pointerup", 150, 270));
		swipe(inner, [300, 300], [302, 340], [310, 500]);
		expect(shifts).toEqual([]);
	});

	it("does nothing for a short, slow slide, and steps for a short flick", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [285, 300], [270, 300]);
		expect(shifts).toEqual([]);
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 285, 300, { after: 10 }));
		inner.dispatchEvent(pointer("pointermove", 270, 300, { after: 10 }));
		inner.dispatchEvent(pointer("pointerup", 265, 300, { after: 10 }));
		expect(shifts).toEqual([1]);
	});

	it("takes the way the finger was let go, not the way it set off", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [250, 300], [260, 300], [330, 300], [380, 300]);
		expect(shifts).toEqual([-1]);
	});

	it("does nothing when the finger comes back before it is lifted", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [200, 300], [295, 300]);
		expect(shifts).toEqual([]);
	});

	it("waits while another gesture holds the screen, and never takes it from one", () => {
		const arbiter = new GestureArbiter();
		const { inner, shifts, swipe } = setUp(arbiter);
		arbiter.claim("drag");
		swipe(inner, [300, 300], [280, 300], [100, 300]);
		expect(shifts).toEqual([]);
		arbiter.release("drag");
		inner.dispatchEvent(pointer("pointerdown", 300));
		arbiter.claim("divider");
		inner.dispatchEvent(pointer("pointermove", 200));
		inner.dispatchEvent(pointer("pointerup", 100));
		expect(shifts).toEqual([]);
		expect(arbiter.busy).toBe(true);
	});

	it("leaves alone what lies over the screen, a mouse, and a second finger's pinch", () => {
		const { inner, sheet, shifts, swipe } = setUp();
		swipe(sheet, [300, 300], [280, 300], [100, 300]);
		inner.dispatchEvent(pointer("pointerdown", 300, 300, { pointerType: "mouse" }));
		inner.dispatchEvent(pointer("pointermove", 100, 300, { pointerType: "mouse" }));
		inner.dispatchEvent(pointer("pointerup", 100, 300, { pointerType: "mouse" }));
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointerdown", 300, 400, { id: 2 }));
		inner.dispatchEvent(pointer("pointermove", 100));
		inner.dispatchEvent(pointer("pointerup", 100));
		expect(shifts).toEqual([]);
	});

	it("drops a swipe the browser cancels", () => {
		const { inner, shifts, arbiter } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 200));
		inner.dispatchEvent(pointer("pointercancel", 100));
		expect(shifts).toEqual([]);
		expect(arbiter.busy).toBe(false);
	});
});
