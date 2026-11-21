import { describe, expect, it } from "vitest";
import { levelRange, SWIPE_FLICK_SPEED, swipeLanding } from "../../core/application/contracts";
import { snapMinute } from "../../core/application/snapGrid";
import { LAYOUT } from "../../obsidian/ui/shared/design";
import { levelBetween } from "../../obsidian/ui/engine/drag/tree";
import { FLICK_SPEED, FollowPager } from "../../obsidian/ui/engine/gestures/followPager";
import { TimeScale } from "../../obsidian/ui/engine/layout/timeScale";
import type { Row } from "../../obsidian/ui/engine/port";

/**
 * The engine's own copies of a rule in the core (the audit's pairs, Decision 136) fed the same inputs as the core's: one
 * rule, two places, until the engine asks the port for it. The frozen pager (Decisions 64, 126, 129) keeps its code; this
 * holds it to the core's guarded `swipeLanding`.
 */
describe("the engine's copies answer as the core's rules", () => {
	it("E1: a swipe lands where the core's swipeLanding says, never two places (Max's «one swipe, one place»)", () => {
		expect(FLICK_SPEED).toBe(SWIPE_FLICK_SPEED);
		const width = 400;
		for (const moved of [-390, -250, -201, -199, -60, -1, 1, 60, 199, 201, 250, 390])
			for (const speed of [-2, -0.6, -0.3, -0.29, -0.05, 0, 0.05, 0.29, 0.3, 0.6, 2]) {
				const pager = new FollowPager(2, 4);
				pager.begin(2, true);
				const at = pager.move(moved, width);
				const landed = pager.release(at, speed, width) - 2;
				expect({ moved, speed, landed }).toEqual({ moved, speed, landed: swipeLanding(moved, width, speed) });
			}
	});

	it("E3: the calendar's snap is the core's (`TaskService.snap`, `snapMinute`) at every zoom", () => {
		for (const hourPx of [28, 46, 56, 80, 112, 160, 224])
			for (let minute = 0; minute <= 24 * 60; minute += 7) expect({ hourPx, minute, at: new TimeScale(hourPx).snap(minute) }).toEqual({ hourPx, minute, at: snapMinute(minute, hourPx, LAYOUT.snapTolerance) });
	});

	it("E7: a level between two cards keeps the core's bounds (levelRange)", () => {
		const row = (depth: number): Row => ({ kind: "task", id: `t${depth}`, depth });
		for (const above of [undefined, 0, 1, 2])
			for (const below of [undefined, 0, 1, 2, 3]) {
				if (above !== undefined && below !== undefined && below > above + 1) continue;
				const cards = [...(above === undefined ? [] : [{ level: above, group: null }]), ...(below === undefined ? [] : [{ level: below, group: null }])];
				const { min, max } = levelRange(cards, above === undefined ? 0 : 1, null);
				for (const wanted of [-1, 0, 1, 2, 3, 4]) expect({ above, below, wanted, level: levelBetween(above === undefined ? undefined : row(above), below === undefined ? undefined : row(below), wanted) }).toEqual({ above, below, wanted, level: Math.max(min, Math.min(max, Math.max(0, wanted))) });
			}
	});
});
