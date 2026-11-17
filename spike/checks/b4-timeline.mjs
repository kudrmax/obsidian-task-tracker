import { connect, mouseDrag, sleep, SAMPLER } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.evaluate(SAMPLER);
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const line = (id) => c.evaluate(`(async () => { const s = tcSpike.store.getState(); const t = await app.vault.adapter.read("TODOs Tasks.md"); return t.split("\\n").find(l => l.includes(s.faces["${id}"].title + " ")) ?? t.split("\\n").find(l => l.includes(s.faces["${id}"].title)); })()`);
const grid = await rectOf(c, ".tcs-grid");
const hourPx = await st("s.hourPx");
// (a) a day-list card dropped on the timeline at about 18:20
const dayId = await st("s.columns.day[0]");
const a = await rectOf(c, `[data-id="${dayId}"]`);
const targetY = grid.top + (18 + 20 / 60) * hourPx;
await c.evaluate(`window.__stop = __sample(["${dayId}"], (id) => '[data-overlay="' + id + '"] .tcs-card, [data-block="' + id + '"]')`);
await mouseDrag(c, a, { x: grid.left + 300, y: targetY + (a.y - a.top) }, { steps: 30 });
await sleep(1200);
const sa = await c.evaluate(`window.__stop()`);
const overlayTops = [...new Set(sa.map((r) => r[dayId]?.[0]?.[1]).filter((v) => v !== undefined))];
console.log("(a) list→timeline: line now:", await line(dayId), "| slotted:", await st(`s.slotted.includes("${dayId}")`));
console.log("    overlay/block tops seen while over the grid (px from grid top):", overlayTops.map((v) => v - grid.top).slice(-12).join(" "), "| step px", hourPx / 4);
// (b) a timeline block moved by 1h 30m
const tl = await st("s.slotted[2]");
const before = await line(tl);
const b = await rectOf(c, `[data-block="${tl}"]`);
await c.evaluate(`window.__stop = __sample(["${tl}"], (id) => '[data-overlay="' + id + '"] .tcs-card')`);
await mouseDrag(c, b, { x: b.x, y: b.y + 1.5 * hourPx + 5 }, { steps: 25 });
const sb = await c.evaluate(`window.__stop()`);
await sleep(1200);
const tops = [...new Set(sb.map((r) => r[tl]?.[0]?.[1]).filter((v) => v !== undefined))];
console.log("(b) timeline move: before", before, "\n    after", await line(tl));
console.log("    overlay tops during drag (delta from start):", tops.map((v) => v - tops[0]).join(" "));
// (c) resize the block's end down by one hour
const rid = await st("s.slotted[4]");
const rb = await line(rid);
const h = await rectOf(c, `[data-handle="${rid}"]`);
await mouseDrag(c, h, { x: h.x, y: h.y + hourPx }, { steps: 20 });
await sleep(1000);
console.log("(c) resize: before", rb, "\n    after", await line(rid));
// (d) trackpad pinch = wheel with ctrl over the timeline
const tlr = await rectOf(c, ".tcs-timeline");
const h0 = await st("s.hourPx");
for (let i = 0; i < 10; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: tlr.x, y: tlr.y, deltaX: 0, deltaY: -10, modifiers: 2 }); await sleep(16); }
await sleep(300);
const h1 = await st("s.hourPx");
console.log("(d) ctrl+wheel pinch: hourPx", h0, "→", h1, "| grid height", (await rectOf(c, ".tcs-grid")).h);
await c.shot("b4-timeline-after");
c.close();
