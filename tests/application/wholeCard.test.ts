import { describe, expect, it } from "vitest";
import { grownStart, wholeWidth } from "../../core/application/wholeCard";

const phone = { width: 390, margin: 10 };
const card = (textWidth: number, width = 170, titleWidth = 140) => ({ width, titleWidth, textWidth, fade: 16 });

describe("a pressed card stretches to the right to show its whole title", () => {
	it("stays as it is when the title shows whole, its fade too", () => {
		expect(wholeWidth(card(100), phone)).toBeNull();
		expect(wholeWidth(card(124), phone)).toBeNull();
	});

	it("stretches by what the title lacks, a part of a pixel taken whole", () => {
		expect(wholeWidth(card(200), phone)).toEqual({ width: 230, cut: false });
		expect(wholeWidth(card(199.2), phone)).toEqual({ width: 230, cut: false });
	});

	it("stretches by a faded end too: the title lacks less than the fade", () => {
		expect(wholeWidth(card(130), phone)).toEqual({ width: 170, cut: false });
	});

	it("stretches no wider than the window less its margins, and says the title is still cut", () => {
		expect(wholeWidth(card(540), phone)).toEqual({ width: 370, cut: true });
	});

	it("never gets narrower than the card, even in a window narrower than it", () => {
		expect(wholeWidth(card(200), { width: 150, margin: 10 })).toEqual({ width: 170, cut: true });
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
