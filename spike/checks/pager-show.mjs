import { readFileSync } from "node:fs";
import { AccelerationStrokes } from "./wheelPager.mjs";
/** The stream gesture by gesture with each detected stroke start marked ▶, for reading by eye. */
const [file, end, middle, rise, from, to] = process.argv.slice(2);
const ev = JSON.parse(readFileSync(file, "utf8")).events.filter((e) => e.type === "wheel");
const d = new AccelerationStrokes(+end, +middle, +rise, 0.85);
const t0 = ev[0].t;
let line = [], last = -1e9, count = 0;
for (const e of ev) {
	const s = d.feed(e);
	if (e.t - last > 150) { if (line.length && last - t0 >= +from * 1000 && last - t0 <= +to * 1000) console.log(line.join(" ")); line = [`\n@${((e.t - t0) / 1000).toFixed(2)}s`]; }
	last = e.t;
	const v = Math.abs(e.dx) >= Math.abs(e.dy) ? Math.round(e.dx) : `v${Math.round(e.dy)}`;
	line.push(s ? `▶${s > 0 ? "+" : "-"}${v}` : `${v}`);
	if (s) count++;
}
console.log(line.join(" ")); console.log("strokes", count);
