// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { type GlideEnd, ScrollGlide } from "../../obsidian/ui/quick/ScrollGlide";

const glide = { ms: 100, ease: (t: number) => t, rise: 0 };

/** A scroller that can go down `room` px at most. */
function scroller(room: number): HTMLElement {
	const el = document.body.appendChild(document.createElement("div"));
	let top = 0;
	Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = Math.max(0, Math.min(v, room))) });
	return el;
}

describe("a glide ends exactly once, and says how", () => {
	afterEach(() => vi.useRealTimers());

	it("gets there", () => {
		vi.useFakeTimers();
		const ends: GlideEnd[] = [];
		new ScrollGlide().start(scroller(500), 200, glide, () => {}, (how) => ends.push(how));
		vi.advanceTimersByTime(1000);
		expect(ends).toEqual(["arrived"]);
	});

	it("stops short where its content ends", () => {
		vi.useFakeTimers();
		const ends: GlideEnd[] = [];
		new ScrollGlide().start(scroller(50), 200, glide, () => {}, (how) => ends.push(how));
		vi.advanceTimersByTime(1000);
		expect(ends).toEqual(["blocked"]);
	});

	it("is interrupted by the next glide, stopped by its owner, taken by a finger", () => {
		vi.useFakeTimers();
		const ends: GlideEnd[] = [];
		const g = new ScrollGlide();
		const el = scroller(500);
		g.start(el, 200, glide, () => {}, (how) => ends.push(how));
		g.start(el, 300, glide, () => {}, (how) => ends.push(how));
		g.stop("finger");
		g.start(el, 100, glide, () => {}, (how) => ends.push(how));
		g.stop();
		vi.advanceTimersByTime(1000);
		expect(ends).toEqual(["interrupted", "finger", "stopped"]);
	});
});
