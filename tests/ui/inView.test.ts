// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { clipTo, scrollIntoColumn, scrollToShow, topInside } from "../../src/ui/menu/inView";

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

describe("the column scrolls to what was pressed with its own smooth scroll, then the menu opens", () => {
	afterEach(() => {
		vi.useRealTimers();
		document.body.innerHTML = "";
	});

	const column = (itemTop: number) => {
		const scroller = document.body.appendChild(document.createElement("div"));
		scroller.style.overflowY = "auto";
		const item = scroller.appendChild(document.createElement("div"));
		scroller.getBoundingClientRect = () => new DOMRect(0, 200, 300, 500);
		item.getBoundingClientRect = () => new DOMRect(0, itemTop, 300, 40);
		const scrollBy = vi.fn();
		scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
		return { scroller, item, scrollBy };
	};

	it("opens at once on what is in view, with no scroll", () => {
		const { item, scrollBy } = column(300);
		const then = vi.fn();
		scrollIntoColumn(item, then);
		expect(then).toHaveBeenCalledOnce();
		expect(scrollBy).not.toHaveBeenCalled();
	});

	it("scrolls smoothly and opens once the column has stood still", () => {
		vi.useFakeTimers();
		const { scroller, item, scrollBy } = column(150);
		const then = vi.fn();
		scrollIntoColumn(item, then, 100);
		expect(scrollBy).toHaveBeenCalledWith({ top: -50, behavior: "smooth" });
		vi.advanceTimersByTime(80);
		scroller.dispatchEvent(new Event("scroll"));
		vi.advanceTimersByTime(80);
		expect(then).not.toHaveBeenCalled();
		vi.advanceTimersByTime(30);
		expect(then).toHaveBeenCalledOnce();
	});

	it("opens on the column's scroll end, and nothing once called off", () => {
		const { scroller, item } = column(150);
		const then = vi.fn();
		scrollIntoColumn(item, then);
		scroller.dispatchEvent(new Event("scrollend"));
		expect(then).toHaveBeenCalledOnce();
		const later = vi.fn();
		const stop = scrollIntoColumn(column(150).item, later);
		stop();
		expect(later).not.toHaveBeenCalled();
	});
});
