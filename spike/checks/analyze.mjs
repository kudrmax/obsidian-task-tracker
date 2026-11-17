import { readFileSync } from "node:fs";
/** Per card: frames with two visible copies, and position reversals (a card going back the way it came) after it starts moving. */
export function analyze(samples, ids, { axis = 1 } = {}) {
	const report = {};
	for (const id of ids) {
		let doubles = 0, reversals = 0, maxStep = 0, path = [];
		let prevDir = 0, prev = null;
		for (const row of samples) {
			const els = (row[id] ?? []).filter((e) => e[2] > 0.05);
			if (els.length > 1) doubles++;
			const v = els[0]?.[axis];
			if (v === undefined) { path.push("·"); continue; }
			if (prev !== null) {
				const d = v - prev;
				if (Math.abs(d) > 0.5) {
					const dir = Math.sign(d);
					if (prevDir && dir !== prevDir && Math.abs(d) > 2) reversals++;
					prevDir = dir;
					maxStep = Math.max(maxStep, Math.abs(d));
				}
			}
			if (prev !== v) path.push(v);
			prev = v;
		}
		report[id] = { doubles, reversals, maxStep: Math.round(maxStep), path: path.join(" ") };
	}
	return report;
}
if (process.argv[2]) {
	const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
	const r = analyze(d.samples, d.ids ?? d.watch, { axis: +(process.argv[3] ?? 1) });
	console.log("frames", d.samples.length, "overlay frames", d.samples.filter((s) => s.overlay).length);
	for (const [k, v] of Object.entries(r)) console.log(k, JSON.stringify(v));
}
