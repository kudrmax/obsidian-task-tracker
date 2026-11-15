import { describe, expect, it } from "vitest";
import { type Frame, FRAME_RULES, judge, judgeBudget, type Row, type StepLog } from "../../scripts/e2e/frames";

/** The frame recorder's rules (spec §Tests 6), each shown to trip on made-up frames and to pass a clean step. */

const row = (key: string, y: number, extra: Partial<Row> = {}): Row => ({ key, list: "now#0", x: 10, y, w: 200, h: 35, prev: null, ...extra });
const frame = (rows: Row[], extra: Partial<Frame> = {}): Frame => ({ t: 0, animations: [], rows, place: { column: "now", index: 2, day: "Today" }, ...extra });
/** Two cards stacked with the 2 px card gap, the second after the first. */
const still = () => [row("A/1", 0), row("B/1", 37, { prev: "A/1" })];
const step = (frames: Frame[], extra: Partial<StepLog> = {}): StepLog => ({ name: "s", cause: "interaction", frames, started: [], rest: frames[frames.length - 1].rows, gap: 2, ...extra });

describe("the frame rules", () => {
	it("pass a clean step", () => {
		expect(judge(step([frame(still()), frame(still())], { cause: "none" }))).toEqual([]);
	});

	it("motion without a cause: anything moving or animating when nothing asked", () => {
		expect(FRAME_RULES.motionWithoutCause(step([frame(still()), frame([row("A/1", 3), row("B/1", 37)])], { cause: "none" }))).not.toEqual([]);
		expect(FRAME_RULES.motionWithoutCause(step([frame(still(), { animations: [{ name: "opacity", kind: "CSSTransition", state: "running", target: "div.tc-card" }] })], { cause: "none" }))).not.toEqual([]);
		expect(FRAME_RULES.motionWithoutCause(step([frame(still())], { cause: "none", started: [{ name: "transform", type: "CSSTransition" }] }))).not.toEqual([]);
	});

	it("single rows moving across a context: a mode draws in place, a swipe moves the region as one", () => {
		const from = [row("A/1", 0), row("B/1", 37)];
		const to = [row("A/1", 100), row("B/1", 137)];
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 37)]), frame(to)], { cause: "context" }))).not.toEqual([]);
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame(to), frame(to)], { cause: "context" }))).toEqual([]);
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 87)]), frame(to)], { cause: "swipe" }))).toEqual([]);
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 60)]), frame(to)], { cause: "swipe" }))).not.toEqual([]);
	});

	it("overshoot: a row passing its rest", () => {
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 104)]), frame([row("A/1", 100)])]))).not.toEqual([]);
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 60)]), frame([row("A/1", 100)])]))).toEqual([]);
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 104)]), frame([row("A/1", 100)])], { carried: ["A/1"] }))).toEqual([]);
	});

	it("a rest more than 0.5 px off: where the motion stopped is not where the row settles", () => {
		expect(FRAME_RULES.restOff(step([frame([row("A/1", 0)])], { rest: [row("A/1", 0.8)] }))).not.toEqual([]);
		expect(FRAME_RULES.restOff(step([frame([row("A/1", 0)])], { rest: [row("A/1", 0.4)] }))).toEqual([]);
	});

	it("gaps or overlaps between the rows of a list", () => {
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 45, { prev: "A/1" })])]))).not.toEqual([]);
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 20)])]))).not.toEqual([]);
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 20, { list: "soon#1" })])]))).toEqual([]);
	});

	it("a swipe landing two places away", () => {
		const at = (index: number) => ({ column: "now", index, day: "Today" });
		expect(FRAME_RULES.swipeLanding(step([frame(still(), { place: at(2) }), frame(still(), { place: at(0) })], { expectPlaces: -1 }))).not.toEqual([]);
		expect(FRAME_RULES.swipeLanding(step([frame(still(), { place: at(2) }), frame(still(), { place: at(1) })], { expectPlaces: -1 }))).toEqual([]);
		expect(FRAME_RULES.swipeLanding(step([frame(still(), { place: at(2) }), frame(still(), { place: at(2) })], { expectPlaces: 1 }))).not.toEqual([]);
	});

	it("a gesture that moved nothing", () => {
		expect(FRAME_RULES.nothingMoved(step([frame(still()), frame(still())], { expectMotion: true }))).not.toEqual([]);
		expect(FRAME_RULES.nothingMoved(step([frame(still()), frame([row("A/1", 5), row("B/1", 37)]), frame(still())], { expectMotion: true }))).toEqual([]);
	});

	it("the budget: 8 ms of script a frame, no long task over 16 ms", () => {
		expect(judgeBudget({ frames: 10, scriptMs: 90, longTasks: [] })).not.toEqual([]);
		expect(judgeBudget({ frames: 10, scriptMs: 50, longTasks: [{ t: 0, ms: 30 }] })).not.toEqual([]);
		expect(judgeBudget({ frames: 10, scriptMs: 50, longTasks: [{ t: 0, ms: 12 }] })).toEqual([]);
	});
});
