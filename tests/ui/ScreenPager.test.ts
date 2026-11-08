// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScreenPager, type ScreenTrack } from "../../obsidian/ui/ScreenPager";
import type { Shift } from "../../obsidian/ui/screens";
import { edgeGive, edgeParts } from "../../obsidian/ui/ScreenTracks";

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

	it("draws the screen along the track of the way the finger goes, one way at a time", () => {
		const made: Shift[] = [];
		const tracks: FakeTrack[] = [];
		const built = new ScreenPager({
			track: (shift) => {
				made.push(shift);
				const track = fakeTrack(WIDTH);
				tracks.push(track);
				return track;
			},
			duration: () => SLIDE_MS,
			width: () => WIDTH,
		});
		built.follow(-30);
		built.follow(-80);
		built.follow(40);
		built.follow(-10);
		expect(made).toEqual([1, -1, 1]);
		expect(tracks.map((track) => track.shown)).toEqual([[-30, -80], [40], [-10]]);
		expect(tracks.map((track) => track.landed)).toEqual([[false], [false], []]);
	});

	it("puts the other way away before it draws a new one, so the new way is measured from the screen as it stands", () => {
		const events: string[] = [];
		const pager = new ScreenPager({
			track: (shift) => {
				events.push(`make ${shift}`);
				return { distance: WIDTH, at: () => undefined, land: (arrived) => events.push(`land ${shift} ${arrived}`) };
			},
			duration: () => SLIDE_MS,
			width: () => WIDTH,
		});
		pager.distance(-1);
		pager.follow(-12);
		expect(events).toEqual(["make -1", "land -1 false", "make 1"]);
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

	it("runs the whole way with no finger along the track it is given, as one let go at its start, over the slide's time", async () => {
		const { pager, made } = setUp();
		const given = fakeTrack(WIDTH);
		let stood = false;
		void pager.run(-1, () => given).then(() => (stood = true));
		expect(made).toEqual([]);
		vi.advanceTimersByTime(SLIDE_MS / 4);
		const midway = last(given.shown) ?? 0;
		expect(midway).toBeGreaterThan(0);
		expect(midway).toBeLessThan(WIDTH);
		expect(given.landed).toEqual([]);
		vi.advanceTimersByTime(SLIDE_MS);
		await Promise.resolve();
		expect(last(given.shown)).toBe(WIDTH);
		expect(given.landed).toEqual([true]);
		expect(stood).toBe(true);
	});

	it("lets a running slide run on to its place, never put there in one frame, and only then runs the next", async () => {
		const { pager } = setUp();
		const first = fakeTrack(WIDTH);
		const second = fakeTrack(WIDTH);
		void pager.run(1, () => first);
		vi.advanceTimersByTime(SLIDE_MS / 10);
		const order: string[] = [];
		void pager.run(1, () => {
			order.push(`first landed ${first.landed.join()}`);
			return second;
		});
		expect(order).toEqual([]);
		expect(Math.abs(last(first.shown) ?? 0)).toBeLessThan(WIDTH);
		vi.advanceTimersByTime(SLIDE_MS * 2);
		await Promise.resolve();
		await Promise.resolve();
		expect(order).toEqual(["first landed true"]);
		expect(first.shown.slice(-1)).toEqual([-WIDTH]);
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

describe("the row's end", () => {
	const strip = () => {
		const root = document.createElement("div");
		for (const cls of ["tc-done", "tc-inbox", "tc-soon", "tc-left", "tc-right", "tc-divider", "tc-head is-done", "tc-head is-inbox", "tc-divider is-fixed is-done", "tc-divider is-fixed is-inbox"]) {
			const part = document.createElement("div");
			part.className = cls;
			root.appendChild(part);
		}
		return root;
	};
	const names = (parts: readonly HTMLElement[]) => parts.map((part) => part.className);

	it("gives without Done, which waits beside Inbox for the search only", () => {
		const given = names(edgeParts(strip(), "inbox"));
		expect(given).not.toContain("tc-done");
		expect(given).not.toContain("tc-head is-done");
		expect(given).not.toContain("tc-divider is-fixed is-done");
		expect(given).toContain("tc-divider is-fixed is-inbox");
		expect(given).toContain("tc-inbox");
		expect(given).toContain("tc-head is-inbox");
	});

	it("gives with Done while Done is the place that stands", () => {
		expect(names(edgeParts(strip(), "done"))).toEqual(expect.arrayContaining(["tc-done", "tc-head is-done", "tc-divider is-fixed is-done"]));
	});
});
