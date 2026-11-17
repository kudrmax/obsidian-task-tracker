import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
/**
 * The user's truth for a drop on the timeline: the hour line the pointer is on, read from the visible hour label, then
 * (a) the tasks file has that time, (b) the block's top sits on that line within 1 px, (c) the block is visible every frame.
 * Runs each case after zooming (ctrl+wheel) and scrolling as a person would. `node tl-oracle.mjs <label>`
 */
const c = await connect();
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const mouse = (type, p, down = true) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : down ? 1 : 0, clickCount: 1 });
const lineOf = (label) => c.evaluate(`(() => { const e = [...document.querySelectorAll(".tcs-hour")].find(h => h.textContent.trim() === "${label}"); if (!e) return null; const r = e.getBoundingClientRect(); const t = document.querySelector(".tcs-timeline").getBoundingClientRect(); return { y: r.top, visible: r.top >= t.top && r.top <= t.bottom, x: t.left + 120 }; })()`);
const fileTime = (id) => c.evaluate(`app.vault.adapter.read("TODOs Tasks.md").then(t => { const title = tcSpike.store.getState().faces["${id}"].title; const l = t.split("\\n").find(l => l.includes(title + " ")); const m = l && l.match(/[⏰📌🚨🔕] \\d{4}-\\d\\d-\\d\\d (\\d\\d:\\d\\d)/); return { line: l, time: m ? m[1] : null }; })`);
async function zoomTo(steps, at) {
	for (let i = 0; i < Math.abs(steps); i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: 0, deltaY: steps > 0 ? -6 : 6, modifiers: 2 }); await sleep(16); }
	await sleep(400);
}
async function scrollToHour(label) {
	await c.evaluate(`(() => { const e = [...document.querySelectorAll(".tcs-hour")].find(h => h.textContent.trim() === "${label}"); const tl = document.querySelector(".tcs-timeline"); tl.scrollTop = e.offsetTop - tl.clientHeight / 2; return 1 })()`);
	await sleep(300);
}
const results = [];
async function dropCase(name, source, targetLabel, zoomSteps, scrollLabel) {
	await c.evaluate(`(async () => { const s = tcSpike.store.getState(); s.setPlace(1); s.setHourPx(56); document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); await new Promise(r => setTimeout(r, 700)); return 1 })()`);
	const tl = await rectOf(c, ".tcs-timeline");
	await zoomTo(zoomSteps, { x: tl.x, y: tl.y });
	await scrollToHour(scrollLabel);
	const id = source === "list" ? await st("s.columns.day[0]") : await st(`s.slotted.find(i => { const r = document.querySelector('[data-block="' + i + '"]')?.getBoundingClientRect(); const t = document.querySelector(".tcs-timeline").getBoundingClientRect(); return r && r.top > t.top + 20 && r.bottom < t.bottom - 20 && document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(8, r.height / 2))?.closest("[data-block]")?.dataset.block === i; })`);
	if (!id) { results.push({ name, error: "no source" }); return; }
	const from = source === "list" ? await rectOf(c, `[data-id="${id}"]`) : await rectOf(c, `[data-block="${id}"]`);
	const fromPt = { x: from.x, y: from.top + Math.min(8, from.h / 2) };
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: fromPt.x, y: fromPt.y });
	await mouse("mousePressed", fromPt);
	await sleep(60);
	let line = await lineOf(targetLabel);
	const steps = 25;
	for (let i = 1; i <= steps; i++) { line = await lineOf(targetLabel); const to = { x: line.x, y: line.y }; await mouse("mouseMoved", { x: fromPt.x + (to.x - fromPt.x) * (i / steps), y: fromPt.y + (to.y - fromPt.y) * (i / steps) }); await sleep(16); }
	await sleep(150);
	line = await lineOf(targetLabel);
	await mouse("mouseMoved", { x: line.x, y: line.y });
	await sleep(120);
	line = await lineOf(targetLabel);
	await c.evaluate(`window.__seen = []; window.__seenOn = true; (function t(){ if (!window.__seenOn) return; const e = document.querySelector('[data-block="${id}"]'); let o = 0; if (e) { o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; } const ov = document.querySelector('[data-overlay="${id}"]'); window.__seen.push(Math.max(o, ov ? 1 : 0)); requestAnimationFrame(t); })(); 1`);
	await mouse("mouseReleased", { x: line.x, y: line.y });
	await sleep(1500);
	await c.evaluate(`window.__seenOn = false; 1`);
	const seen = await c.evaluate(`window.__seen`);
	const lineAfter = await lineOf(targetLabel);
	const block = await rectOf(c, `[data-block="${id}"]`);
	const ft = await fileTime(id);
	const ok = ft.time === targetLabel.padStart(5, "0") && block && Math.abs(block.top - lineAfter.y) <= 1 && seen.every((v) => v > 0.95);
	results.push({ name, ok, aimed: targetLabel, file: ft.time, blockTop: block ? +block.top.toFixed(1) : null, lineTop: +lineAfter.y.toFixed(1), hourPx: await st("s.hourPx"), invisibleFrames: seen.filter((v) => v <= 0.95).length });
}
const cases = [
	["list, zoom 1x, evening", "list", "23:00", 0, "22:00"],
	["list, zoomed in, evening", "list", "23:00", 12, "23:00"],
	["list, zoomed in more, night", "list", "1:00", 20, "1:00"],
	["list, zoomed out, night", "list", "2:00", -6, "1:00"],
	["block, zoom 1x", "block", "23:00", 0, "22:00"],
	["block, zoomed in", "block", "23:00", 12, "22:00"],
	["block, zoomed out", "block", "1:00", -6, "23:00"],
];
for (const k of cases.filter((k) => !process.env.CASE || k[0].includes(process.env.CASE))) { await dropCase(...k); console.log(JSON.stringify(results.at(-1))); }
c.close();
