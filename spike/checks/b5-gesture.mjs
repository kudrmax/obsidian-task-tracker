import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
const mode = process.argv[2] ?? "gesture";
const source = process.argv[3] ?? "mouse";
await c.evaluate(`(async () => { app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach()); await app.plugins.disablePlugin("task-calendar-spike"); await app.plugins.enablePlugin("task-calendar-spike"); require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); tcSpike.store.getState().setRibbon("${mode}"); await tcSpike.open(false); await new Promise(r => setTimeout(r, 1000)); return 1 })()`);
const r = await rectOf(c, ".tcs-ribbon, .tcs-ribbon-snap");
const place = () => c.evaluate(`tcSpike.store.getState().place`);
const view = () => c.evaluate(`(() => { const t = document.querySelector(".tcs-track").getBoundingClientRect().left; const rb = document.querySelector(".tcs-ribbon, .tcs-ribbon-snap").getBoundingClientRect().left; return Math.round((rb - t + 6) / ${r.w} * 100) / 100; })()`);
const rows = [];
async function swipe(label, dx, speed, fling) {
	await c.send("Input.synthesizeScrollGesture", { x: r.x, y: r.y, xDistance: dx, yDistance: 0, gestureSourceType: source, speed, preventFling: !fling, repeatCount: 0 });
	await sleep(1400);
	rows.push([label, await place(), await view()]);
}
rows.push(["first state after load", await place(), await view()]);
// xDistance < 0 moves content left: the next place.
await swipe("fast flick 15% → (fling)", -0.15 * r.w, 3000, true);
await swipe("fast flick 15% → (fling)", -0.15 * r.w, 3000, true);
await swipe("fast flick 15% ← (fling)", 0.15 * r.w, 3000, true);
await swipe("slow 30% → (no fling)", -0.3 * r.w, 300, false);
await swipe("slow 60% → (no fling)", -0.6 * r.w, 300, false);
await swipe("long fast 150% ← (fling)", 1.5 * r.w, 4000, true);
console.log(`mode ${mode}, source ${source}, ribbon width ${r.w}`);
for (const row of rows) console.log(row.join("\t"));
c.close();
