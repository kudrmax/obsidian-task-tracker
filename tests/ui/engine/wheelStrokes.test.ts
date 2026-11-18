import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WheelStrokes } from "../../../obsidian/ui/engine/gestures/wheelStrokes";

const RECORDINGS = join(__dirname, "..", "..", "e2e", "recordings");

interface Recorded {
	readonly type: string;
	readonly t: number;
	readonly dx?: number;
	readonly dy?: number;
	readonly ctrl?: boolean;
}

interface Wheel {
	readonly dx: number;
	readonly dy: number;
	readonly t: number;
	readonly ctrl?: boolean;
}

function wheelsOf(file: string): Wheel[] {
	const { events } = JSON.parse(readFileSync(join(RECORDINGS, file), "utf8")) as { events: Recorded[] };
	return events.filter((e) => e.type === "wheel").map((e) => ({ dx: e.dx ?? 0, dy: e.dy ?? 0, t: e.t, ctrl: e.ctrl }));
}

function strokesIn(wheels: readonly Wheel[]): number[] {
	const pager = new WheelStrokes();
	return wheels.map((e) => pager.feed(e)).filter((step) => step !== 0);
}

const strokesOf = (file: string) => strokesIn(wheelsOf(file));

/** The page's wheel events as a browser drawing `hz` frames a second hands them over: a frame's events one, their deltas summed, at the last one's time. */
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

/**
 * Max's real trackpad input and the synthetic chains, as recorded in stage 0 (docs/superpowers/specs/ui-standard-stack/stage0.md,
 * round six): each stroke of the fingers turns the ribbon one place its way, the momentum tail nothing.
 */
describe("the trackpad's strokes", () => {
	const expected = readdirSync(RECORDINGS).filter((file) => file.endsWith(".expect.json"));

	it.each(expected)("finds every stroke of %s, each its way, and none in the tails", (expectation) => {
		const recording = expectation.replace(".expect.json", ".json");
		expect(existsSync(join(RECORDINGS, recording))).toBe(true);
		const { swipes } = JSON.parse(readFileSync(join(RECORDINGS, expectation), "utf8")) as { swipes: number[] };
		expect(strokesOf(recording)).toEqual(swipes);
	});

	it("finds Max's long session's 97 strokes, never one for each wobble of a slow push", () => {
		expect(strokesOf("max-2026-11-17-r5.json")).toHaveLength(97);
	});

	/**
	 * A screen at 60 Hz, or a busy page, hands over the trackpad's events merged per frame (Chromium sums a frame's
	 * deltas): the same fingers turn the same places (counting events, the e2e replay ran 4 to 8 places astray of Max's
	 * session at 60 Hz).
	 */
	it.each([120, 60])("finds the same strokes when a %s Hz browser merges each frame's events", (hz) => {
		for (const expectation of expected) {
			const recording = expectation.replace(".expect.json", ".json");
			expect(strokesIn(mergedPerFrame(wheelsOf(recording), hz)), recording).toEqual(strokesOf(recording));
		}
		expect(strokesIn(mergedPerFrame(wheelsOf("max-2026-11-17-r5.json"), hz))).toEqual(strokesOf("max-2026-11-17-r5.json"));
		/** Max's other long session holds a push or two on the edge of the rule (a second push after a pause, a slow one speeding up): one stroke apart at most. */
		const r6 = strokesOf("max-2026-11-17-r6-pager.json").length;
		expect(Math.abs(strokesIn(mergedPerFrame(wheelsOf("max-2026-11-17-r6-pager.json"), hz)).length - r6)).toBeLessThanOrEqual(1);
	});

	it("turns nothing for a vertical scroll or a pinch", () => {
		const pager = new WheelStrokes();
		const steps = [0, 8, 16, 24, 32].flatMap((t) => [pager.feed({ dx: 2, dy: 30, t }), pager.feed({ dx: 40, dy: 0, t: t + 4, ctrl: true })]);
		expect(steps.every((step) => step === 0)).toBe(true);
	});
});
