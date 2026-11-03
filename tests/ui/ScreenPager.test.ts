// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenPager, type ScreenTrack } from "../../src/ui/ScreenPager";
import type { Shift } from "../../src/ui/screens";
import { edgeGive } from "../../src/ui/ScreenTracks";

const WIDTH = 400;
const SLIDE_MS = 300;

const last = (shown: readonly number[] | undefined): number | undefined => shown?.[shown.length - 1];

interface FakeTrack extends ScreenTrack {
	readonly shown: number[];
	readonly landed: boolean[];
}

function fakeTrack(distance: number | null): FakeTrack {
	const shown: number[] = [];
	const landed: boolean[] = [];
	return { distance, shown, landed, at: (dx) => shown.push(dx), land: (arrived) => landed.push(arrived) };
}

function setUp(ends: readonly Shift[] = []) {
	const tracks = new Map<Shift, FakeTrack>();
	const made: Shift[] = [];
	const pager = new ScreenPager({
		track: (shift) => {
			made.push(shift);
			const track = fakeTrack(ends.includes(shift) ? null : WIDTH);
			tracks.set(shift, track);
			return track;
		},
		duration: () => SLIDE_MS,
		width: () => WIDTH,
	});
	return { pager, tracks, made };
}

describe("ScreenPager", () => {
	beforeEach(() => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] }));
	afterEach(() => vi.useRealTimers());

	it("draws the screen along the track of the way the finger goes, and each way along its own", () => {
		const { pager, tracks, made } = setUp();
		pager.follow(-30);
		pager.follow(-80);
		pager.follow(40);
		pager.follow(-10);
		expect(made).toEqual([1, -1]);
		expect(tracks.get(1)?.shown).toEqual([-30, -80, 0, -10]);
		expect(tracks.get(-1)?.shown).toEqual([40, 0]);
	});

	it("runs on to the next screen once let go, slowing down, and stands there", async () => {
		const { pager, tracks } = setUp();
		pager.follow(-100);
		let stood = false;
		void pager.settle(1).then(() => (stood = true));
		vi.advanceTimersByTime(SLIDE_MS / 4);
		const track = tracks.get(1)!;
		const midway = track.shown[track.shown.length - 1];
		expect(midway).toBeLessThan(-100);
		expect(midway).toBeGreaterThan(-WIDTH);
		vi.advanceTimersByTime(SLIDE_MS);
		await Promise.resolve();
		expect(track.shown[track.shown.length - 1]).toBe(-WIDTH);
		expect(track.landed).toEqual([true]);
		expect(stood).toBe(true);
	});

	it("runs back to where it stood, and the other way's track goes too", async () => {
		const { pager, tracks } = setUp();
		pager.follow(50);
		pager.follow(-60);
		const done = pager.settle(null);
		vi.advanceTimersByTime(SLIDE_MS);
		await done;
		expect(last(tracks.get(1)?.shown)).toBe(0);
		expect(tracks.get(1)?.landed).toEqual([false]);
		expect(tracks.get(-1)?.landed).toEqual([false]);
	});

	it("takes as long as the share of the way left to go", () => {
		const { pager, tracks } = setUp();
		pager.follow(-(WIDTH * 3) / 4);
		void pager.settle(1);
		vi.advanceTimersByTime(SLIDE_MS / 4 + 40);
		expect(tracks.get(1)?.landed).toEqual([true]);
	});

	it("never arrives past the row's end", async () => {
		const { pager, tracks } = setUp([-1]);
		pager.follow(120);
		const done = pager.settle(-1);
		vi.advanceTimersByTime(SLIDE_MS);
		await done;
		expect(tracks.get(-1)?.landed).toEqual([false]);
		expect(last(tracks.get(-1)?.shown)).toBe(0);
	});

	it("puts the screen where it was going at once when a new swipe starts while it runs", () => {
		const { pager, tracks, made } = setUp();
		pager.follow(-200);
		void pager.settle(1);
		vi.advanceTimersByTime(SLIDE_MS / 10);
		const first = tracks.get(1)!;
		pager.follow(-20);
		expect(first.landed).toEqual([true]);
		expect(last(first.shown)).toBe(-WIDTH);
		expect(made).toEqual([1, 1]);
		expect(tracks.get(1)?.shown).toEqual([-20]);
	});

	it("stands once its time is up even when no frame comes, as on a page out of sight", async () => {
		vi.useRealTimers();
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		const frames = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
		const { pager, tracks } = setUp();
		pager.follow(-200);
		const done = pager.settle(1);
		vi.advanceTimersByTime(SLIDE_MS);
		await done;
		expect(tracks.get(1)?.landed).toEqual([true]);
		frames.mockRestore();
	});

	it("stands at once when let go without being drawn", async () => {
		const { pager, made } = setUp();
		await pager.settle(null);
		expect(made).toEqual([]);
	});
});

describe("past the row's end", () => {
	it("the screen gives less and less, and never a whole width", () => {
		const gives = [50, 200, 400, 4000].map((dx) => edgeGive(dx, WIDTH));
		for (let i = 1; i < gives.length; i++) expect(gives[i]).toBeGreaterThan(gives[i - 1]);
		expect(gives[0]).toBeLessThan(50);
		expect(gives[3]).toBeLessThan(WIDTH);
		expect(edgeGive(-200, WIDTH)).toBe(-gives[1]);
		expect(edgeGive(0, WIDTH)).toBe(0);
	});
});
