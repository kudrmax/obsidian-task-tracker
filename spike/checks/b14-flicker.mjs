import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
import { VIS_SAMPLER, visibilityFaults } from "./vis.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
/** A human-like mouse drag and release, every frame sampled for visibility, plus a CDP screencast. `node b14-flicker.mjs <within|cross|timeline|command> <label>` */
const kind = process.argv[2] ?? "within", label = process.argv[3] ?? "run";
const c = await connect();
await c.evaluate(VIS_SAMPLER);
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const mouse = (type, p) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const frames = []; const dir = new URL(`../shots/screencast-${label}-${kind}/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
c.on("Page.screencastFrame", async (p) => { frames.push(p.metadata.timestamp); writeFileSync(`${dir}${String(frames.length).padStart(3, "0")}.jpg`, Buffer.from(p.data, "base64")); c.send("Page.screencastFrameAck", { sessionId: p.sessionId }); });
let id, from, to;
if (kind === "command") {
	id = await st("s.columns.inbox[0]");
} else if (kind === "timeline") {
	await c.evaluate(`tcSpike.store.getState().setPlace(1); 1`); await sleep(900);
	await c.evaluate(`document.querySelector(".tcs-timeline").scrollTop = 600; document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); 1`); await sleep(300);
	id = await st("s.columns.day[0]");
	from = await rectOf(c, `[data-id="${id}"]`); to = { x: from.x + 500, y: from.y + 260 };
} else {
	await c.evaluate(`tcSpike.store.getState().setPlace(0); document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); 1`); await sleep(900);
	id = await st("s.columns.inbox[0]");
	from = await rectOf(c, `[data-id="${id}"]`);
	const target = await rectOf(c, `[data-id="${await st(kind === "cross" ? "s.columns.soon[2]" : "s.columns.inbox[3]")}"]`);
	to = { x: target.x + 10, y: target.top + 6 };
}
await c.evaluate(`window.__released = 0; window.__stopVis = __vis("${id}"); 1`);
await c.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 });
if (kind === "command") {
	await sleep(100);
	await c.evaluate(`window.__released = performance.now(); app.commands.executeCommandById("task-calendar-spike:first-inbox-to-soon"); 1`);
} else {
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
	await mouse("mousePressed", from);
	await sleep(120);
	const n = 30;
	for (let i = 1; i <= n; i++) { const e = 0.5 - Math.cos((Math.PI * i) / n) / 2; await mouse("mouseMoved", { x: from.x + (to.x - from.x) * e + Math.sin(i) * 1.5, y: from.y + (to.y - from.y) * e }); await sleep(16); }
	await sleep(250);
	await c.evaluate(`window.__released = performance.now(); 1`);
	await mouse("mouseReleased", to);
}
await sleep(900);
await c.send("Page.stopScreencast");
const samples = await c.evaluate(`window.__stopVis()`);
const faults = visibilityFaults(samples);
writeFileSync(new URL(`../shots/vis-${label}-${kind}.json`, import.meta.url), JSON.stringify({ id, kind, faults, samples }, null, 1));
console.log(`${label} ${kind}: ${faults.length} faulty frames after release, screencast ${frames.length} frames in ${dir}`);
for (const f of faults.slice(0, 12)) console.log("  ", JSON.stringify(f));
c.close();
