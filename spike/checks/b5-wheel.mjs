import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
if (process.argv.includes("reload")) await c.evaluate(`(async () => { app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach()); await app.plugins.disablePlugin("task-calendar-spike"); await app.plugins.enablePlugin("task-calendar-spike"); await tcSpike.open(false); await new Promise(r => setTimeout(r, 1000)); return 1 })()`);
if (process.argv.includes("snap")) { await c.evaluate(`tcSpike.store.getState().setRibbon("snap")`); await sleep(500); }
const r = await rectOf(c, ".tcs-ribbon, .tcs-ribbon-snap");
const place = () => c.evaluate(`tcSpike.store.getState().place`);
const trackX = () => c.evaluate(`Math.round(document.querySelector(".tcs-track").getBoundingClientRect().left)`);
/** A macOS trackpad flick: the finger's events, then the momentum tail, deltas in px. */
async function flick(dir, { strength = 1 } = {}) {
	const finger = [4, 9, 16, 24, 32, 38, 40, 36, 30].map((d) => d * strength);
	const tail = Array.from({ length: 40 }, (_, i) => Math.max(1, Math.round(28 * strength * Math.exp(-i / 9))));
	const xs = [];
	for (const d of [...finger, ...tail]) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x, y: r.y, deltaX: d * dir, deltaY: 0 }); await sleep(16); }
	await sleep(900);
}
async function slow(dir, px) {
	for (let i = 0; i < 30; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x, y: r.y, deltaX: (px / 30) * dir, deltaY: 0 }); await sleep(30); }
	await sleep(900);
}
const log = [];
log.push(["start", await place(), await trackX()]);
await flick(1); log.push(["flick →", await place(), await trackX()]);
await flick(1); log.push(["flick →", await place(), await trackX()]);
await flick(-1); log.push(["flick ←", await place(), await trackX()]);
await flick(-1, { strength: 2.5 }); log.push(["strong flick ←", await place(), await trackX()]);
await slow(1, r.w * 0.3); log.push(["slow 30% →", await place(), await trackX()]);
await slow(1, r.w * 0.6); log.push(["slow 60% →", await place(), await trackX()]);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: r.x, y: r.y, deltaX: 0, deltaY: 120 }); await sleep(600); log.push(["vertical wheel", await place(), await trackX()]);
console.log("ribbon width", r.w); for (const l of log) console.log(l.join("\t"));
c.close();
