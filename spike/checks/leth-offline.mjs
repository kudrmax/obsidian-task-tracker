import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Lethargy } = require(process.argv[3] + "/node_modules/lethargy/lethargy.js");
/** Lethargy over the recorded horizontal swipes (dx as its delta), at the recording's pace: where it calls a delta intentional. */
const rec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const wheel = rec.events.filter((e) => e.type === "wheel" && Math.abs(e.dx) > Math.abs(e.dy));
const l = new Lethargy();
const t0 = wheel[0].t, start = performance.now();
let line = [], lastT = 0;
for (const e of wheel) {
	const due = e.t - t0 - (performance.now() - start);
	if (due > 0) await new Promise((r) => setTimeout(r, due));
	if (e.t - lastT > 300) { if (line.length) console.log(line.join(" ")); line = [`@${Math.round(e.t - t0)}`]; }
	lastT = e.t;
	const r = l.check({ deltaY: -e.dx });
	line.push(`${Math.round(e.dx)}${r ? (r > 0 ? "▲" : "▼") : "·"}`);
}
console.log(line.join(" "));
