import { describe, expect, it } from "vitest";
import { budgetOfTrace, type Frame, FRAME_RULES, HARNESS, judge, judgeBudget, type PageAnimation, type Row, type StepLog } from "../../scripts/e2e/frames";

/**
 * The frame recorder's rules (spec §Tests 6), each shown to trip on a frame log made to reproduce one of Max's past
 * bugs, and to pass the clean step beside it.
 */

const row = (key: string, y: number, extra: Partial<Row> = {}): Row => ({ key, list: "now#0", x: 10, y, w: 200, h: 35, prev: null, ...extra });
const frame = (rows: Row[], extra: Partial<Frame> = {}): Frame => ({ t: 0, animations: [], rows, place: { column: "now", index: 2, day: "Today", snapOff: 0 }, ...extra });
const anim = (rowKey: string | null): PageAnimation => ({ name: "transform", kind: "CSSTransition", state: "running", target: "div.tc-card", row: rowKey });
/** Two cards stacked with the 2 px card gap, the second after the first. */
const still = () => [row("A/1", 0), row("B/1", 37, { prev: "A/1" })];
const step = (frames: Frame[], extra: Partial<StepLog> = {}): StepLog => ({ name: "s", cause: "interaction", frames, started: [], rest: frames[frames.length - 1].rows, settled: true, gap: 2, ...extra });

