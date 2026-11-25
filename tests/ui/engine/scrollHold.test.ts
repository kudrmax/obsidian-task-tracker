import { describe, expect, it } from "vitest";
import { NO_HOLD, type ScrollHold, scrollHold } from "../../../obsidian/ui/engine/view/scrollHold";

/** The heights a list draws as its rows' total and its scroll change, draw after draw. */
function draws(steps: readonly (readonly [total: number, offset: number])[]): number[] {
	let hold: ScrollHold = NO_HOLD;
	return steps.map(([total, offset]) => {
		hold = scrollHold(hold, total, offset);
		return Math.max(hold.total, hold.floor);
	});
}

describe("room kept under a scrolled list's last row (F66)", () => {
	it("rows gone at the end of a scrolled list: its height stays, so the cards above stay under the finger", () => {
		expect(draws([[1000, 600], [926, 600]])).toEqual([1000, 1000]);
	});
	it("gives the room back as the list is scrolled up, and keeps none once its rows fill it again", () => {
		expect(draws([[1000, 600], [926, 600], [926, 560], [926, 500], [926, 600]])).toEqual([1000, 1000, 960, 926, 926]);
	});
	it("a list at its top keeps nothing: there is no scroll to hold", () => {
		expect(draws([[1000, 0], [926, 0]])).toEqual([1000, 926]);
	});
	it("gives the same hold back when nothing changed, so the list draws once", () => {
		const hold = scrollHold(NO_HOLD, 1000, 600);
		expect(scrollHold(hold, 1000, 600)).toBe(hold);
	});
});
