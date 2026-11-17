import { readFileSync, writeFileSync } from "node:fs";
import { AccelerationStrokes, LethargyStrokes } from "./wheelPager.mjs";
/** Runs both stroke detectors over recorded and synthetic wheel streams (Lethargy's clock is the stream's). */
const realNow = Date.now;
function run(make, events) {
	const d = make();
	const out = [];
	for (const e of events) {
		Date.now = () => e.t;
		const step = d.feed(e);
		if (step) out.push({ t: e.t, step });
	}
	Date.now = realNow;
	return out;
}
/** A flick as the trackpad sends it: a rising finger phase, then a decaying tail, cut when the next stroke begins. */
function flick(t0, dir, peak = 60) {
	const ev = [];
	const rise = [2, 8, 20, 40, peak * 0.9, peak];
	rise.forEach((d, i) => ev.push({ t: t0 + i * 8, dx: dir * d, dy: 0 }));
	let d = peak, t = t0 + rise.length * 8;
	while (d >= 1) { ev.push({ t, dx: dir * Math.round(d), dy: 0 }); d *= 0.965; t += 8; }
	return ev;
}
function chain(gap, dirs) {
	let ev = [];
	dirs.forEach((dir, i) => {
		const t0 = 1000 + i * gap;
		ev = ev.filter((e) => e.t < t0).concat(flick(t0, dir));
	});
	return ev;
}
const synth = {};
for (const gap of [150, 250, 400]) synth[`chain ${gap} ms, 4 strokes on`] = { events: chain(gap, [1, 1, 1, 1]), expect: [1, 1, 1, 1] };
synth["chain 250 ms, on on back on"] = { events: chain(250, [1, 1, -1, 1]), expect: [1, 1, -1, 1] };
const results = {};
for (const [name, { events, expect }] of Object.entries(synth)) {
	for (const [dn, make] of [["acceleration", () => new AccelerationStrokes()], ["lethargy", () => new LethargyStrokes()]]) {
		const got = run(make, events);
		const starts = expect.map((_, i) => 1000 + i * +name.match(/\d+/)[0]);
		const delays = got.map((g) => Math.round(g.t - [...starts].reverse().find((s) => s <= g.t)));
		results[`${name} | ${dn}`] = { ok: JSON.stringify(got.map((g) => g.step)) === JSON.stringify(expect), got: got.map((g) => g.step), delaysFromStrokeStartMs: delays };
	}
}
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(48), JSON.stringify(v));
for (const file of process.argv.slice(2)) {
	const rec = JSON.parse(readFileSync(file, "utf8"));
	const events = rec.events.filter((e) => e.type === "wheel");
	const t0 = rec.events[0].t;
	for (const [dn, make] of [["acceleration", () => new AccelerationStrokes()], ["lethargy", () => new LethargyStrokes()]]) {
		const got = run(make, events);
		console.log(`\n${file.split("/").pop()} | ${dn}: ${got.length} strokes`);
		console.log(got.map((g) => `${((g.t - t0) / 1000).toFixed(2)}s${g.step > 0 ? "+" : "-"}`).join(" "));
	}
}
