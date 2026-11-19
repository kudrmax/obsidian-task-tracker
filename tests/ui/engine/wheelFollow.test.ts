import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FollowPager } from "../../../obsidian/ui/engine/gestures/followPager";
import { type WheelCue, WheelFollow } from "../../../obsidian/ui/engine/gestures/wheelFollow";
import { WheelStrokes } from "../../../obsidian/ui/engine/gestures/wheelStrokes";

const RECORDINGS = join(__dirname, "..", "..", "e2e", "recordings");

interface Wheel {
	readonly dx: number;
	readonly dy: number;
	readonly t: number;
	readonly ctrl?: boolean;
}

function recording(file: string): { readonly width: number; readonly wheels: Wheel[] } {
	const { w, events } = JSON.parse(readFileSync(join(RECORDINGS, file), "utf8")) as { w: number; events: { type: string; t: number; dx?: number; dy?: number; ctrl?: boolean }[] };
	return { width: w / 2, wheels: events.filter((e) => e.type === "wheel").map((e) => ({ dx: e.dx ?? 0, dy: e.dy ?? 0, t: e.t, ctrl: e.ctrl })) };
}

/** The strip's landing spring (stiffness 1400, damping 75: critically damped), as the ribbon's Motion spring runs it. */
const OMEGA = Math.sqrt(1400) / 1000;

interface Run {
	/** Each landing decided, as a step from the place before. */
	readonly steps: number[];
	/** The furthest any stroke's landing lay from the place it began at. */
	readonly furthest: number;
	/** Columns moved between a lift and the next stroke: the momentum moving them. */
	readonly movedInMomentum: number;
}

/** Max's wheel events through the trackpad's cues and the gallery's rule, unbounded on either side, as the ribbon runs them. */
function follow(wheels: readonly Wheel[], width: number): Run {
	const fingers = new WheelFollow();
	const pager = new FollowPager(1000, 2000);
	let at = 1000;
	let landing: { from: number; to: number; t: number } | null = null;
	let origin = 1000;
	let furthest = 0;
	let movedInMomentum = 0;
	const steps: number[] = [];
	const stand = (t: number) => (landing ? landing.to + (landing.from - landing.to) * (1 + OMEGA * (t - landing.t)) * Math.exp(-OMEGA * (t - landing.t)) : at);
	const apply = (cues: readonly WheelCue[]) => {
		for (const cue of cues) {
			if (cue.kind === "begin") {
				at = stand(cue.t);
				landing = null;
				if (cue.fresh) origin = pager.stop;
				/** The same stroke going on takes back the landing its false lift decided. */
				else if (pager.stop !== origin) steps.pop();
				pager.begin(at, cue.fresh);
			} else if (cue.kind === "move") {
				if (!pager.following) movedInMomentum++;
				at = pager.move(cue.dx, width);
			} else {
				const was = pager.stop;
				const to = pager.release(at, cue.speed, width);
				if (to !== was) steps.push(to - was);
				furthest = Math.max(furthest, Math.abs(to - origin));
				landing = { from: at, to, t: cue.t };
			}
		}
	};
	for (const e of wheels) {
		apply(fingers.tick(e.t));
		apply(fingers.feed(e));
	}
	apply(fingers.tick(Infinity));
	return { steps, furthest, movedInMomentum };
}

const run = (file: string) => {
	const { wheels, width } = recording(file);
	return follow(wheels, width);
};

/** The page's wheel events as a browser drawing `hz` frames a second hands them over: a frame's events one, their deltas summed. */
function mergedPerFrame(wheels: readonly Wheel[], hz: number): Wheel[] {
	const merged: (Wheel & { frame: number })[] = [];
	for (const e of wheels) {
		const frame = Math.floor((e.t * hz) / 1000);
		const last = merged[merged.length - 1];
		if (last && last.frame === frame && Math.sign(last.dx) === Math.sign(e.dx) && !!last.ctrl === !!e.ctrl) merged[merged.length - 1] = { ...last, dx: last.dx + e.dx, dy: last.dy + e.dy, t: e.t };
		else merged.push({ ...e, frame });
	}
	return merged;
}

