/**
 * The frame recorder's verdict (spec §Tests 6): a step's frames, sampled every animation frame in the page (rows' boxes,
 * `document.getAnimations()`) and the animations the CDP Animation domain saw start, judged by the failure rules:
 * motion without a cause, single rows moving across a context, overshoot, a rest more than 0.5 px off, gaps or overlaps,
 * a swipe landing two places away; and the shapes of Max's past bugs: cards flying in on a project switch, a row that
 * jumps and returns under a lift, a region that jerks back and forth, a screen that never settles, a ribbon resting off
 * its column's edge. Each row is judged from the frame it first shows in. Pure: `tests/e2e/frames.test.ts` proves each
 * rule on frame logs made to reproduce each bug.
 */

export interface Row {
	readonly key: string;
	readonly list: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	/** The row right before it in the DOM, if it is a row. */
	readonly prev: string | null;
}

export interface PageAnimation {
	readonly name: string;
	readonly kind: string;
	readonly state: string;
	readonly target: string | null;
	/** The row the animated element is in, null for anything else. */
	readonly row: string | null;
}

export interface Place {
	readonly column: string | null;
	readonly index: number | null;
	readonly day: string | null;
	/** How far the leftmost column stands from the stage's edge it snaps to, px; null without a ribbon. */
	readonly snapOff?: number | null;
}

export interface Frame {
	readonly t: number;
	readonly animations: readonly PageAnimation[];
	readonly rows: readonly Row[];
	readonly place: Place | null;
}

/** What a step says caused its motion. */
export type Cause =
	/** Nothing: the screen must stand still (a check that nothing moves on its own). */
	| "none"
	/** Another mode, project or filter: drawn in place, no row moves or animates. */
	| "context"
	/** A place or day change: the region moves as a whole, each column as one. */
	| "swipe"
	/** An interaction's declared motions: a lift, a drop, the panel's slide, a menu. */
	| "interaction";

export interface StepLog {
	readonly name: string;
	readonly cause: Cause;
	readonly frames: readonly Frame[];
	/** Animations the CDP Animation domain saw start during the step. */
	readonly started: readonly { readonly name: string; readonly type: string }[];
	/** The rows sampled again once the screen was quiet for a while after the step. */
	readonly rest: readonly Row[];
	/** The screen came to rest after the step (nothing animating, the rows still) within its bound. */
	readonly settled: boolean;
	/** The card gap the CSS says (`--tc-card-gap`), px. */
	readonly gap: number;
	/** The places a swipe must move the ribbon by (+1 forward, -1 back). */
	readonly expectPlaces?: number;
	/** Row keys the step carries: they follow the finger, exempt from the motion rules. */
	readonly carried?: readonly string[];
	/** The rows the step may move (key prefixes), or every row; everything else must stand still. Default: every row. */
	readonly moves?: readonly string[] | "all";
	/** The step must move something (a drag, a swipe): a step whose gesture did nothing fails, so no rule passes on an empty recording. */
	readonly expectMotion?: boolean;
	/** Animation names a `none` step tolerates (Obsidian's own, a caret). */
	readonly tolerated?: readonly string[];
	/** The most a moving row may travel between two frames, px; more is a jerk. Default 120. */
	readonly maxStep?: number;
}

const PX = 0.5;
const near = (a: number, b: number) => Math.abs(a - b) <= PX;
const sameBox = (a: Pick<Row, "x" | "y" | "w" | "h">, b: Pick<Row, "x" | "y" | "w" | "h">) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
const byKey = (rows: readonly Row[]) => new Map(rows.map((r) => [r.key, r]));

/** A row's boxes frame by frame, from the frame it first shows in. */
interface Track {
	readonly key: string;
	readonly boxes: readonly { readonly frame: number; readonly row: Row }[];
}

function tracks(step: StepLog): Track[] {
	const all = new Map<string, { frame: number; row: Row }[]>();
	step.frames.forEach((f, frame) => {
		for (const row of f.rows) {
			const list = all.get(row.key) ?? [];
			list.push({ frame, row });
			all.set(row.key, list);
		}
	});
	const carried = new Set(step.carried ?? []);
	return [...all.entries()].filter(([key]) => !carried.has(key)).map(([key, boxes]) => ({ key, boxes }));
}

const first = (t: Track) => t.boxes[0].row;
const last = (t: Track) => t.boxes[t.boxes.length - 1].row;
const mayMove = (step: StepLog, key: string) => step.moves === undefined || step.moves === "all" || step.moves.some((prefix) => key.startsWith(prefix));