describe("the frame rules on Max's past bugs", () => {
	it("pass a clean step", () => {
		expect(judge(step([frame(still()), frame(still())], { cause: "none" }))).toEqual([]);
	});

	it("cards flying in on a project switch: rows that show mid-step at a corner and travel to their place, animated", () => {
		const before = [row("A/1", 0)];
		const fly = (y: number, x: number) => row("C/1", y, { x });
		const frames = [frame(before), frame([fly(0, 0)], { animations: [anim("C/1")] }), frame([fly(40, 5)], { animations: [anim("C/1")] }), frame([fly(80, 10)])];
		const log = step(frames, { cause: "context" });
		expect(FRAME_RULES.rowsAcrossContext(log)).not.toEqual([]);
		expect(FRAME_RULES.rowsAnimatedAcrossContext(log)).not.toEqual([]);
		const inPlace = step([frame(before), frame([row("C/1", 80)]), frame([row("C/1", 80)])], { cause: "context" });
		expect(judge(inPlace)).toEqual([]);
	});

	it("a row jumping and coming back under a lift (A5)", () => {
		const frames = [frame(still()), frame([row("A/1", 0), row("B/1", 47, { prev: "A/1" })]), frame(still())];
		expect(FRAME_RULES.stillness(step(frames))).not.toEqual([]);
		expect(FRAME_RULES.stillness(step(frames, { moves: [] }))).not.toEqual([]);
		expect(FRAME_RULES.stillness(step([frame(still()), frame([row("A/1", 6), row("B/1", 37, { prev: "A/1" })])], { moves: ["B/"] }))).not.toEqual([]);
		expect(FRAME_RULES.stillness(step([frame(still()), frame(still())], { moves: [] }))).toEqual([]);
	});

	it("the All columns jerk: a region that turns back or leaps between two frames", () => {
		const at = (...xs: number[]) => xs.map((x) => frame([row("A/1", 0, { x })]));
		expect(FRAME_RULES.continuity(step(at(0, 20, 40, 30, 60), { cause: "swipe" }))).not.toEqual([]);
		expect(FRAME_RULES.continuity(step(at(0, 300, 310), { cause: "swipe" }))).not.toEqual([]);
		expect(FRAME_RULES.continuity(step(at(0, 20, 40, 60, 70), { cause: "swipe" }))).toEqual([]);
	});

	it("a row remounted with a flash: gone for some frames and back", () => {
		const gone = [row("A/1", 0)];
		const frames = [frame(still()), frame(gone), frame(gone), frame(still())];
		expect(FRAME_RULES.flash(step(frames))).not.toEqual([]);
		expect(judge(step(frames))).toContainEqual(expect.stringMatching(/a flash: B\/1 was gone for 2 frames/));
		expect(FRAME_RULES.flash(step([frame(still()), frame(still()), frame(still())]))).toEqual([]);
		expect(FRAME_RULES.flash(step([frame(still()), frame(gone), frame(gone)]))).toEqual([]);
		expect(FRAME_RULES.flash(step(frames, { carried: ["B/1"] }))).toEqual([]);
	});

	it("a screen that never settles", () => {
		expect(FRAME_RULES.unsettled(step([frame(still())], { settled: false }))).not.toEqual([]);
	});

	it("a swipe resting off its column's edge, or two places away", () => {
		const at = (index: number, snapOff = 0) => ({ column: "now", index, day: "Today", snapOff });
		expect(FRAME_RULES.snap(step([frame(still(), { place: at(2) }), frame(still(), { place: at(1, 12) })], { expectPlaces: -1 }))).not.toEqual([]);
		expect(FRAME_RULES.snap(step([frame(still(), { place: at(2) }), frame(still(), { place: at(1, 0.2) })], { expectPlaces: -1 }))).toEqual([]);
		expect(FRAME_RULES.swipeLanding(step([frame(still(), { place: at(2) }), frame(still(), { place: at(0) })], { expectPlaces: -1 }))).not.toEqual([]);
		expect(FRAME_RULES.swipeLanding(step([frame(still(), { place: at(2) }), frame(still(), { place: at(2) })], { expectPlaces: 1 }))).not.toEqual([]);
	});

	it("motion without a cause", () => {
		expect(FRAME_RULES.motionWithoutCause(step([frame(still()), frame([row("A/1", 3), row("B/1", 37)])], { cause: "none" }))).not.toEqual([]);
		expect(FRAME_RULES.motionWithoutCause(step([frame(still(), { animations: [anim(null)] })], { cause: "none" }))).not.toEqual([]);
		expect(FRAME_RULES.motionWithoutCause(step([frame(still())], { cause: "none", started: [{ name: "transform", type: "CSSTransition" }] }))).not.toEqual([]);
	});

	it("single rows moving across a context; a swipe moves the region as one", () => {
		const from = [row("A/1", 0), row("B/1", 37)];
		const to = [row("A/1", 100), row("B/1", 137)];
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 37)]), frame(to)], { cause: "context" }))).not.toEqual([]);
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 87)]), frame(to)], { cause: "swipe" }))).toEqual([]);
		expect(FRAME_RULES.rowsAcrossContext(step([frame(from), frame([row("A/1", 50), row("B/1", 60)]), frame(to)], { cause: "swipe" }))).not.toEqual([]);
		const columns = [row("A/1", 0, { list: "now#0" }), row("S/1", 0, { list: "soon#1" })];
		const moved = (a: number, s: number) => [row("A/1", 0, { list: "now#0", x: 10 + a }), row("S/1", 0, { list: "soon#1", x: 10 + s })];
		expect(FRAME_RULES.rowsAcrossContext(step([frame(columns), frame(moved(50, 80)), frame(moved(100, 160))], { cause: "swipe" }))).toEqual([]);
	});

	it("overshoot: a row passing its rest", () => {
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 104)]), frame([row("A/1", 100)])]))).not.toEqual([]);
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 60)]), frame([row("A/1", 100)])]))).toEqual([]);
		expect(FRAME_RULES.overshoot(step([frame([row("A/1", 0)]), frame([row("A/1", 104)]), frame([row("A/1", 100)])], { carried: ["A/1"] }))).toEqual([]);
	});

	it("a rest more than 0.5 px off", () => {
		expect(FRAME_RULES.restOff(step([frame([row("A/1", 0)])], { rest: [row("A/1", 0.8)] }))).not.toEqual([]);
		expect(FRAME_RULES.restOff(step([frame([row("A/1", 0)])], { rest: [row("A/1", 0.4)] }))).toEqual([]);
	});

	it("gaps or overlaps between the rows of a list", () => {
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 45, { prev: "A/1" })])]))).not.toEqual([]);
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 20)])]))).not.toEqual([]);
		expect(FRAME_RULES.gapsAndOverlaps(step([frame([row("A/1", 0), row("B/1", 20, { list: "soon#1" })])]))).toEqual([]);
	});

	it("a gesture that moved nothing", () => {
		expect(FRAME_RULES.nothingMoved(step([frame(still()), frame(still())], { expectMotion: true }))).not.toEqual([]);
		expect(FRAME_RULES.nothingMoved(step([frame(still()), frame([row("A/1", 5), row("B/1", 37)]), frame(still())], { expectMotion: true }))).toEqual([]);
	});
});

