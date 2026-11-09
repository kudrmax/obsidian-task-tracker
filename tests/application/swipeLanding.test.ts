import { describe, expect, it } from "vitest";
import { SWIPE_FLICK_SPEED, swipeLanding } from "../../core/application/contracts";

describe("where a swipe lands", () => {
	const distance = 200;

	it("arrives at the next screen once it has come half the way, else springs back", () => {
		expect(swipeLanding(100, distance, 0)).toBe(1);
		expect(swipeLanding(99, distance, 0)).toBe(0);
		expect(swipeLanding(-100, distance, 0)).toBe(-1);
		expect(swipeLanding(-99, distance, 0)).toBe(0);
	});

	it("goes the way a flick sends it, however little of the way it was drawn", () => {
		expect(swipeLanding(10, distance, SWIPE_FLICK_SPEED)).toBe(1);
		expect(swipeLanding(-10, distance, -SWIPE_FLICK_SPEED)).toBe(-1);
	});

	it("springs back from a flick against the way it was drawn", () => {
		expect(swipeLanding(150, distance, -SWIPE_FLICK_SPEED)).toBe(0);
		expect(swipeLanding(-150, distance, SWIPE_FLICK_SPEED)).toBe(0);
	});

	it("never goes further than the next screen, however far or fast", () => {
		expect(swipeLanding(distance * 3, distance, 10)).toBe(1);
		expect(swipeLanding(-distance * 3, distance, -10)).toBe(-1);
	});

	it("stays when the finger took it nowhere", () => {
		expect(swipeLanding(0, distance, SWIPE_FLICK_SPEED)).toBe(0);
	});
});
