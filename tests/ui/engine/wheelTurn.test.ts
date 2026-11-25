import { describe, expect, it } from "vitest";
import { DIVIDER_SNAP } from "../../../core/application/contracts";
import { CAREFUL_MS, WheelTurn } from "../../../obsidian/ui/engine/gestures/WheelTurn";

const STEP = 38;
/** The core's slow speed (`DIVIDER_SNAP.slowSpeed`), as the port gives it. */
const SLOW = DIVIDER_SNAP.slowSpeed;

/** A finger moved from `x0` by `dx` over `ms`, sampled every 8 ms. */
function drag(turn: WheelTurn, x0: number, dx: number, ms: number, t0 = 0): number {
	let at = 0;
	for (let t = 8; t <= ms; t += 8) at = turn.move(x0 + (dx * t) / ms, t0 + t);
	return at;
}

describe("the wheel under a finger (the design's «Колёсико», F30)", () => {
	it("a quick swipe turns it exactly one place, however far the finger goes", () => {
		const turn = new WheelTurn(0, 2, STEP, SLOW, 200, 0);
		drag(turn, 200, -150, 80);
		expect(turn.land()).toBe(1);
	});
	it("a quick swipe the other way, one place back; none past the ends", () => {
		const back = new WheelTurn(2, 2, STEP, SLOW, 200, 0);
		drag(back, 200, 150, 80);
		expect(back.land()).toBe(1);
		const end = new WheelTurn(2, 2, STEP, SLOW, 200, 0);
		drag(end, 200, -150, 80);
		expect(end.land()).toBe(2);
	});
	it("a slow drag turns it freely and lets it settle on the nearest place", () => {
		const turn = new WheelTurn(0, 2, STEP, SLOW, 200, 0);
		const at = drag(turn, 200, -2 * STEP - 10, 2000);
		expect(at).toBeGreaterThan(1.5);
		expect(turn.land()).toBe(2);
	});
	it("a swipe begun quickly and slowed turns freely on from where the quick part had it", () => {
		const turn = new WheelTurn(0, 2, STEP, SLOW, 200, 0);
		drag(turn, 200, -STEP / 2, 40);
		const held = drag(turn, 200 - STEP / 2, -1, CAREFUL_MS + 40, 40);
		expect(held).toBeCloseTo(0.5, 1);
		drag(turn, 200 - STEP / 2 - 1, -STEP * 2, 4000, 200);
		expect(turn.land()).toBe(2);
	});
	it("held where it was pressed, it stays", () => {
		const turn = new WheelTurn(1, 2, STEP, SLOW, 200, 0);
		drag(turn, 200, 4, 400);
		expect(turn.land()).toBe(1);
	});
});
