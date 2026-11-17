import { connect, sleep, SAMPLER } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const touch = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 4, radiusY: 4, force: 1 })) });
async function path(from, to, { holdMs = 0, steps = 15, stepMs = 16 } = {}) {
	await touch("touchStart", [from]);
	if (holdMs) await sleep(holdMs);
	for (let i = 1; i <= steps; i++) { await touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]); await sleep(stepMs); }
	await sleep(holdMs ? 150 : 0);
	await touch("touchEnd", []);
}
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const out = {};
if (process.argv.includes("reload")) { await c.evaluate(`(async () => { app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach()); await app.plugins.disablePlugin("task-calendar-spike"); await app.plugins.enablePlugin("task-calendar-spike"); require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); await tcSpike.open(false); await new Promise(r => setTimeout(r, 1200)); return 1 })()`); }
await c.evaluate(`window.__everDragged = false; tcSpike.store.subscribe((s) => { if (s.dragging) window.__everDragged = true; }); 1`);
const ribbon = await rectOf(c, ".tcs-ribbon");
// T3 first: the very first swipe after load.
out.placeAtLoad = await st("s.place");
await path({ x: ribbon.x + 120, y: ribbon.y }, { x: ribbon.x - 40, y: ribbon.y + 4 }, { steps: 8, stepMs: 14 });
await sleep(900); out.afterFirstFlickLeft = await st("s.place"); out.draggedByFlick = await c.evaluate("window.__everDragged");
await path({ x: ribbon.x + 120, y: ribbon.y }, { x: ribbon.x - 40, y: ribbon.y + 4 }, { steps: 8, stepMs: 14 });
await sleep(900); out.afterSecondFlickLeft = await st("s.place");
await path({ x: ribbon.x - 100, y: ribbon.y }, { x: ribbon.x - 20, y: ribbon.y }, { steps: 30, stepMs: 25 });
await sleep(900); out.afterSlow20pctRight = await st("s.place");
await path({ x: ribbon.x - 150, y: ribbon.y }, { x: ribbon.x + 130, y: ribbon.y }, { steps: 40, stepMs: 25 });
await sleep(900); out.afterSlow70pctRight = await st("s.place");
await path({ x: ribbon.x - 150, y: ribbon.y }, { x: ribbon.x + 150, y: ribbon.y }, { steps: 6, stepMs: 14 });
await sleep(900); out.afterFlickRight = await st("s.place");
// T2: a quick vertical swipe scrolls the column, no drag.
await c.evaluate(`window.__everDragged = false; document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); 1`);
const inbox0 = await st("s.columns.inbox.slice(0, 3).join()");
const col = await rectOf(c, '[data-col="inbox"] .tcs-column-scroll');
await path({ x: col.x, y: col.y + 200 }, { x: col.x, y: col.y - 150 }, { steps: 10, stepMs: 16 });
await sleep(800);
out.verticalSwipe = { scrollTop: await c.evaluate(`document.querySelector('[data-col="inbox"] .tcs-column-scroll').scrollTop`), dragged: await c.evaluate("window.__everDragged"), orderKept: inbox0 === (await st("s.columns.inbox.slice(0, 3).join()")), place: await st("s.place") };
await c.evaluate(`document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); 1`); await sleep(300);
// T1: long press, then drag Inbox[0] to Soon.
const id = await st("s.columns.inbox[0]"), soon2 = await st("s.columns.soon[2]");
const a = await rectOf(c, `[data-id="${id}"]`), b = await rectOf(c, `[data-id="${soon2}"]`);
await c.evaluate(SAMPLER);
await c.evaluate(`window.__stop = __sample(["${id}"])`);
await touch("touchStart", [a]); await sleep(150);
out.longPress = { draggingAt150ms: await st("s.dragging") };
await sleep(250);
out.longPress.draggingAt400ms = await st("s.dragging");
for (let i = 1; i <= 25; i++) { await touch("touchMove", [{ x: a.x + ((b.x - a.x) * i) / 25, y: a.y + ((b.top + 4 - a.y) * i) / 25 }]); await sleep(16); }
out.longPress.placeWhileDragging = await st("s.place");
out.longPress.columnScrolledWhileDragging = await c.evaluate(`document.querySelector('[data-col="inbox"] .tcs-column-scroll').scrollTop`);
await c.shot("phone-long-press-drag");
await sleep(150); await touch("touchEnd", []); await sleep(1200);
await c.evaluate(`window.__stop()`);
out.longPress.landedInSoonAt = (await st("s.columns.soon")).indexOf(id);
out.longPress.stillInInbox = (await st("s.columns.inbox")).includes(id);
// T6: a short press moved a little before the delay: no drag.
await c.evaluate(`window.__everDragged = false; 1`);
const t6 = await rectOf(c, `[data-id="${await st("s.columns.inbox[1]")}"]`);
await path(t6, { x: t6.x, y: t6.y + 30 }, { steps: 5, stepMs: 16 });
await sleep(500); out.quickMoveNoDrag = !(await c.evaluate("window.__everDragged"));
console.log(JSON.stringify(out, null, 1));
c.close();
