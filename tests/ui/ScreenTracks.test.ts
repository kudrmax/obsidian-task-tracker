// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { DayPeek } from "../../src/ui/DayPeek";
import { type DayLane, DayTrack } from "../../src/ui/ScreenTracks";

const part = () => document.createElement("div");

function lane(width: number, shown = [part()], next = [part()]): DayLane & { readonly parts: { shown: HTMLElement[]; next: HTMLElement[] } } {
	const parts = { shown, next };
	return { shown: () => parts.shown, next: () => parts.next, width, parts };
}

function setUp() {
	const list = lane(100);
	const timeline = lane(200, [part(), part()]);
	let removed = false;
	const peek = { remove: () => (removed = true) } as unknown as DayPeek;
	const arrivals: (readonly HTMLElement[])[] = [];
	const nearer: boolean[] = [];
	const track = new DayTrack([list, timeline], timeline, peek, 1, { onNearer: (n) => nearer.push(n), onArrive: (_, shown) => arrivals.push(shown) });
	return { list, timeline, track, arrivals, nearer, removed: () => removed };
}

const x = (el: HTMLElement) => el.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1] ?? "0";

describe("a day's swipe", () => {
	it("keeps each column in its place: the day slides within it, the next one coming in from its own edge", () => {
		const { list, timeline, track } = setUp();
		expect([x(list.parts.next[0]), x(timeline.parts.next[0])]).toEqual(["100", "200"]);
		track.at(-100);
		expect([x(list.parts.shown[0]), x(list.parts.next[0])]).toEqual(["-50", "50"]);
		expect(timeline.parts.shown.map(x)).toEqual(["-100", "-100"]);
		expect(x(timeline.parts.next[0])).toBe("100");
	});

	it("shows each part only within its own place, as through a window", () => {
		const { timeline, track } = setUp();
		track.at(-60);
		expect(timeline.parts.shown[0].style.clipPath).toBe("inset(0 0px 0 60px)");
		expect(timeline.parts.next[0].style.clipPath).toBe("inset(0 140px 0 0px)");
	});

	it("moves a part drawn anew while the finger moves", () => {
		const { timeline, track } = setUp();
		const drawn = part();
		timeline.parts.next = [drawn];
		track.at(-50);
		expect(x(drawn)).toBe("150");
	});

	it("follows the finger with the column it leads by, the whole way to the next day", () => {
		const { track, timeline } = setUp();
		expect(track.distance).toBe(200);
		track.at(-200);
		expect(x(timeline.parts.next[0])).toBe("0");
	});

	it("names the next day in the header once it stands nearer, and the shown day again once it does", () => {
		const { track, nearer } = setUp();
		track.at(-90);
		track.at(-110);
		track.at(-150);
		track.at(-80);
		expect(nearer).toEqual([true, false]);
	});

	it("puts everything back, drops the next day and names the shown day when it goes back", () => {
		const { list, track, nearer, removed } = setUp();
		track.at(-150);
		track.land(false);
		expect(x(list.parts.shown[0])).toBe("0");
		expect(list.parts.shown[0].style.clipPath).toBe("");
		expect(removed()).toBe(true);
		expect(nearer).toEqual([true, false]);
	});

	it("hands over what the screen showed when it arrives, still out of sight", () => {
		const { list, timeline, track, arrivals, removed } = setUp();
		track.at(-200);
		track.land(true);
		expect(arrivals).toEqual([[...list.parts.shown, ...timeline.parts.shown]]);
		expect(x(list.parts.shown[0])).toBe("-100");
		expect(removed()).toBe(false);
	});
});
