import { describe, expect, it } from "vitest";
import { ScrollHold } from "../../../obsidian/ui/engine/view/scrollHold";

describe("room kept under a scrolled list's last row (F66)", () => {
	it("rows gone at the end of a scrolled list: its height stays, so the cards above stay under the finger", () => {
		const hold = new ScrollHold();
		expect(hold.height(1000, 600)).toBe(1000);
		expect(hold.height(926, 600)).toBe(1000);
	});
	it("gives the room back as the list is scrolled up, and keeps none once its rows fill it again", () => {
		const hold = new ScrollHold();
		hold.height(1000, 600);
		hold.height(926, 600);
		expect(hold.height(926, 560)).toBe(960);
		expect(hold.height(926, 500)).toBe(926);
		expect(hold.height(926, 600)).toBe(926);
	});
	it("a list at its top keeps nothing: there is no scroll to hold", () => {
		const hold = new ScrollHold();
		hold.height(1000, 0);
		expect(hold.height(926, 0)).toBe(926);
	});
});
