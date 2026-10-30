import { describe, expect, it } from "vitest";
import { grownStart, roomWidth, wholeWidth } from "../../src/ui/wholeCard";

const phone = roomWidth({ width: 390, height: 844, margin: 10 });

describe("a pressed card grows to show its whole title", () => {
	it("grows by what the title lacks", () => {
		expect(wholeWidth(170, 60, phone)).toBe(230);
	});

	it("keeps the card under the finger at its own width: the title wraps", () => {
		expect(wholeWidth(190, 120, 190)).toBe(190);
	});

	it("grows no wider than the window less its margins, then wraps", () => {
		expect(wholeWidth(170, 400, phone)).toBe(370);
	});

	it("never gets narrower than the card, even in a window narrower than it", () => {
		expect(wholeWidth(170, 0, phone)).toBe(170);
		expect(wholeWidth(170, 60, roomWidth({ width: 150, height: 844, margin: 10 }))).toBe(170);
	});
});

describe("a grown card stays inside the window", () => {
	it("stays where the card was when it fits", () => {
		expect(grownStart(10, 170, 230, 390, 10)).toBe(10);
	});

	it("is pulled back only as far as it takes to end at the margin", () => {
		expect(grownStart(200, 180, 230, 390, 10)).toBe(150);
	});

	it("keeps the card's own end when that lies past the margin", () => {
		expect(grownStart(200, 189, 230, 390, 10)).toBe(159);
	});

	it("is never pulled past the near margin", () => {
		expect(grownStart(200, 180, 370, 390, 10)).toBe(10);
	});

	it("leaves a card that started past the margin where it was", () => {
		expect(grownStart(4, 100, 120, 390, 10)).toBe(4);
	});
});
