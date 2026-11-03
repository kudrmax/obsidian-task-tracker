// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { DayPeek } from "../../src/ui/DayPeek";
import { type DayLane, DayTrack } from "../../src/ui/ScreenTracks";

const part = () => document.createElement("div");

function setUp() {
	const list: DayLane = { shown: [part()], next: [part()], width: 100 };
	const timeline: DayLane = { shown: [part(), part()], next: [part()], width: 200 };
	const header: DayLane = { shown: [part()], next: [part()], width: 100, fades: true };
	let removed = false;
	const peek = { remove: () => (removed = true) } as unknown as DayPeek;
	const arrivals: (readonly HTMLElement[])[] = [];
	const track = new DayTrack([list, timeline, header], timeline, peek, 1, (_, shown) => arrivals.push(shown));
	return { list, timeline, header, track, arrivals, removed: () => removed };
}

const x = (el: HTMLElement) => el.style.transform.match(/translate3d\((-?[\d.]+)px/)?.[1] ?? "0";

describe("a day's swipe", () => {
	it("keeps each column in its place: the day slides within it, the next one coming in from its own edge", () => {
		const { list, timeline, track } = setUp();
		expect([x(list.next[0]), x(timeline.next[0])]).toEqual(["100", "200"]);
		track.at(-100);
		expect([x(list.shown[0]), x(list.next[0])]).toEqual(["-50", "50"]);
		expect(timeline.shown.map(x)).toEqual(["-100", "-100"]);
		expect(x(timeline.next[0])).toBe("100");
	});

	it("follows the finger with the column it leads by, the whole way to the next day", () => {
		const { track, timeline } = setUp();
		expect(track.distance).toBe(200);
		track.at(-200);
		expect(x(timeline.next[0])).toBe("0");
	});

	it("fades the header out as the next day's fades in", () => {
		const { header, track } = setUp();
		expect(header.next[0].style.opacity).toBe("0");
		track.at(-50);
		expect([header.shown[0].style.opacity, header.next[0].style.opacity]).toEqual(["0.75", "0.25"]);
	});

	it("puts everything back and drops the next day when it goes back", () => {
		const { list, header, track, removed } = setUp();
		track.at(-80);
		track.land(false);
		expect(x(list.shown[0])).toBe("0");
		expect(header.shown[0].style.opacity).toBe("");
		expect(removed()).toBe(true);
	});

	it("hands over what the screen showed when it arrives, still out of sight", () => {
		const { list, timeline, header, track, arrivals, removed } = setUp();
		track.at(-200);
		track.land(true);
		expect(arrivals).toEqual([[...list.shown, ...timeline.shown, ...header.shown]]);
		expect(x(list.shown[0])).toBe("-100");
		expect(removed()).toBe(false);
	});
});