describe("the budget", () => {
	const f = (scriptMs: number, interval = 16) => ({ start: 0, interval, scriptMs });

	it("fails a frame with 8 ms of script or more, and any task over 16 ms, the 17–49 ms ones too", () => {
		expect(judgeBudget({ frames: [f(2), f(9)], longTasks: [], scriptEvents: 4 })).not.toEqual([]);
		expect(judgeBudget({ frames: [f(2)], longTasks: [{ t: 0, ms: 20 }], scriptEvents: 4 })).not.toEqual([]);
		expect(judgeBudget({ frames: [f(2), f(7.9)], longTasks: [{ t: 0, ms: 15 }], scriptEvents: 4 })).toEqual([]);
	});

	it("fails a trace with no frame or no script of the page: nothing passes on an empty recording", () => {
		expect(judgeBudget({ frames: [], longTasks: [], scriptEvents: 4 }).join()).toMatch(/no frame/);
		expect(judgeBudget({ frames: [f(0), f(0)], longTasks: [], scriptEvents: 0 }).join()).toMatch(/no script/);
	});

	it("leaves the harness's own evaluations and frame sampler out of the page's script", () => {
		const M = { ph: "M", name: "thread_name", ts: 0, pid: 1, tid: 1, args: { name: "CrRendererMain" } };
		const X = (name: string, ts: number, dur: number, functionName?: string) => ({ name, ph: "X", ts, dur, pid: 1, tid: 1, ...(functionName ? { args: { data: { functionName } } } : {}) });
		const mark = (message: string, ts: number) => ({ name: "TimeStamp", ph: "I", ts, pid: 1, tid: 1, args: { data: { message } } });
		const harnessOnly = budgetOfTrace([
			M,
			X("FireAnimationFrame", 0, 1000),
			X("FunctionCall", 100, 800, HARNESS.sampler),
			X("EvaluateScript", 2000, 9000),
			mark(HARNESS.evalBegin, 2100),
			X("FunctionCall", 2200, 8000),
			mark(HARNESS.evalEnd, 10_500),
			X("FireAnimationFrame", 16_000, 1000),
			X("FunctionCall", 16_100, 800, HARNESS.sampler),
			X("FireAnimationFrame", 32_000, 1000),
		]);
		expect(harnessOnly.frames[0].scriptMs).toBeCloseTo(0.2);
		expect(harnessOnly.scriptEvents).toBe(0);
		expect(judgeBudget(harnessOnly).join()).toMatch(/no script/);
		const withPage = budgetOfTrace([
			M,
			X("FireAnimationFrame", 0, 6000),
			X("FunctionCall", 100, 800, HARNESS.sampler),
			X("FunctionCall", 1000, 5000),
			X("FireAnimationFrame", 16_000, 1000),
		]);
		expect(withPage.frames[0].scriptMs).toBeCloseTo(5.2);
		expect(withPage.scriptEvents).toBeGreaterThan(0);
	});

	it("reads frames, script and long tasks from a trace, nested script counted once", () => {
		const M = { ph: "M", name: "thread_name", ts: 0, pid: 1, tid: 1, args: { name: "CrRendererMain" } };
		const X = (name: string, ts: number, dur: number) => ({ name, ph: "X", ts, dur, pid: 1, tid: 1 });
		const b = budgetOfTrace([
			M,
			X("FireAnimationFrame", 0, 1000),
			X("FireAnimationFrame", 16_000, 1000),
			X("FireAnimationFrame", 32_000, 1000),
			X("FunctionCall", 2000, 5000),
			X("FunctionCall", 3000, 1000),
			X("RunTask", 16_500, 20_000),
		]);
		expect(b.frames).toHaveLength(2);
		expect(b.frames[0].interval).toBe(16);
		expect(b.frames[0].scriptMs).toBeCloseTo(6);
		expect(b.longTasks.map((t) => t.ms)).toEqual([20]);
	});
});
