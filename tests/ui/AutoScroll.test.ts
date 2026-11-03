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

/** The scroller's box, from 100 to 600, as the caller reads it before the move. */
const BOX = new DOMRect(0, 100, 100, 500);

function scroller(room: number): HTMLElement {
	const el = document.createElement("div");
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
		const el = scroller(1000);
		let previews = 0;
		const scroll = new AutoScroll(() => el, () => {
			previews++;
			scroll.follow(600, BOX);
		}, frames);
		scroll.follow(590, BOX);
		scroll.follow(600, BOX);
		frames.tick();
		frames.tick();
		frames.tick();
		expect(el.scrollTop).toBe(3 * SPEED);
		expect(previews).toBe(3);
	});

	it("plans one step per frame however often the finger moves", () => {
		const frames = new ManualFrames();
		const scroll = new AutoScroll(() => scroller(1000), () => {}, frames);
		scroll.follow(597, BOX);
		scroll.follow(598, BOX);
		scroll.follow(599, BOX);
		expect(frames.pending).toBe(1);
	});

	it("stops when the finger leaves the edge, and when the end of the list is reached", () => {
		const frames = new ManualFrames();
		const el = scroller(SPEED);
		let previews = 0;
		const scroll = new AutoScroll(() => el, () => previews++, frames);
		scroll.follow(590, BOX);
		scroll.follow(600, BOX);
		scroll.follow(300, BOX);
		expect(frames.pending).toBe(0);
		scroll.follow(600, BOX);
		frames.tick();
		scroll.follow(600, BOX);
		frames.tick();
		expect(el.scrollTop).toBe(SPEED);
		expect(previews).toBe(1);
	});

	it("leaves the list where it is under a finger that lifts a card near the edge and stays", () => {
		const frames = new ManualFrames();
		const scroll = new AutoScroll(() => scroller(1000), () => {}, frames);
		scroll.follow(590, BOX);
		scroll.follow(590, BOX);
		expect(frames.pending).toBe(0);
		scroll.follow(592, BOX);
		expect(frames.pending).toBe(1);
	});

	it("leaves the list where it is under a finger carried in across an edge, away from it", () => {
		const frames = new ManualFrames();
		const scroll = new AutoScroll(() => scroller(1000), () => {}, frames);
		scroll.follow(620, BOX);
		scroll.follow(595, BOX);
		scroll.follow(580, BOX);
		expect(frames.pending).toBe(0);
		scroll.stop();
		scroll.follow(110, BOX);
		expect(frames.pending).toBe(0);
		scroll.follow(105, BOX);
		expect(frames.pending).toBe(1);
	});
});
