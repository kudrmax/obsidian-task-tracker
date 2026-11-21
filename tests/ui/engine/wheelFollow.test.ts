import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FollowPager } from "../../../obsidian/ui/engine/gestures/followPager";
import { WheelFollow } from "../../../obsidian/ui/engine/gestures/wheelFollow";
// @ts-expect-error the e2e checks' shared replay of the rule is plain JavaScript
import { followSteps } from "../../e2e/lib/follow.mjs";

const RECORDINGS = join(__dirname, "..", "..", "e2e", "recordings");
/** The round-six pager's strokes on Max's long sessions, as it turned them before it gave way to the gallery (stage0.md, «Round six»). */
const ROUND_SIX = JSON.parse(readFileSync(join(__dirname, "fixtures", "round-six-pager-strokes.json"), "utf8")) as Record<string, number[]>;

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

/** Max's wheel events through the trackpad's cues and the gallery's rule, unbounded on either side, as the ribbon runs them. */
const follow = (wheels: readonly Wheel[], width: number): { steps: number[]; furthest: number; movedInMomentum: number } => followSteps(wheels, width);

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
		const strokes = ROUND_SIX[file];
		const { steps } = run(file);
		expect(common(steps, strokes) / Math.max(steps.length, strokes.length)).toBeGreaterThanOrEqual(share);
	});

	/**
	 * A page busy past @use-gesture's wheel end (its 140 ms timer, on the page's clock) asks the rule to let go while the
	 * gesture's next events, stamped by the OS a frame apart, still wait in the queue: they are the same gesture going on,
	 * by their own times, never a new touch that could take the columns a second place (Max, «one swipe, one place»).
	 */
	it("takes a gesture's events delayed past the wheel end as the same gesture, by their own times", () => {
		const push = [2, 8, 20, 40, 54, 60];
		const events: Wheel[] = push.map((d, i) => ({ dx: d, dy: 0, t: i * 8 }));
		let d = 60;
		for (let t = push.length * 8; d >= 1; t += 8) events.push({ dx: (d *= 0.965), dy: 0, t });
		const steadily = new WheelFollow();
		const plain = events.flatMap((e) => steadily.feed(e)).map((c) => c.kind);
		const stalled = new WheelFollow();
		const cues = events.flatMap((e, i) => [...(i === 20 || i === 4 ? stalled.tick(Infinity) : []), ...stalled.feed(e)]).map((c) => c.kind);
		expect(plain.filter((k) => k === "begin")).toHaveLength(1);
		expect(cues.filter((k) => k === "begin" || k === "release")).toEqual(["begin", "release", "begin", "release"]);
		const stalled2 = new WheelFollow();
		const pager = new FollowPager(1, Infinity);
		let at = 1;
		for (const [i, e] of events.entries())
			for (const cue of [...(i === 20 || i === 4 ? stalled2.tick(Infinity) : []), ...stalled2.feed(e)]) {
				if (cue.kind === "begin") pager.begin(at, cue.fresh);
				else if (cue.kind === "move") at = pager.move(cue.dx, 200);
				else at = pager.release(at, cue.speed, 200);
			}
		expect(at).toBe(2);
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
