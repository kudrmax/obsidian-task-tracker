/**
 * The frame recorder's verdict (spec §Tests 6): a step's frames, sampled every animation frame in the page (rows' boxes,
 * `document.getAnimations()`) and the animations the CDP Animation domain saw start, judged by the failure rules:
 * motion without a cause, single rows moving across a context, overshoot, a rest more than 0.5 px off, gaps or overlaps,
 * a swipe landing two places away. Pure: `tests/e2e/frames.test.ts` proves each rule on made-up frames.
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
}

export interface Place {
	readonly column: string | null;
	readonly index: number | null;
	readonly day: string | null;
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
	/** Another mode, project or filter: drawn in place, no row moves. */
	| "context"
	/** A place or day change: the region moves as a whole. */
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
	/** The card gap the CSS says (`--tc-card-gap`), px. */
	readonly gap: number;
	/** The places a swipe must move the ribbon by (+1 forward, -1 back). */
	readonly expectPlaces?: number;
	/** Row keys exempt from the motion rules: what the step itself carries. */
	readonly carried?: readonly string[];
	/** The step must move something (a drag, a swipe): a step whose gesture did nothing fails, so no rule passes on an empty recording. */
	readonly expectMotion?: boolean;
	/** Animation names a `none` step tolerates (Obsidian's own, a caret). */
	readonly tolerated?: readonly string[];
}

const PX = 0.5;
const near = (a: number, b: number) => Math.abs(a - b) <= PX;
const sameBox = (a: Row, b: Row) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
const byKey = (rows: readonly Row[]) => new Map(rows.map((r) => [r.key, r]));

function motionWithoutCause(step: StepLog): string[] {
	if (step.cause !== "none") return [];
	const out: string[] = [];
	const tolerated = (name: string) => (step.tolerated ?? []).some((t) => name.includes(t));
	const anims = new Set(step.frames.flatMap((f) => f.animations.map((a) => `${a.kind} ${a.name} on ${a.target}`)).filter((a) => !tolerated(a)));
	for (const a of anims) out.push(`motion without a cause: ${a}`);
	for (const a of step.started) if (!tolerated(a.name)) out.push(`motion without a cause: ${a.type} ${a.name} started`);
	for (let i = 1; i < step.frames.length; i++) {
		const before = byKey(step.frames[i - 1].rows);
		for (const row of step.frames[i].rows) {
			const was = before.get(row.key);
			if (was && !sameBox(was, row)) {
				out.push(`motion without a cause: ${row.key} moved at frame ${i}`);
				return out;
			}
		}
	}
	return out;
}

/** Rows standing between where they were and where they end, in a frame: what is moving then, with its offset. */
function inBetween(step: StepLog, frame: Frame): { key: string; dx: number; dy: number }[] {
	const first = byKey(step.frames[0].rows);
	const last = byKey(step.frames[step.frames.length - 1].rows);
	const carried = new Set(step.carried ?? []);
	return frame.rows
		.filter((r) => !carried.has(r.key) && first.has(r.key) && last.has(r.key))
		.filter((r) => !sameBox(r, first.get(r.key)!) && !sameBox(r, last.get(r.key)!))
		.map((r) => ({ key: r.key, dx: r.x - first.get(r.key)!.x, dy: r.y - first.get(r.key)!.y }));
}

function rowsAcrossContext(step: StepLog): string[] {
	if (step.cause !== "context" && step.cause !== "swipe") return [];
	for (let i = 1; i < step.frames.length - 1; i++) {
		const moving = inBetween(step, step.frames[i]);
		if (moving.length === 0) continue;
		if (step.cause === "context") return [`single rows moving across a context at frame ${i}: ${moving.slice(0, 3).map((m) => m.key).join("; ")}`];
		const whole = moving.every((m) => Math.abs(m.dx - moving[0].dx) <= 1 && Math.abs(m.dy - moving[0].dy) <= 1);
		if (!whole) return [`single rows moving across a context at frame ${i}: ${moving.slice(0, 3).map((m) => `${m.key} by ${m.dx.toFixed(1)},${m.dy.toFixed(1)}`).join("; ")}`];
	}
	return [];
}

function overshoot(step: StepLog): string[] {
	if (step.frames.length < 3) return [];
	const first = byKey(step.frames[0].rows);
	const last = byKey(step.frames[step.frames.length - 1].rows);
	const carried = new Set(step.carried ?? []);
	const out: string[] = [];
	for (const [key, end] of last) {
		const start = first.get(key);
		if (!start || carried.has(key)) continue;
		for (const axis of ["x", "y"] as const) {
			const travel = end[axis] - start[axis];
			if (Math.abs(travel) <= PX) continue;
			const beyond = step.frames.map((f) => f.rows.find((r) => r.key === key)?.[axis]).filter((v): v is number => v !== undefined).map((v) => (v - end[axis]) * Math.sign(travel));
			const most = Math.max(...beyond);
			if (most > PX) {
				out.push(`overshoot: ${key} went ${most.toFixed(1)} px past its rest on ${axis}`);
				break;
			}
		}
	}
	return out;
}

function restOff(step: StepLog): string[] {
	const last = byKey(step.frames[step.frames.length - 1].rows);
	return step.rest.flatMap((r) => {
		const at = last.get(r.key);
		if (!at || sameBox(at, r)) return [];
		return [`a rest off: ${r.key} ended at ${at.x.toFixed(1)},${at.y.toFixed(1)} and settled at ${r.x.toFixed(1)},${r.y.toFixed(1)}`];
	});
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
	const first = byKey(step.frames[0].rows);
	const moved = step.frames.some((f) => f.rows.some((r) => first.has(r.key) && !sameBox(first.get(r.key)!, r))) || step.frames.some((f) => f.animations.length > 0);
	const changed = step.frames[0].rows.length !== step.rest.length || step.rest.some((r) => !first.has(r.key) || !sameBox(first.get(r.key)!, r));
	return moved || changed ? [] : ["the gesture moved nothing"];
}

export const FRAME_RULES = { nothingMoved, motionWithoutCause, rowsAcrossContext, overshoot, restOff, gapsAndOverlaps, swipeLanding };

/** Every failure of a step, by the rules of §Tests 6. */
export function judge(step: StepLog): string[] {
	return Object.values(FRAME_RULES).flatMap((rule) => rule(step));
}

export interface Budget {
	readonly frames: number;
	readonly scriptMs: number;
	readonly longTasks: readonly { readonly t: number; readonly ms: number }[];
}

/** The budget (§Tests 6): under 8 ms of script per frame, no long task over 16 ms. */
export function judgeBudget(b: Budget): string[] {
	const out: string[] = [];
	const perFrame = b.frames > 0 ? b.scriptMs / b.frames : b.scriptMs;
	if (perFrame >= 8) out.push(`${perFrame.toFixed(1)} ms of script per frame (budget 8)`);
	for (const t of b.longTasks) if (t.ms > 16) out.push(`a long task of ${t.ms.toFixed(0)} ms`);
	return out;
}
