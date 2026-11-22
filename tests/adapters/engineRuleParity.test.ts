import { describe, expect, it } from "vitest";
import { SWIPE_FLICK_SPEED, swipeLanding } from "../../core/application/contracts";
import { FLICK_SPEED, FollowPager } from "../../obsidian/ui/engine/gestures/followPager";

/**
 * The engine's one copy left of a rule in the core (the audit's pair E1, Decision 136): the frozen pager (Decisions 64,
 * 126, 129) keeps its code, held here to the core's guarded `swipeLanding`. The snap (E3) and the levels (E7) are the
 * core's own, asked through the port (Decision 145).
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

});