/** The longest run of `a`'s steps found in order in `b`. */
function common(a: readonly number[], b: readonly number[]): number {
	let row = new Array<number>(b.length + 1).fill(0);
	for (const x of a) {
		const next = [0];
		for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
		row = next;
	}
	return row[b.length];
}

/**
 * The ribbon follows two fingers on the trackpad as one finger on glass (Max, 2026-11-19: «что пальцем по экрану, что
 * пальцем по трекпаду — абсолютно одно и то же действие»; stage0.md, «Round seven»): the columns follow the fingers, at
 * the lift (the OS's momentum beginning) they land on the nearest place or one on by the speed, never two; the momentum
 * moves nothing; a touch during it is a new stroke.
 */
describe("the trackpad followed as a finger", () => {
	it("lands Max's six recorded swipes one place each, each its way", () => {
		expect(run("max-2026-11-17.json").steps).toEqual([-1, 1, -1, -1, -1, 1]);
	});

	it.each(["synthetic-chained-150ms.json", "synthetic-chained-250ms.json", "synthetic-chained-400ms.json"])("takes each flick of %s, chained into the last one's momentum, one place", (file) => {
		expect(run(file).steps).toEqual([-1, -1, 1, 1, 1, -1]);
	});

	it("lets a held drag go where it stands: past half a place lands on, under half springs back", () => {
		expect(run("synthetic-held-drags.json").steps).toEqual([-1]);
	});

	it.each([120, 60])("lands the same when a %s Hz browser merges each frame's events", (hz) => {
		for (const file of ["max-2026-11-17.json", "synthetic-chained-150ms.json", "synthetic-chained-250ms.json"]) {
			const { wheels, width } = recording(file);
			expect(follow(mergedPerFrame(wheels, hz), width).steps, file).toEqual(run(file).steps);
		}
	});

	it.each(["max-2026-11-17-r5.json", "max-2026-11-17-r6-pager.json"])("never takes %s's columns two places from where a stroke began, nor moves them by the momentum", (file) => {
		const { furthest, movedInMomentum } = run(file);
		expect(furthest).toBeLessThanOrEqual(1);
		expect(movedInMomentum).toBe(0);
	});

	/**
	 * Max's long sessions held to the round-six pager's strokes (which he rated about 95 % right): where the two part, it is
	 * a slow push under half a place (the gallery springs back, the pager turned), a second touch the pager missed, or a
	 * wobble of a slow push (stage0.md, «Round seven»).
	 */
	it.each([
		["max-2026-11-17-r5.json", 0.84],
		["max-2026-11-17-r6-pager.json", 0.9],
	] as const)("agrees with the pager on most of %s's strokes", (file, share) => {
		const pager = new WheelStrokes();
		const strokes = recording(file)
			.wheels.map((e) => pager.feed(e))
			.filter((s) => s !== 0);
		const { steps } = run(file);
		expect(common(steps, strokes) / Math.max(steps.length, strokes.length)).toBeGreaterThanOrEqual(share);
	});

	it("turns nothing for a vertical scroll or a pinch", () => {
		const fingers = new WheelFollow();
		const cues = [0, 8, 16, 24, 32].flatMap((t) => [...fingers.feed({ dx: 2, dy: 30, t }), ...fingers.feed({ dx: 40, dy: 0, t: t + 4, ctrl: true })]);
		expect(cues).toEqual([]);
	});

	it("lets a stroke go once the fingers are quiet", () => {
		const fingers = new WheelFollow();
		const cues = [0, 8, 17, 25].flatMap((t, i) => fingers.feed({ dx: [3, 9, 4, 6][i], dy: 0, t }));
		expect(cues.filter((c) => c.kind === "release")).toEqual([]);
		const quiet = fingers.quietAt;
		expect(quiet).not.toBeNull();
		expect(fingers.tick(quiet! + 1)).toEqual([{ kind: "release", t: quiet, speed: 0 }]);
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
