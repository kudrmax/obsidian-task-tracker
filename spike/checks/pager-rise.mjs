import { readFileSync } from "node:fs";
import { AccelerationStrokes } from "./wheelPager.mjs";
/** For each stroke the detector finds in a recording: how long after the rise began (the last dip of |dx| before it, or the gesture's first delta) it fired. */
const [, , file, end = 3, middle = 70, rise = 1.3] = process.argv;
const ev = JSON.parse(readFileSync(file, "utf8")).events.filter((e) => e.type === "wheel" && Math.abs(e.dx) > Math.abs(e.dy));
const d = new AccelerationStrokes(+end, +middle, +rise, 0.85);
const lags = [];
ev.forEach((e, i) => {
	if (!d.feed(e)) return;
	let j = i;
	while (j > 0 && ev[i].t - ev[j - 1].t < 300 && ev[j].t - ev[j - 1].t < 200 && Math.sign(ev[j - 1].dx) === Math.sign(e.dx) && Math.abs(ev[j - 1].dx) < Math.abs(ev[j].dx) + 0.5) j--;
	lags.push(Math.round(e.t - ev[j].t));
});
lags.sort((a, b) => a - b);
const q = (p) => lags[Math.min(lags.length - 1, Math.floor(p * lags.length))];
console.log(file.split("/").pop(), { end, middle, rise, strokes: lags.length, median: q(0.5), p90: q(0.9), max: lags.at(-1), over50: lags.filter((x) => x >= 50).length });
