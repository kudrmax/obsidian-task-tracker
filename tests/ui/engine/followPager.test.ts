import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLICK_SPEED, FollowPager } from "../../../obsidian/ui/engine/gestures/followPager";
import { WheelFollow } from "../../../obsidian/ui/engine/gestures/wheelFollow";
import { COLUMN_SHARE, DayLine, offsetOf, shownAt, STRIP_WIDTH } from "../../../obsidian/ui/engine/layout/columns";
import { createScreenStore, type ScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);
const RECORDINGS = join(__dirname, "..", "..", "e2e", "recordings");

/** A finger's stroke from a pager standing at a place: drawn `moved` px (positive on), let go at a flick's sign; the places it moved. */
function swipeStep(moved: number, width: number, flick: number): number {
	const pager = new FollowPager(5, Infinity);
	pager.begin(5, true);
	return pager.release(pager.move(moved, width), flick * FLICK_SPEED, width) - 5;
}

/** The ribbon of a screen just opened, as `useFollowRibbon` runs it: its pager starts where the store stands, and each stroke's landing is where the store stands from then on. */
function ribbon(store: ScreenStore) {
	const width = 195;
	const { stop, dayOffset } = store.getState();
	const line = DayLine.plain(dayOffset);
	const pager = new FollowPager(line.placeOf(stop, dayOffset), Infinity);
	return {
		step(shift: -1 | 1) {
			pager.begin(pager.stop, true);
			line.standAt(store.getState(), pager.release(pager.move(shift * width, width), 0, width));
		},
	};
}

async function screen() {
	return createScreenStore((await standPort(NOW)).port);
}

/**
 * Max asked twice (CLAUDE.md, «Behaviours Max had to ask for twice»): one swipe of the lists moves them one place, never
 * two, from the very first swipe after launch. In the engine the swipe's rule is `FollowPager`, the ribbon's one pager on
 * every stop (moved here from the stage-0 pager's `swipeStep` and `store.step`, Decision 129), and where it lands is where
 * the store stands (`DayLine.standAt`).
 */
describe("one swipe, one place (Max)", () => {
	it("a swipe goes at most one place whatever its length or speed", () => {
		for (const moved of [-900, -300, -100, -10, 0, 10, 100, 300, 900]) for (const flick of [-1, 0, 1]) expect(Math.abs(swipeStep(moved, 195, flick))).toBeLessThanOrEqual(1);
		expect(swipeStep(400, 195, 0)).toBe(1);
		expect(swipeStep(90, 195, 0)).toBe(0);
		expect(swipeStep(20, 195, 1)).toBe(1);
		expect(swipeStep(-20, 195, -1)).toBe(-1);
	});

	it("the first step after the screen opens moves the ribbon one stop", async () => {
		const store = await screen();
		const { step } = ribbon(store);
		expect(store.getState().stop).toBe("calendar");
		step(-1);
		expect(store.getState().stop).toBe("soon");
		step(-1);
		expect(store.getState().stop).toBe("inbox");
		step(-1);
		expect(store.getState().stop).toBe("inbox");
	});

	it("past the day's calendar a step turns the day, and back on today returns to Soon", async () => {
		const store = await screen();
		const { step } = ribbon(store);
		step(1);
		expect(store.getState()).toMatchObject({ stop: "calendar", dayOffset: 1 });
		expect(store.getState().shown.day.title).toBe("Tomorrow");
		step(-1);
		expect(store.getState()).toMatchObject({ stop: "calendar", dayOffset: 0 });
		step(-1);
		expect(store.getState().stop).toBe("soon");
	});
});

/**
 * Max asked twice: at Inbox and at Soon the two columns split the screen in half. The ribbon's strip (`RibbonTrack` in
 * `Layout.tsx`) is `STRIP_WIDTH` of the window, each column `COLUMN_SHARE` of it, and it stands at `offsetOf` its stop
 * (through `DayLine.placeOf`, where the pager lands).
 */
describe("halves at Inbox and Soon (Max)", () => {
	it("each shown column is half the window", () => {
		for (const stop of ["inbox", "soon"] as const) {
			expect(shownAt(stop)).toHaveLength(2);
			expect((STRIP_WIDTH * COLUMN_SHARE) / 100).toBe(50);
		}
		expect(shownAt("inbox")).toEqual(["inbox", "soon"]);
		expect(shownAt("soon")).toEqual(["soon", "day"]);
		expect(shownAt("calendar")).toEqual(["day", "timeline"]);
		expect([offsetOf("inbox"), offsetOf("soon"), offsetOf("calendar")]).toEqual([0, 1, 2]);
	});

	it("is where the ribbon stands at each stop", () => {
		for (const stop of ["inbox", "soon", "calendar"] as const) expect(DayLine.plain(0).placeOf(stop, 0)).toBe(offsetOf(stop));
	});
});

