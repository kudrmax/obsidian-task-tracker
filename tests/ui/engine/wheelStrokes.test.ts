import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WheelStrokes } from "../../../obsidian/ui/engine/wheelStrokes";

const RECORDINGS = join(__dirname, "..", "..", "e2e", "recordings");

interface Recorded {
	readonly type: string;
	readonly t: number;
	readonly dx?: number;
	readonly dy?: number;
	readonly ctrl?: boolean;
}

function strokesOf(file: string): number[] {
	const { events } = JSON.parse(readFileSync(join(RECORDINGS, file), "utf8")) as { events: Recorded[] };
	const pager = new WheelStrokes();
	return events.filter((e) => e.type === "wheel").map((e) => pager.feed({ dx: e.dx ?? 0, dy: e.dy ?? 0, t: e.t, ctrl: e.ctrl })).filter((step) => step !== 0);
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

	it("turns nothing for a vertical scroll or a pinch", () => {
		const pager = new WheelStrokes();
		const steps = [0, 8, 16, 24, 32].flatMap((t) => [pager.feed({ dx: 2, dy: 30, t }), pager.feed({ dx: 40, dy: 0, t: t + 4, ctrl: true })]);
		expect(steps.every((step) => step === 0)).toBe(true);
	});
});