function unsettled(step: StepLog): string[] {
	return step.settled ? [] : ["the screen never came to rest"];
}

function motionWithoutCause(step: StepLog): string[] {
	if (step.cause !== "none") return [];
	const out: string[] = [];
	const tolerated = (name: string) => (step.tolerated ?? []).some((t) => name.includes(t));
	const anims = new Set(step.frames.flatMap((f) => f.animations.map((a) => `${a.kind} ${a.name} on ${a.target}`)).filter((a) => !tolerated(a)));
	for (const a of anims) out.push(`motion without a cause: ${a}`);
	for (const a of step.started) if (!tolerated(a.name)) out.push(`motion without a cause: ${a.type} ${a.name} started`);
	const moved = tracks(step).find((t) => t.boxes.some((b) => !sameBox(b.row, first(t))));
	if (moved) out.push(`motion without a cause: ${moved.key} moved`);
	return out;
}

/** A context change draws in place: no row animates (no card flies in from a corner, none fades and slides). */
function rowsAnimatedAcrossContext(step: StepLog): string[] {
	if (step.cause !== "context") return [];
	const animated = [...new Set(step.frames.flatMap((f) => f.animations.filter((a) => a.row !== null).map((a) => `${a.row} (${a.kind} ${a.name})`)))];
	return animated.length ? [`rows animated across a context: ${animated.slice(0, 3).join("; ")}`] : [];
}

/** Rows standing, in a frame, between where they first showed and where they end: what is moving then, with its offset and column. */
function inBetween(step: StepLog, frame: number): { key: string; column: string; dx: number; dy: number }[] {
	return tracks(step).flatMap((t) => {
		const at = t.boxes.find((b) => b.frame === frame);
		if (!at || sameBox(at.row, first(t)) || sameBox(at.row, last(t))) return [];
		return [{ key: t.key, column: at.row.list.split("#")[0], dx: at.row.x - first(t).x, dy: at.row.y - first(t).y }];
	});
}

function rowsAcrossContext(step: StepLog): string[] {
	if (step.cause !== "context" && step.cause !== "swipe") return [];
	for (let i = 1; i < step.frames.length - 1; i++) {
		const moving = inBetween(step, i);
		if (moving.length === 0) continue;
		if (step.cause === "context") return [`single rows moving across a context at frame ${i}: ${moving.slice(0, 3).map((m) => m.key).join("; ")}`];
		/** A place change moves each column as one (the columns may change their widths as they go: RibbonColumns). */
		const whole = moving.every((m) => {
			const lead = moving.find((o) => o.column === m.column)!;
			return Math.abs(m.dx - lead.dx) <= 1 && Math.abs(m.dy - lead.dy) <= 1;
		});
		if (!whole) return [`single rows moving across a context at frame ${i}: ${moving.slice(0, 3).map((m) => `${m.key} by ${m.dx.toFixed(1)},${m.dy.toFixed(1)}`).join("; ")}`];
	}
	return [];
}

/** What the step does not move stands still; a row that ends where it began never left it (no jump and return under a lift). */
function stillness(step: StepLog): string[] {
	const out: string[] = [];
	for (const t of tracks(step)) {
		const start = first(t);
		const off = t.boxes.find((b) => !sameBox(b.row, start));
		if (!off) continue;
		if (!mayMove(step, t.key)) out.push(`${t.key} moved though the step moves only ${(step.moves as readonly string[]).join(", ") || "nothing"} (frame ${off.frame})`);
		else if (sameBox(last(t), start)) out.push(`${t.key} jumped ${Math.max(Math.abs(off.row.x - start.x), Math.abs(off.row.y - start.y)).toFixed(1)} px and came back (frame ${off.frame})`);
	}
	return out;
}

function overshoot(step: StepLog): string[] {
	const out: string[] = [];
	for (const t of tracks(step)) {
		const [start, end] = [first(t), last(t)];
		for (const axis of ["x", "y"] as const) {
			const travel = end[axis] - start[axis];
			if (Math.abs(travel) <= PX) continue;
			const most = Math.max(...t.boxes.map((b) => (b.row[axis] - end[axis]) * Math.sign(travel)));
			if (most > PX) {
				out.push(`overshoot: ${t.key} went ${most.toFixed(1)} px past its rest on ${axis}`);
				break;
			}
		}
	}
	return out;
}