/**
 * Max asked twice: one place a stroke from the very first stroke after the screen opens, a finger on glass and two on
 * the trackpad alike (the trackpad's own first touch: `trackpadFollow.test.ts`).
 */
describe("FollowPager: one place a stroke from the first (Max)", () => {
	it("takes a finger's very first stroke one place, however far or fast it went", () => {
		for (const moved of [-2000, -400, 400, 2000])
			for (const flick of [0, 1, -1]) {
				const pager = new FollowPager(2, Infinity);
				pager.begin(2, true);
				const to = pager.release(pager.move(moved, 195), flick * 5, 195);
				expect(Math.abs(to - 2)).toBeLessThanOrEqual(1);
				if (flick === 0 || flick === Math.sign(moved)) expect(to - 2).toBe(Math.sign(moved));
			}
	});

	it("takes the very first stroke of two fingers on the trackpad one place, then each of Max's swipes one", () => {
		const { w, events } = JSON.parse(readFileSync(join(RECORDINGS, "max-2026-11-17.json"), "utf8")) as { w: number; events: { type: string; t: number; dx?: number; dy?: number; ctrl?: boolean }[] };
		const fingers = new WheelFollow();
		const pager = new FollowPager(1, Infinity);
		const width = w / 2;
		let at = 1;
		const steps: number[] = [];
		for (const e of events.filter((e) => e.type === "wheel"))
			for (const cue of [...fingers.feed({ dx: e.dx ?? 0, dy: e.dy ?? 0, t: e.t, ctrl: e.ctrl }), ...fingers.tick(e.t)]) {
				if (cue.kind === "begin") pager.begin(at, cue.fresh);
				else if (cue.kind === "move") at = pager.move(cue.dx, width);
				else {
					const from = pager.stop;
					at = pager.release(at, cue.speed, width);
					steps.push(at - from);
				}
			}
		expect(steps[0]).toBe(-1);
		expect(steps.every((s) => Math.abs(s) <= 1)).toBe(true);
	});
});

describe("the gallery's rule", () => {
	const width = 400;

	it("held mid-way and let go: under half back, past half on", () => {
		const under = new FollowPager(1, 2);
		under.begin(1, true);
		expect(under.release(under.move(150, width), 0, width)).toBe(1);
		const past = new FollowPager(1, 2);
		past.begin(1, true);
		expect(past.release(past.move(-250, width), 0, width)).toBe(0);
	});

	it("a flick goes one place its way, however little drawn, never two", () => {
		const pager = new FollowPager(0, 2);
		pager.begin(0, true);
		expect(pager.move(2000, width)).toBe(1);
		expect(pager.release(1, 5, width)).toBe(1);
	});

	it("a flick against the way drawn springs back", () => {
		const pager = new FollowPager(1, 2);
		pager.begin(1, true);
		expect(pager.release(pager.move(60, width), -1, width)).toBe(1);
	});

	it("two quick flicks the same way, the second during the first's landing, go two places, one each", () => {
		const pager = new FollowPager(0, 2);
		pager.begin(0, true);
		expect(pager.release(pager.move(80, width), 2, width)).toBe(1);
		pager.begin(0.6, true);
		expect(pager.release(pager.move(60, width), 2, width)).toBe(2);
	});

	it("the same stroke going on after a lift that was not one keeps its own place", () => {
		const pager = new FollowPager(0, 2);
		pager.begin(0, true);
		expect(pager.release(pager.move(60, width), 2, width)).toBe(1);
		pager.begin(0.2, false);
		expect(pager.move(2000, width)).toBe(1);
		expect(pager.release(1, 2, width)).toBe(1);
	});

	it("stops at the row's ends", () => {
		const pager = new FollowPager(0, 2);
		pager.begin(0, true);
		expect(pager.move(-300, width)).toBe(0);
		expect(pager.release(0, -3, width)).toBe(0);
	});
});

describe("the ribbon's drag, on @use-gesture's documented options (review of part 1, finding 18)", () => {
	const source = readFileSync(join(__dirname, "..", "..", "..", "obsidian", "ui", "engine", "gestures", "FollowRibbon.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

	it("leaves taps unfiltered by not asking for the filter, never by taking off a handler by the library's internal name", () => {
		expect(source).not.toMatch(/onClickCapture/);
		expect(source).not.toMatch(/filterTaps\s*:\s*true/);
		expect(source).toMatch(/threshold:/);
	});

	it("reads the drawn widths through the layout's one reader", () => {
		expect(source).not.toMatch(/clientWidth/);
		expect(source).toMatch(/drawnWidths\(/);
	});
});
