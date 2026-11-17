import { readFileSync } from "node:fs";
import { AccelerationStrokes } from "./wheelPager.mjs";
/** The acceleration rule over a grid of windows: synthetic chains (truth known), Max's first recording (6 strokes), r5 counts. */
function flick(t0, dir, peak = 60) { const ev = []; [2, 8, 20, 40, peak * 0.9, peak].forEach((d, i) => ev.push({ t: t0 + i * 8, dx: dir * d, dy: 0 })); let d = peak, t = t0 + 48; while (d >= 1) { ev.push({ t, dx: dir * Math.round(d), dy: 0 }); d *= 0.965; t += 8; } return ev; }
function chain(gap, dirs) { let ev = []; dirs.forEach((dir, i) => { const t0 = 1000 + i * gap; ev = ev.filter((e) => e.t < t0).concat(flick(t0, dir)); }); return ev; }
const rec1 = JSON.parse(readFileSync(process.argv[2], "utf8")).events.filter((e) => e.type === "wheel");
const rec5 = JSON.parse(readFileSync(process.argv[3], "utf8")).events.filter((e) => e.type === "wheel");
const run = (d, ev) => ev.map((e) => [e, d.feed(e)]).filter(([, s]) => s);
for (const end of [2, 3]) for (const middle of [6, 8, 10, 12, 15, 20, 70]) for (const rise of [1.1, 1.2, 1.3, 1.5]) {
	if (middle <= end * 2) continue;
	const mk = () => new AccelerationStrokes(end, middle, rise, 0.85);
	let ok = true, maxDelay = 0;
	for (const gap of [150, 250, 400]) for (const dirs of [[1, 1, 1, 1], [1, 1, -1, 1], [-1, -1, 1, 1, 1, -1]]) {
		const got = run(mk(), chain(gap, dirs));
		if (JSON.stringify(got.map(([, s]) => s)) !== JSON.stringify(dirs)) ok = false;
		got.forEach(([e], i) => { maxDelay = Math.max(maxDelay, e.t - (1000 + i * gap)); });
	}
	const r1 = run(mk(), rec1).map(([, s]) => s);
	const ok1 = JSON.stringify(r1) === JSON.stringify([-1, 1, -1, -1, -1, 1]);
	const n5 = run(mk(), rec5).length;
	if (ok && ok1) console.log({ end, middle, rise, maxChainDelayMs: maxDelay, r5strokes: n5 });
}