/** A moving row goes one way and smoothly: no turn back (a jerk), no leap between two frames. */
function continuity(step: StepLog): string[] {
	if (step.cause === "context" || step.cause === "none") return [];
	const maxStep = step.maxStep ?? 120;
	const out: string[] = [];
	for (const t of tracks(step)) {
		for (const axis of ["x", "y"] as const) {
			let direction = 0;
			let problem: string | null = null;
			for (let i = 1; i < t.boxes.length && !problem; i++) {
				if (t.boxes[i].frame !== t.boxes[i - 1].frame + 1) continue;
				const d = t.boxes[i].row[axis] - t.boxes[i - 1].row[axis];
				if (Math.abs(d) > maxStep) problem = `leapt ${d.toFixed(0)} px on ${axis} between frames ${i - 1} and ${i}`;
				else if (Math.abs(d) > PX) {
					if (direction !== 0 && Math.sign(d) !== direction) problem = `turned back on ${axis} at frame ${t.boxes[i].frame}`;
					direction = Math.sign(d);
				}
			}
			if (problem) {
				out.push(`a jerk: ${t.key} ${problem}`);
				break;
			}
		}
	}
	return out;
}

function restOff(step: StepLog): string[] {
	const end = byKey(step.frames[step.frames.length - 1].rows);
	return step.rest.flatMap((r) => {
		const at = end.get(r.key);
		if (!at || sameBox(at, r)) return [];
		return [`a rest off: ${r.key} ended at ${at.x.toFixed(1)},${at.y.toFixed(1)} and settled at ${r.x.toFixed(1)},${r.y.toFixed(1)}`];
	});
}

/** A swipe rests with its column on the stage's edge, not where the motion happened to stop. */
function snap(step: StepLog): string[] {
	if (step.expectPlaces === undefined) return [];
	const off = step.frames[step.frames.length - 1].place?.snapOff;
	if (off === null || off === undefined) return ["a swipe ended where no column stands"];
	return off > PX ? [`the ribbon rests ${off.toFixed(1)} px off its column's edge`] : [];
}

function gapsAndOverlaps(step: StepLog): string[] {
	const rows = step.rest;
	const keys = byKey(rows);
	const out: string[] = [];
	for (const row of rows) {
		const prev = row.prev ? keys.get(row.prev) : undefined;
		if (prev && prev.list === row.list) {
			const gap = row.y - (prev.y + prev.h);
			if (Math.abs(gap - step.gap) > PX) out.push(`a ${gap < step.gap ? "gap too small" : "gap"}: ${gap.toFixed(1)} px between ${prev.key} and ${row.key}, the card gap is ${step.gap}`);
		}
	}
	for (let i = 0; i < rows.length; i++)
		for (let j = i + 1; j < rows.length; j++) {
			const [a, b] = [rows[i], rows[j]];
			if (a.list !== b.list) continue;
			const across = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
			const down = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
			if (across > PX && down > PX) out.push(`an overlap: ${a.key} and ${b.key} by ${down.toFixed(1)} px`);
		}
	return out;
}

function swipeLanding(step: StepLog): string[] {
	if (step.expectPlaces === undefined) return [];
	const before = step.frames[0].place?.index;
	const after = step.frames[step.frames.length - 1].place?.index;
	if (before === null || before === undefined || after === null || after === undefined) return [`a swipe's place unknown (${before} → ${after})`];
	return after - before === step.expectPlaces ? [] : [`a swipe landed ${after - before} places away, not ${step.expectPlaces}`];
}

function nothingMoved(step: StepLog): string[] {
	if (!step.expectMotion) return [];
	const moved = tracks(step).some((t) => t.boxes.some((b) => !sameBox(b.row, first(t)))) || step.frames.some((f) => f.animations.length > 0) || (step.carried ?? []).length > 0;
	const firstRows = byKey(step.frames[0].rows);
	const changed = step.frames[0].rows.length !== step.rest.length || step.rest.some((r) => !firstRows.has(r.key) || !sameBox(firstRows.get(r.key)!, r));
	return moved || changed ? [] : ["the gesture moved nothing"];
}

export const FRAME_RULES = { unsettled, nothingMoved, motionWithoutCause, rowsAnimatedAcrossContext, rowsAcrossContext, stillness, overshoot, continuity, restOff, snap, gapsAndOverlaps, swipeLanding };

