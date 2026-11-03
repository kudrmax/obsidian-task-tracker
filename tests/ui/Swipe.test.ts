// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureArbiter } from "../../src/ui/gestures";
import type { Shift } from "../../src/ui/screens";
import { Swipe, swipeStartsAt, type SwipeTarget } from "../../src/ui/Swipe";

const SLOW_STEP_MS = 1000;
let now = 0;

/** An event `after` ms past the one before: a second by default, an unhurried finger. */
function pointer(type: string, x: number, y = 300, { after = SLOW_STEP_MS, id = 1, pointerType = "touch" } = {}): PointerEvent {
	const e = new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, isPrimary: id === 1, button: 0, bubbles: true, pointerType });
	now += after;
	Object.defineProperty(e, "timeStamp", { value: now });
	return e;
}

/** The screens a swipe draws: the next one `WIDTH` away either way, none past `ends`. */
const WIDTH = 200;

function setUp(arbiter = new GestureArbiter(), ends: readonly Shift[] = []) {
	const root = document.createElement("div");
	const inner = root.appendChild(document.createElement("div"));
	const sheet = root.appendChild(document.createElement("div"));
	const shifts: Shift[] = [];
	const settles: (Shift | null)[] = [];
	const follows: number[] = [];
	const target: SwipeTarget = {
		distance: (shift) => (ends.includes(shift) ? null : WIDTH),
		follow: (dx) => follows.push(dx),
		settle: (shift) => {
			settles.push(shift);
			if (shift !== null) shifts.push(shift);
			return Promise.resolve();
		},
	};
	new Swipe(root, { arbiter, accepts: (target) => target !== sheet, target });
	const swipe = (from: HTMLElement, ...points: [number, number][]) => {
		from.dispatchEvent(pointer("pointerdown", ...points[0]));
		for (const point of points.slice(1)) from.dispatchEvent(pointer("pointermove", ...point));
		from.dispatchEvent(pointer("pointerup", ...points[points.length - 1]));
	};
	return { root, inner, sheet, shifts, settles, follows, arbiter, swipe };
}

