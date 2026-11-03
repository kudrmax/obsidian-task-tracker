// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { clipTo, scrollToShow, topInside } from "../../src/ui/menu/inView";

const box = { top: 200, bottom: 700 };

describe("what was pressed comes into view before its menu opens", () => {
	it("leaves an item shown whole where it is", () => {
		expect(scrollToShow({ top: 300, bottom: 340 }, box)).toBe(0);
	});

	it("scrolls up to show an item cut at the top whole", () => {
		expect(scrollToShow({ top: 180, bottom: 220 }, box)).toBe(-20);
	});

	it("scrolls down to show an item cut at the bottom whole", () => {
		expect(scrollToShow({ top: 680, bottom: 720 }, box)).toBe(20);
	});

	it("brings the top of an item taller than the box to the box's top", () => {
		expect(scrollToShow({ top: -100, bottom: 900 }, box)).toBe(-300);
		expect(scrollToShow({ top: 400, bottom: 1000 }, box)).toBe(200);
	});
});

describe("the copy stays inside the column", () => {
	it("covers only what the column shows", () => {
		const clipped = clipTo(new DOMRect(10, 200, 100, 800), box);
		expect([clipped.top, clipped.height]).toEqual([200, 500]);
	});

	it("is pulled up only as far as a grown copy needs, never over the top", () => {
		expect(topInside(300, 60, box)).toBe(300);
		expect(topInside(680, 60, box)).toBe(640);
		expect(topInside(250, 800, box)).toBe(200);
	});
});
