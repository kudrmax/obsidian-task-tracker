import { existsSync, readFileSync } from "node:fs";
import { followSteps } from "../lib/follow.mjs";
import { inSpan } from "../lib/replay.mjs";

const RECORDINGS = new URL("../recordings/", import.meta.url).pathname;
/** Max's six swipes, the synthetic chains (each flick into the last one's momentum) and the held drags; his long session r6. */
const REPLAYED = ["max-2026-11-17.json", "synthetic-chained-150ms.json", "synthetic-chained-250ms.json", "synthetic-chained-400ms.json", "synthetic-held-drags.json", "max-2026-11-17-r5.json 1/2", "max-2026-11-17-r5.json 2/2", "max-2026-11-17-r6-pager.json"];
/** r5 runs 115 s with its pauses shortened: replayed in two parts, cut in its 32-minute pause. */
const SPANS = { "1/2": [0, 1_000_000], "2/2": [1_000_000, Infinity] };
/**
 * Max's long sessions: the page takes the wheel's events a frame at a time, so a release near half-way may land the other
 * way than offline. Offline, his raw events against the same merged at 120 Hz (any phase) part at 1–5 of 89 and 132 landings
 * (r5, r6), each landing still within one place of its stroke's. Past the calendar the days are open (slice 2), so his
 * strokes at the calendar count too (r5's second part: 64 steps where the three stops alone gave 49). The page is held to
 * the rule run on the events as it received them (merged a frame at a time, some sent late under load), which r5's second
 * part then meets exactly (0 of 64 in eight runs; against the raw events it parted at 2–6, past the allowance, under
 * load); r6 still parts at 1–5 of 132: up to 8 %, at least two.
 */
const LONG = new Set(["max-2026-11-17-r5.json", "max-2026-11-17-r6-pager.json"]);
const LONG_ASTRAY = 0.08;

/** The places a run of steps stands at from Soon: from Inbox on, past the calendar the days. */
function atRow(steps) {
	const places = [1];
	for (const s of steps) places.push(Math.max(0, places.at(-1) + s));
	return places.filter((p, i) => i === 0 || p !== places[i - 1]);
}

/**
 * Step 7, the ribbon as a gallery (plan 2026-11-19, «Max's decision on the ribbon»; stage0.md, «Round seven»): the three
 * stops and past the calendar the days, the columns following two fingers on the trackpad as one on glass, landing on the nearest stop or one on by the
 * speed, never two; the momentum moves nothing; a stroke during a landing takes the strip from where it stands.
 *
 * On the desktop each recording is replayed at its own pace and must land where the rule, run offline on the same events,
 * lands (each stroke at most one place, a stop or a day, from where it began), never stalling between stops, nothing jumping.
 */
export default {
	name: "e9-ribbon-follow",
	features: ["Step 7: swipe the columns (the ribbon as a gallery)"],
	platforms: ["desktop"],
	cases: REPLAYED,
	async run(t, item) {
		const [file, part] = item.split(" ");
		const span = part ? SPANS[part] : null;
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("soon");
		const rec = JSON.parse(readFileSync(RECORDINGS + file, "utf8"));
		const wheels = (span ? inSpan(rec.events, span) : rec.events).filter((e) => e.type === "wheel");
		const { steps, furthest, movedInMomentum } = followSteps(wheels, rec.w / 2, { start: 1, last: Infinity });
		t.expect(furthest <= 1 && movedInMomentum === 0, `offline: a stroke's landing ${furthest} stops from where it began, ${movedInMomentum} moves in the momentum`);
		const expectFile = RECORDINGS + file.replace(/\.json$/, ".expect.json");
		/** The held drags' file is the round-six pager's (a held drag under half a place turned it); the gallery springs back. */
		if (existsSync(expectFile) && file !== "synthetic-held-drags.json") {
			const swipes = JSON.parse(readFileSync(expectFile, "utf8")).swipes;
			t.expect(JSON.stringify(atRow(steps)) === JSON.stringify(atRow(swipes)), `offline the rule lands as expected: ${JSON.stringify(steps)} against ${JSON.stringify(swipes)}`);
		}
		/**
		 * The page against the rule run on the events as the page received them: Chromium merges a frame's wheel events into
		 * one, the replay loop sends some late under load, and @use-gesture's wheel end (by the page's clock, a timer set as
		 * its own) lets the fingers go there, on the page as offline, the landing between on the page's clock. A stroke whose
		 * events reached the page after that end goes on from where the page last drew the columns, somewhere between the
		 * release and the landing by the clock: the rule is run at both, and the page is held to either. Each landing is still
		 * at most one place from its stroke's start.
		 */
		const stepsFor = (received) => {
			const as = (stillOnResume) => followSteps(received, rec.w / 2, { start: 1, last: Infinity, ended: received.map((e) => e.ended), heard: received.map((e) => e.heard), endedAt: received.map((e) => e.endedAt), stillOnResume });
			const runs = [as(false), as(true)];
			for (const run of runs) t.expect(run.furthest <= 1, `on the events as the page received them, a stroke's landing ${run.furthest} places from where it began (one swipe, one place)`);
			return runs.map((run) => run.steps);
		};
		const result = await t.replay(file, { startPlace: 1, steps, stepsFor, tolerant: LONG.has(file) && LONG_ASTRAY, span });
		t.expect(result.ok, `${file}: stops ${JSON.stringify(result.observed)} against ${JSON.stringify(result.expected)}, astray ${result.astray}, stalls ${result.stalls}, frame faults ${JSON.stringify(result.faults.slice(0, 3))}`);
	},
};