/** The screen settles, and only then lets the screen go. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Swipe", () => {
	it("steps on when the finger goes left, and back when it goes right, from anywhere on the screen", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [280, 302], [150, 305]);
		swipe(inner, [100, 300], [120, 298], [250, 290]);
		expect(shifts).toEqual([1, -1]);
	});

	it("draws the screen with the finger from where it went sideways, no further than the next screen", () => {
		const { inner, follows } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 290));
		inner.dispatchEvent(pointer("pointermove", 250));
		inner.dispatchEvent(pointer("pointermove", 320));
		inner.dispatchEvent(pointer("pointermove", -100));
		expect(follows).toEqual([-40, 30, -WIDTH]);
	});

	it("lands on whichever screen stands nearer when let go", () => {
		const { inner, settles, swipe } = setUp();
		swipe(inner, [300, 300], [290, 300], [191, 300]);
		swipe(inner, [300, 300], [290, 300], [189, 300]);
		swipe(inner, [300, 300], [310, 300], [409, 300]);
		swipe(inner, [300, 300], [310, 300], [411, 300]);
		expect(settles).toEqual([null, 1, null, -1]);
	});

	it("holds the screen while the finger is on its way, and lets it go once the screen stands", async () => {
		const { inner, arbiter } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 280));
		expect(arbiter.busy).toBe(true);
		inner.dispatchEvent(pointer("pointerup", 200));
		await settled();
		expect(arbiter.busy).toBe(false);
	});

	it("leaves a finger that goes up or down to the scroll", () => {
		const { inner, shifts, follows, arbiter, swipe } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300, 300));
		inner.dispatchEvent(pointer("pointermove", 295, 280));
		expect(arbiter.busy).toBe(false);
		inner.dispatchEvent(pointer("pointermove", 150, 270));
		inner.dispatchEvent(pointer("pointerup", 150, 270));
		swipe(inner, [300, 300], [302, 340], [310, 500]);
		expect(shifts).toEqual([]);
		expect(follows).toEqual([]);
	});

	it("goes back for a short, slow slide, and steps for a short flick", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [285, 300], [270, 300]);
		expect(shifts).toEqual([]);
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 285, 300, { after: 10 }));
		inner.dispatchEvent(pointer("pointermove", 270, 300, { after: 10 }));
		inner.dispatchEvent(pointer("pointerup", 265, 300, { after: 10 }));
		expect(shifts).toEqual([1]);
	});

	it("goes back for a flick back, however far the screen was drawn", () => {
		const { inner, settles } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 290));
		inner.dispatchEvent(pointer("pointermove", 130));
		inner.dispatchEvent(pointer("pointermove", 145, 300, { after: 10 }));
		inner.dispatchEvent(pointer("pointerup", 160, 300, { after: 10 }));
		expect(settles).toEqual([null]);
	});

	it("takes the way the finger was let go, not the way it set off", () => {
		const { inner, shifts, swipe } = setUp();
		swipe(inner, [300, 300], [250, 300], [260, 300], [330, 300], [380, 300]);
		expect(shifts).toEqual([-1]);
	});

	it("goes back when the finger comes back before it is lifted", () => {
		const { inner, settles, swipe } = setUp();
		swipe(inner, [300, 300], [290, 300], [150, 300], [285, 300]);
		expect(settles).toEqual([null]);
	});

	it("only gives past the row's end, and goes back", () => {
		const { inner, settles, follows, swipe } = setUp(new GestureArbiter(), [-1]);
		swipe(inner, [100, 300], [110, 300], [500, 300]);
		expect(follows).toEqual([390, 390]);
		expect(settles).toEqual([null]);
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

	it("brings the screen back for a swipe the browser cancels", async () => {
		const { inner, settles, arbiter } = setUp();
		inner.dispatchEvent(pointer("pointerdown", 300));
		inner.dispatchEvent(pointer("pointermove", 200));
		inner.dispatchEvent(pointer("pointermove", 50));
		inner.dispatchEvent(pointer("pointercancel", 50));
		await settled();
		expect(settles).toEqual([null]);
		expect(arbiter.busy).toBe(false);
	});

	describe("on a trackpad", () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		/** A Mac's trackpad sends an event about every 8 ms, while the fingers move and through the glide after they lift. */
		const FRAME_MS = 8;

		/** happy-dom drops the modifier keys of a WheelEvent's init: a pinch's ctrl is set on the event itself. */
		const wheel = (target: HTMLElement, deltaX: number, deltaY = 0, ctrlKey = false) => {
			const e = new WheelEvent("wheel", { deltaX, deltaY, bubbles: true, cancelable: true });
			if (ctrlKey) Object.defineProperty(e, "ctrlKey", { value: true });
			now += FRAME_MS;
			Object.defineProperty(e, "timeStamp", { value: now });
			target.dispatchEvent(e);
			vi.advanceTimersByTime(FRAME_MS);
			return e;
		};

		/** Recorded on a MacBook's trackpad, rounded: two fingers to the right, then their glide decaying after the lift. */
		const RIGHT = [-1, -5, -6, -5, -5, -8, -24, -31, -47, -25, -16, -16, -26, -42, -47, -49, -48, -49, -47, -47, -45, -45, -45, -42, -42, -41, -41, -37, -37, -37, -35, -35, -33, -33, -31, -29, -28, -27, -27, -26, -26, -25, -23, -23, -22, -21, -20, -19, -19, -17, -17, -17];
		/** The fingers coming down again stop the glide: a dip, then the next stroke picks up. */
		const NEXT_RIGHT = [-4, -8, -2, -11, -5, -15, -21, -36, -50, -60, -55, -50, -45];
		const LEFT = [3, 11, 8, 6, 10, 21, 26, 43, 35, 32, 11, 5, 18, 43, 100, 51, 52, 49, 50, 47, 47, 46, 45, 43, 42, 41, 41, 39, 37, 37, 37, 36, 33, 33, 31, 31, 29, 28, 27, 27, 26, 26, 25, 24, 23, 21, 21, 20, 19, 19, 17];
		const TURN_RIGHT = [-4, -16, -3, -17, -11, -33, -60, -70, -50];

		it("steps on when two fingers go left, and back when they go right, once they stop past halfway", () => {
			const { inner, shifts, follows } = setUp();
			for (const delta of [10, 20, 30, 30, 20, 10, 5, 2, 1]) wheel(inner, delta);
			expect(follows.slice(0, 3)).toEqual([-10, -30, -60]);
			expect(shifts).toEqual([]);
			vi.advanceTimersByTime(1000);
			expect(shifts).toEqual([1]);
			for (const delta of [-30, -50, -60, -20]) wheel(inner, delta);
			vi.advanceTimersByTime(1000);
			expect(shifts).toEqual([1, -1]);
		});

		it("steps as soon as the fingers have drawn the whole way, and passes the glide after by", () => {
			const { inner, shifts, follows } = setUp();
			for (const delta of [60, 80, 80, 70, 50, 30]) wheel(inner, delta);
			expect(shifts).toEqual([1]);
			expect(follows).toEqual([-60, -140, -WIDTH]);
		});

		it("keeps the screen from scrolling sideways, and leaves an up-or-down scroll alone", () => {
			const { inner, shifts } = setUp();
			expect(wheel(inner, 20, 3).defaultPrevented).toBe(true);
			vi.advanceTimersByTime(1000);
			for (const delta of [10, 40, 60]) expect(wheel(inner, delta / 4, delta).defaultPrevented).toBe(false);
			expect(shifts).toEqual([]);
		});

		it("steps for each stroke, one begun while the last one still glides too", () => {
			const { inner, shifts } = setUp();
			for (const delta of [...RIGHT, ...NEXT_RIGHT]) wheel(inner, delta);
			expect(shifts).toEqual([-1, -1]);
		});

		it("steps once for a stroke whose fingers speed up after it stepped, and once for its whole glide", () => {
			const { inner, shifts } = setUp();
			for (const delta of LEFT) wheel(inner, delta);
			expect(shifts).toEqual([1]);
		});

		it("steps back for fingers turned the other way while the glide goes on", () => {
			const { inner, shifts } = setUp();
			for (const delta of [...LEFT, ...TURN_RIGHT]) wheel(inner, delta);
			expect(shifts).toEqual([1, -1]);
		});

		it("draws the screen however slowly the fingers creep, and goes back when they stop short of halfway", () => {
			const { inner, settles } = setUp();
			for (let i = 0; i < 30; i++) wheel(inner, 3);
			vi.advanceTimersByTime(1000);
			for (let i = 0; i < 40; i++) wheel(inner, 3);
			vi.advanceTimersByTime(1000);
			expect(settles).toEqual([null, 1]);
		});

		it("goes back after a short stroke", () => {
			const { inner, shifts } = setUp();
			for (const delta of [10, 10, 10]) wheel(inner, delta);
			vi.advanceTimersByTime(1000);
			for (const delta of [10, 10, 10]) wheel(inner, delta);
			vi.advanceTimersByTime(1000);
			expect(shifts).toEqual([]);
		});

		it("leaves a pinch, what lies over the screen and a busy screen alone", () => {
			const arbiter = new GestureArbiter();
			const { inner, sheet, shifts } = setUp(arbiter);
			for (const delta of [30, 30, 30]) wheel(inner, delta, 0, true);
			vi.advanceTimersByTime(1000);
			for (const delta of [30, 30, 30]) wheel(sheet, delta);
			vi.advanceTimersByTime(1000);
			arbiter.claim("drag");
			for (const delta of [30, 30, 30]) wheel(inner, delta);
			expect(shifts).toEqual([]);
		});
	});
});

describe("where a swipe may start on the screen", () => {
	it("not in a field being typed in, the quick bar, or a section's name field; anywhere else", () => {
		const root = document.body.appendChild(document.createElement("div"));
		const marked = (cls: string) => {
			const holder = root.appendChild(document.createElement("div"));
			holder.className = cls;
			return holder.appendChild(document.createElement("i"));
		};
		expect([".tc-quick-row", ".tc-quick-bar", ".tc-group-field"].map((s) => swipeStartsAt(marked(s.slice(1))))).toEqual([false, false, false]);
		expect(swipeStartsAt(marked("tc-card"))).toBe(true);
		expect(swipeStartsAt(null)).toBe(true);
	});
});
