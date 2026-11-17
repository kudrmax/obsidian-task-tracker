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
export async function replay(cdp, file, { startPlace = 1 } = {}) {
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
	const observed = [];
	for (const p of places) {
		const near = Math.round(p);
		if (Math.abs(p - near) <= ON_PLACE && observed.at(-1) !== near) observed.push(near);
	}
	const expectedPlaces = expected ? dedupe(expected.reduce((acc, s) => [...acc, Math.max(0, Math.min(2, acc.at(-1) + s))], [startPlace])) : null;
	let stalls = 0;
	for (let i = 0; i + STALL_FRAMES <= places.length; i++) {
		const window = places.slice(i, i + STALL_FRAMES);
		if (Math.abs(window[0] - Math.round(window[0])) > ON_PLACE && window.every((p) => Math.abs(p - window[0]) < 0.002)) {
			stalls++;
			i += STALL_FRAMES;
		}
	}
	const leaps = observed.slice(1).filter((p, i) => Math.abs(p - observed[i]) > 1).length;
	const faults = frameFaults(shown);
	return { recording: file.split("/").pop(), expected: expectedPlaces, observed, leaps, stalls, faults, frames: shown.length, ok: (expectedPlaces === null || same(expectedPlaces, observed)) && leaps === 0 && stalls === 0 && faults.length === 0 };
}

const dedupe = (xs) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
