import { existsSync, readFileSync } from "node:fs";
import { sleep } from "./cdp.mjs";
import { FrameRecorder, frameFaults } from "./frames.mjs";

/** Pauses in a recording longer than this are shortened to it: a recording can span minutes of thinking. */
const LONGEST_PAUSE_MS = 2000;
/** The ribbon stands on a place when it is this close to it, in places. */
const ON_PLACE = 0.01;
/** Frames the ribbon may stand between places, not moving, before it counts as stalled. */
const STALL_FRAMES = 60;

/**
 * Replays a recording of a person's real input (`tests/e2e/recordings/*.json`: wheel deltas, pointer moves and presses, with
 * their timestamps and positions) over CDP at its own pace, in a window of its size, and checks what the person saw: the
 * places the ribbon stood at, in order, against the recording's `.expect.json` (each stroke one place its way, clamped at
 * the row's ends); never two places at once; never a stall between places; and the shared frame checks.
 */
export async function replay(cdp, file, { startPlace = 1, strokes = [] } = {}) {
	const rec = JSON.parse(readFileSync(file, "utf8"));
	let removed = 0;
	let prev = rec.events[0].t;
	for (const e of rec.events) {
		const gap = e.t - prev;
		if (gap > LONGEST_PAUSE_MS) removed += gap - LONGEST_PAUSE_MS;
		prev = e.t;
		e.t -= removed;
	}
	const expectFile = file.replace(/\.json$/, ".expect.json");
	const expected = existsSync(expectFile) ? JSON.parse(readFileSync(expectFile, "utf8")).swipes : null;
	const frames = new FrameRecorder(cdp);
	await frames.start();
	const t0 = rec.events[0].t;
	const start = performance.now();
	for (const e of rec.events) {
		const due = e.t - t0 - (performance.now() - start);
		if (due > 1) await sleep(due);
		if (e.type === "wheel") {
			void cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: e.x, y: e.y, deltaX: e.dx, deltaY: e.dy, modifiers: e.ctrl ? 2 : 0 });
			continue;
		}
		const type = e.type === "pointerdown" ? "mousePressed" : e.type === "pointerup" ? "mouseReleased" : "mouseMoved";
		void cdp.send("Input.dispatchMouseEvent", { type, x: e.x, y: e.y, button: e.b || type !== "mouseMoved" ? "left" : "none", buttons: type === "mouseReleased" ? 0 : e.b ? 1 : 0, clickCount: 1 });
	}
	await sleep(1200);
	const shown = await frames.stop();
	const places = shown.map((f) => f.place).filter((p) => p !== null);
	/** What a person saw settle: the place the ribbon stood on, and the day the calendar showed there. */
	const observed = [];
	for (const f of shown) {
		if (f.place === null) continue;
		const near = Math.round(f.place);
		const state = near === 2 ? `2:${["Today", "Tomorrow"].includes(f.day) ? f.day : "later"}` : String(near);
		if (Math.abs(f.place - near) <= ON_PLACE && observed.at(-1) !== state) observed.push(state);
	}
	/**
	 * Where each stroke leads: one place its way; on from Now–calendar the next day's calendar, back from a later day the day
	 * before; nothing before Inbox. Without an expectation file the strokes are the recorded ones as the pager's rule finds
	 * them (`strokes`), and the run must end where they lead, settling on no place they do not pass.
	 */
	const steps = expected ?? strokes;
	const days = ["Today", "Tomorrow"];
	const nameOf = (place, day) => (place === 2 ? `2:${days[day] ?? "later"}` : String(place));
	const path = [];
	let place = startPlace;
	let day = 0;
	path.push(nameOf(place, day));
	for (const s of steps) {
		if (s > 0) {
			if (place < 2) place++;
			else day++;
		} else if (place === 2 && day > 0) day--;
		else place = Math.max(0, place - 1);
		path.push(nameOf(place, day));
	}
	const expectedPlaces = dedupe(path);
	let stalls = 0;
	for (let i = 0; i + STALL_FRAMES <= places.length; i++) {
		const window = places.slice(i, i + STALL_FRAMES);
		if (Math.abs(window[0] - Math.round(window[0])) > ON_PLACE && window.every((p) => Math.abs(p - window[0]) < 0.002)) {
			stalls++;
			i += STALL_FRAMES;
		}
	}
	/** A stroke during the landing adds a place: the ribbon may pass a place without settling on it, never one it was not sent to. */
	const leaps = isSubsequence(observed, expectedPlaces) ? 0 : 1;
	const faults = frameFaults(shown);
	const ends = observed.at(-1) === expectedPlaces.at(-1);
	return { recording: file.split("/").pop(), expected: expected ? expectedPlaces : `${expectedPlaces.length} places by the pager's rule`, observed, leaps, stalls, faults, frames: shown.length, ok: (expected ? same(expectedPlaces, observed) : ends) && leaps === 0 && stalls === 0 && faults.length === 0 };
}

const dedupe = (xs) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
const isSubsequence = (sub, of) => {
	let at = 0;
	for (const x of of) if (sub[at] === x) at++;
	return at === sub.length;
};
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