/** Every failure of a step, by the rules of §Tests 6. */
export function judge(step: StepLog): string[] {
	return Object.values(FRAME_RULES).flatMap((rule) => rule(step));
}

/** One frame of a budget run, from the trace: when it began, how long it took to the next, the script run in it. */
export interface BudgetFrame {
	readonly start: number;
	readonly interval: number;
	readonly scriptMs: number;
}

export interface Budget {
	readonly frames: readonly BudgetFrame[];
	/** Every main-thread task over 16 ms, from the trace (not only the 50 ms the page's PerformanceObserver tells). */
	readonly longTasks: readonly { readonly t: number; readonly ms: number }[];
}

/** The budget (§Tests 6): under 8 ms of script in any frame that ran script, no task over 16 ms. */
export function judgeBudget(b: Budget): string[] {
	const out: string[] = [];
	const worked = b.frames.filter((f) => f.scriptMs > 0);
	const worst = worked.reduce((m, f) => Math.max(m, f.scriptMs), 0);
	if (worst >= 8) out.push(`${worst.toFixed(1)} ms of script in a frame (budget 8)`);
	for (const t of b.longTasks) if (t.ms > 16) out.push(`a long task of ${t.ms.toFixed(0)} ms`);
	return out;
}

export function budgetSummary(b: Budget): string {
	const worked = b.frames.filter((f) => f.scriptMs > 0);
	const average = worked.length ? worked.reduce((s, f) => s + f.scriptMs, 0) / worked.length : 0;
	const worst = worked.reduce((m, f) => Math.max(m, f.scriptMs), 0);
	const longest = b.frames.reduce((m, f) => Math.max(m, f.interval), 0);
	return `${b.frames.length} frames, script ${average.toFixed(2)} ms average over the ${worked.length} that ran script, ${worst.toFixed(1)} ms at most; the longest frame ${longest.toFixed(0)} ms; ${b.longTasks.length} tasks over 16 ms`;
}

interface TraceEvent {
	readonly name: string;
	readonly ph: string;
	readonly ts: number;
	readonly dur?: number;
	readonly pid: number;
	readonly tid: number;
	readonly args?: { readonly name?: string };
}

const SCRIPT_EVENTS = new Set(["FunctionCall", "EvaluateScript", "v8.compile", "V8.Execute", "RunMicrotasks", "TimerFire", "FireAnimationFrame", "EventDispatch", "v8.callFunction"]);

/**
 * The budget from a CDP trace of the gesture: the page's main thread (the renderer's main thread with the most work),
 * its frames (each `FireAnimationFrame`, the recorder asking for every frame), the script run in each (the union of
 * the script events, so nested ones count once) and every task over 16 ms.
 */
export function budgetOfTrace(events: readonly TraceEvent[]): Budget {
	const mains = events.filter((e) => e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain").map((e) => `${e.pid}:${e.tid}`);
	const busiest = mains
		.map((id) => ({ id, n: events.filter((e) => `${e.pid}:${e.tid}` === id && e.ph === "X").length }))
		.sort((a, b) => b.n - a.n)[0]?.id;
	const main = events.filter((e) => `${e.pid}:${e.tid}` === busiest && e.ph === "X" && e.dur !== undefined);
	const starts = main.filter((e) => e.name === "FireAnimationFrame").map((e) => e.ts).sort((a, b) => a - b);
	const scripts = main.filter((e) => SCRIPT_EVENTS.has(e.name)).map((e) => [e.ts, e.ts + e.dur!] as const).sort((a, b) => a[0] - b[0]);
	const merged: [number, number][] = [];
	for (const [s, e] of scripts) {
		const top = merged[merged.length - 1];
		if (top && s <= top[1]) top[1] = Math.max(top[1], e);
		else merged.push([s, e]);
	}
	const frames: BudgetFrame[] = [];
	for (let i = 0; i + 1 < starts.length; i++) {
		const [from, to] = [starts[i], starts[i + 1]];
		const script = merged.reduce((sum, [s, e]) => sum + Math.max(0, Math.min(e, to) - Math.max(s, from)), 0);
		frames.push({ start: from / 1000, interval: (to - from) / 1000, scriptMs: script / 1000 });
	}
	const longTasks = main.filter((e) => (e.name === "RunTask" || e.name === "ThreadControllerImpl::RunTask") && e.dur! > 16_000).map((e) => ({ t: e.ts / 1000, ms: e.dur! / 1000 }));
	return { frames, longTasks };
}
