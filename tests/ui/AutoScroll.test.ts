// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { AutoScroll, edgeVelocity, type Frames } from "../../src/ui/drag/AutoScroll";
import { LAYOUT } from "../../src/ui/design";

const EDGE = LAYOUT.autoScrollEdge;
const SPEED = LAYOUT.autoScrollSpeed;

class ManualFrames implements Frames {
	private queue = new Map<number, () => void>();
	private next = 1;
	request(fn: () => void): number {
		this.queue.set(this.next, fn);
		return this.next++;
	}
	cancel(id: number): void {
		this.queue.delete(id);
	}
	get pending(): number {
		return this.queue.size;
	}
	tick(): void {
		const due = [...this.queue.values()];
		this.queue.clear();
		for (const fn of due) fn();
	}
}

function scroller(top: number, bottom: number, room: number): HTMLElement {
	const el = document.createElement("div");
	el.getBoundingClientRect = () => new DOMRect(0, top, 100, bottom - top);
	let scrollTop = 0;
	Object.defineProperty(el, "scrollTop", { get: () => scrollTop, set: (v: number) => (scrollTop = Math.max(0, Math.min(room, v))) });
	return el;
}

describe("edgeVelocity", () => {
	it("is still away from the edges", () => {
		expect(edgeVelocity(300, 100, 600)).toBe(0);
		expect(edgeVelocity(100 + EDGE, 100, 600)).toBe(0);
		expect(edgeVelocity(600 - EDGE, 100, 600)).toBe(0);
	});

	it("scrolls up near the top and down near the bottom, faster the closer to the edge", () => {
		expect(edgeVelocity(100 + EDGE / 2, 100, 600)).toBeCloseTo(-SPEED / 2);
		expect(edgeVelocity(100, 100, 600)).toBeCloseTo(-SPEED);
		expect(edgeVelocity(600 - EDGE / 4, 100, 600)).toBeCloseTo((SPEED * 3) / 4);
		expect(Math.abs(edgeVelocity(600 - 5, 100, 600))).toBeGreaterThan(Math.abs(edgeVelocity(600 - 30, 100, 600)));
	});

	it("goes at full speed past an edge: a finger over the column's title, or under the list", () => {
		expect(edgeVelocity(40, 100, 600)).toBe(-SPEED);
		expect(edgeVelocity(700, 100, 600)).toBe(SPEED);
	});
});

describe("AutoScroll", () => {
	it("scrolls a frame at a time while the finger holds near an edge, previewing the drop again after each step", () => {
		const frames = new ManualFrames();
		const el = scroller(100, 600, 1000);
		let previews = 0;
		const scroll = new AutoScroll(() => el, () => {
			previews++;
			scroll.follow(600);
		}, frames);
		scroll.follow(600);
		frames.tick();
		frames.tick();
		frames.tick();
		expect(el.scrollTop).toBe(3 * SPEED);
		expect(previews).toBe(3);
	});

	it("plans one step per frame however often the finger moves", () => {
		const frames = new ManualFrames();
		const scroll = new AutoScroll(() => scroller(100, 600, 1000), () => {}, frames);
		scroll.follow(599);
		scroll.follow(598);
		expect(frames.pending).toBe(1);
	});

	it("stops when the finger leaves the edge, and when the end of the list is reached", () => {
		const frames = new ManualFrames();
		const el = scroller(100, 600, SPEED);
		let previews = 0;
		const scroll = new AutoScroll(() => el, () => previews++, frames);
		scroll.follow(600);
		scroll.follow(300);
		expect(frames.pending).toBe(0);
		scroll.follow(600);
		frames.tick();
		scroll.follow(600);
		frames.tick();
		expect(el.scrollTop).toBe(SPEED);
		expect(previews).toBe(1);
	});
});
