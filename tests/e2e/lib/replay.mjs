import { existsSync, readFileSync } from "node:fs";
import { sleep } from "./cdp.mjs";
import { FrameRecorder, frameFaults } from "./frames.mjs";

/** Pauses in a recording longer than this are shortened to it: a recording can span minutes of thinking. */
const LONGEST_PAUSE_MS = 2000;
/** The ribbon stands on a place when it is this close to it, in places. */
const ON_PLACE = 0.01;
/** A run of the screen's trace turns when it goes back by more than this share of a place. */
const TURN = 0.15;
/** Of a long session held to the pager's rule run offline, the share of settled places that may lie off its path. */
const ASTRAY_SHARE = 0.03;
/** Frames the ribbon may stand between places, not moving, before it counts as stalled. */
const STALL_FRAMES = 60;

/**
 * Replays a recording of a person's real trackpad input (`tests/e2e/recordings/*.json`: wheel deltas, pointer moves and presses, with
 * their timestamps and positions) over CDP at its own pace, in a window of its size, and checks what the person saw: the
 * places the ribbon stood at, in order, against the recording's `.expect.json` (each stroke one place its way, clamped at
 * the row's ends); never two places at once; never a stall between places; and the shared frame checks.
 */
export async function replay(cdp, file, { startPlace = 1, strokes = [], steps: given = null, last = Infinity, tolerant = false, span = null } = {}) {
	const rec = JSON.parse(readFileSync(file, "utf8"));
	/** A part of a long session (`span`: from and to, ms from its start): the frames of two minutes at once overrun the page. */
	if (span) rec.events = inSpan(rec.events, span);
	let removed = 0;
	let prev = rec.events[0].t;
	for (const e of rec.events) {
		const gap = e.t - prev;
		if (gap > LONGEST_PAUSE_MS) removed += gap - LONGEST_PAUSE_MS;
		prev = e.t;
		e.t -= removed;
	}
	const expectFile = file.replace(/\.json$/, ".expect.json");
	/**
	 * A step's own expectation (`steps`: each landing its way, `last` the row's end) before the pager's hand-made file;
	 * `tolerant`: the steps are a rule run offline on a long session; the page may part from them at this share of the steps
	 * (true: `ASTRAY_SHARE`, as the pager's rule), at least two.
	 */
	const expected = given ?? (existsSync(expectFile) ? JSON.parse(readFileSync(expectFile, "utf8")).swipes : null);
	const frames = new FrameRecorder(cdp);
	await frames.start();
	/**
	 * The wheel's events alone: the person's pointer moves and presses are not sent, their screen held other things and a
	 * press at their position here can land on Obsidian's own chrome (a run closed the window this way). Stage 2 replays the
	 * drags anchored on this screen's cards, as stage 0 did.
	 */
	const wheels = rec.events.filter((e) => e.type === "wheel");
	const t0 = rec.events[0].t;
	const start = performance.now();
	/** Each event carries its recorded time (CDP's `timestamp`), so the page reads the person's timing, not this loop's jitter. */
	const epoch = Date.now() / 1000;
	for (const e of wheels) {
		const due = e.t - t0 - (performance.now() - start);
		if (due > 1) await sleep(due);
		void cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: e.x, y: e.y, deltaX: e.dx, deltaY: e.dy, modifiers: e.ctrl ? 2 : 0, timestamp: epoch + (e.t - t0) / 1000 });
	}
	await sleep(1200);
	const shown = await frames.stop();
	const places = shown.map((f) => f.place).filter((p) => p !== null);
	/**
	 * Where the screen went, as a position on the row of screens: the place (0 Inbox–Soon, 1 Soon–Now, 2 Now–calendar) and
	 * past it the days, read from the calendar's title (Today, Tomorrow, a date). A stroke can be taken back by the next one
	 * before the screen settles: so the screen's turning points are read, not only where it came to rest. The trace is cut
	 * into runs one way; where a run turns by more than `TURN` of a place, its far end is a place the screen was sent to.
	 */
	const trace = shown.filter((f) => f.place !== null).map((f) => f.place + (Math.round(f.place) === 2 ? dayOffset(f.day) : 0));
	const turns = trace.length ? [trace[0]] : [];
	let far = trace[0];
	let way = 0;
	for (const at of trace) {
		const step = at - far;
		if (way === 0) {
			if (Math.abs(step) > TURN) way = Math.sign(step);
			else continue;
		}
		if (Math.sign(step) === way) far = at;
		else if (Math.abs(step) > TURN) {
			turns.push(far);
			way = -way;
			far = at;
		}
	}
	if (trace.length) turns.push(trace.at(-1));
	const observed = dedupe(turns.map((at) => Math.round(at)));
	/**
	 * Where each stroke leads: one screen its way along the row; nothing before Inbox. Without an expectation file the strokes
	 * are the recorded ones as the pager's rule finds them (`strokes`).
	 */
	const steps = expected ?? strokes;
	const path = [startPlace];
	for (const s of steps) path.push(Math.min(last, Math.max(0, path.at(-1) + s)));
	const expectedPlaces = dedupe(path);
	let stalls = 0;
	for (let i = 0; i + STALL_FRAMES <= places.length; i++) {
		const window = places.slice(i, i + STALL_FRAMES);
		if (Math.abs(window[0] - Math.round(window[0])) > ON_PLACE && window.every((p) => Math.abs(p - window[0]) < 0.002)) {
			stalls++;
			i += STALL_FRAMES;
		}
	}
	/**
	 * A stroke during the landing adds a screen: the ribbon may pass one without settling on it. The run is compared step by
	 * step: each settled move is unrolled into single steps, and the steps that do not line up with the strokes' (in order)
	 * are counted (`astray`). With a hand-made expectation none may; held to the pager's rule run offline, the page may part
	 * from it at a stroke or two of a long session (stage 0: 96–97 of 97, the page receives wheel events in frames), at most
	 * `ASTRAY_SHARE` of the steps.
	 */
	const unroll = (xs) => xs.slice(1).flatMap((x, i) => Array.from({ length: Math.abs(x - xs[i]) }, () => Math.sign(x - xs[i])));
	const seen = unroll(observed);
	const sent = unroll(expectedPlaces);
	const astray = Math.max(seen.length, sent.length) - commonLength(seen, sent);
	const faults = frameFaults(shown);
	const ends = observed.at(-1) === expectedPlaces.at(-1);
	const onPath = expected && !tolerant ? astray === 0 && ends : tolerant ? astray <= Math.max(2, Math.floor(sent.length * (tolerant === true ? ASTRAY_SHARE : tolerant))) : astray <= Math.max(1, Math.floor(sent.length * ASTRAY_SHARE));
	return { recording: file.split("/").pop(), expected: expected ? expectedPlaces : `${sent.length} steps by the pager's rule`, observed: expected ? observed : `${seen.length} steps`, astray, stalls, faults, frames: shown.length, ok: onPath && stalls === 0 && faults.length === 0 };
}

/** The events of `[from, to)` ms from the recording's first. */
export function inSpan(events, [from, to]) {
	const t0 = events[0].t;
	return events.filter((e) => e.t - t0 >= from && e.t - t0 < to);
}

const dedupe = (xs) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
/** The longest common subsequence's length: how many of `a`'s steps lie in order on `b`. */
function commonLength(a, b) {
	let row = new Array(b.length + 1).fill(0);
	for (const x of a) {
		const next = [0];
		for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j]));
		row = next;
	}
	return row[b.length];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** How many days after today the calendar's title is: Today 0, Tomorrow 1, Yesterday -1, «Fri, 20 Nov» by its date. */
function dayOffset(title) {
	if (title === "Today") return 0;
	if (title === "Tomorrow") return 1;
	if (title === "Yesterday") return -1;
	const m = /(\d+) (\w{3})(?: (\d{4}))?$/.exec(title ?? "");
	if (!m) return 0;
	const now = new Date(Date.now() - 5 * 3600_000);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const date = new Date(m[3] ? Number(m[3]) : today.getFullYear(), MONTHS.indexOf(m[2]), Number(m[1]));
	return Math.round((date.getTime() - today.getTime()) / 86_400_000);
}
