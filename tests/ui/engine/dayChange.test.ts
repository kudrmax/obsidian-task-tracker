import { describe, expect, it } from "vitest";
import { changeLook, changeTiming, type DayChange, SHIFT } from "../../../obsidian/ui/engine/gestures/dayChange";

const on: DayChange = { from: 0, to: 1, way: 1 };

describe("the calendar's quick switch on the list's landing (Decision 127)", () => {
	it("keeps the switch Max liked on a landing long enough for it: out in 0.06 s, in over 0.1 s", () => {
		expect(changeTiming(0.2)).toEqual({ outS: 0.06, inS: 0.1 });
	});

	it("fits the switch into a shorter landing, so it ends with it", () => {
		const t = changeTiming(0.08);
		expect(t.outS).toBeCloseTo(0.03);
		expect(t.outS + t.inS).toBeCloseTo(0.08);
	});

	it("nudges the old day the list's way and fades it, then brings the new day from the other side; never both in sight", () => {
		const timing = changeTiming(0.2);
		const start = changeLook(on, timing, 0, 0, 0.6);
		expect(start.out).toEqual({ x: -0, opacity: 1 });
		expect(start.in.opacity).toBe(0);
		const going = changeLook(on, timing, 0.03, 0.4, 0.6);
		expect(going.out.x).toBeLessThan(0);
		expect(going.out.x).toBeGreaterThan(-SHIFT);
		expect(going.in.opacity).toBe(0);
		const coming = changeLook(on, timing, 0.06, 0.6, 0.6);
		expect(coming.out.opacity).toBe(0);
		expect(coming.in).toEqual({ x: SHIFT, opacity: 0 });
		for (let t = 0; t <= 0.2; t += 0.005) {
			const look = changeLook(on, timing, t, Math.min(0.99, t * 5), 0.6);
			expect(look.out.opacity === 0 || look.in.opacity === 0).toBe(true);
		}
	});

	it("rides the list's remaining way into place, at rest whole on the frame the list lands", () => {
		const timing = changeTiming(0.2);
		const near = changeLook(on, timing, 0.19, 0.99, 0.6);
		expect(near.in.x).toBeCloseTo((SHIFT * 0.01) / 0.4);
		expect(changeLook(on, timing, 0.1, 1, 0.6).in).toEqual({ x: 0, opacity: 1 });
		expect(changeLook({ from: 2, to: 1, way: -1 }, timing, 0.06, 0.6, 0.6).in.x).toBe(-SHIFT);
	});
});
