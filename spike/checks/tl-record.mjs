import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
/**
 * Human-paced timeline interactions, each recorded as a CDP screencast plus a per-frame sample of what the eye sees:
 * the pointer, the overlay, every block, the selection, the grid's highlight, the zoom and the scroll.
 * `node tl-record.mjs <label> [scenario...]`
 */
const label = process.argv[2] ?? "run";
const only = process.argv.slice(3);
const c = await connect();
const SAMPLE = `
window.__ptr = window.__ptr ?? { x: 0, y: 0 };
if (!window.__ptrOn) { window.__ptrOn = true; document.addEventListener("pointermove", (e) => { window.__ptr = { x: e.clientX, y: e.clientY }; }, true); document.addEventListener("wheel", (e) => { window.__ptr = { x: e.clientX, y: e.clientY }; }, true); }
window.__tl = () => {
	const out = []; let run = true; const t0 = performance.now();
	const box = (e) => { const r = e.getBoundingClientRect(); let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; return [Math.round(r.left), Math.round(r.top * 10) / 10, Math.round(r.height), +o.toFixed(2)]; };
	const tick = () => {
		if (!run) return;
		const s = tcSpike.store.getState(); const tl = document.querySelector(".tcs-timeline"); const grid = document.querySelector(".tcs-grid");
		const sel = getSelection();
		out.push({ t: Math.round(performance.now() - t0), ptr: { ...window.__ptr }, overlay: [...document.querySelectorAll("[data-overlay]")].map(box), blocks: Object.fromEntries([...document.querySelectorAll("[data-block]")].map((e) => [e.dataset.block, box(e)])), selection: sel ? sel.toString().length + (sel.rangeCount && !sel.isCollapsed ? 1 : 0) : 0, gridOver: !!grid?.classList.contains("is-over"), gridBg: grid ? getComputedStyle(grid).backgroundColor : null, hourPx: s.hourPx, scrollTop: tl?.scrollTop, gridTop: grid?.getBoundingClientRect().top, dragging: s.dragging });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return () => { run = false; return out; };
};`;
await c.evaluate(SAMPLE);
const mouse = (type, p, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : type === "mouseMoved" && !extra.down ? 0 : 1, clickCount: 1, ...extra });
async function drag(from, to, ms, { holdEnd = 200 } = {}) {
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
	await mouse("mousePressed", from);
	await sleep(80);
	const steps = Math.max(6, Math.round(ms / 16));
	for (let i = 1; i <= steps; i++) { const e = 0.5 - Math.cos((Math.PI * i) / steps) / 2; await mouse("mouseMoved", { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }, { down: true }); await sleep(16); }
	await sleep(holdEnd);
	await mouse("mouseReleased", to);
}
async function path(points, ms) {
	const [from] = points;
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y });
	await mouse("mousePressed", from);
	await sleep(80);
	for (let k = 1; k < points.length; k++) {
		const a = points[k - 1], b = points[k]; const steps = Math.max(6, Math.round(ms / 16));
		for (let i = 1; i <= steps; i++) { await mouse("mouseMoved", { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }, { down: true }); await sleep(16); }
		await sleep(150);
	}
	await mouse("mouseReleased", points.at(-1));
}
async function record(name, act) {
	if (only.length && !only.includes(name)) return;
	const dir = new URL(`../shots/tl-${label}-${name}/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
	let n = 0;
	c.off("Page.screencastFrame");
	c.on("Page.screencastFrame", (p) => { n++; writeFileSync(`${dir}${String(n).padStart(3, "0")}.jpg`, Buffer.from(p.data, "base64")); c.send("Page.screencastFrameAck", { sessionId: p.sessionId }); });
	await c.evaluate(`window.__stopTl = __tl(); 1`);
	await c.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 });
	await act();
	await sleep(700);
	await c.send("Page.stopScreencast");
	const samples = await c.evaluate(`window.__stopTl()`);
	writeFileSync(`${dir}samples.json`, JSON.stringify(samples));
	console.log(`${name}: ${n} frames, ${samples.length} samples -> ${dir}`);
}
const setup = async (scroll) => { await c.evaluate(`(async () => { const s = tcSpike.store.getState(); s.setPlace(1); s.setHourPx(56); await new Promise(r => setTimeout(r, 900)); document.querySelector(".tcs-timeline").scrollTop = ${scroll}; document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); getSelection().removeAllRanges(); return 1 })()`); await sleep(300); };
const midBlock = () => c.evaluate(`tcSpike.store.getState().slotted.find(i => { const r = document.querySelector('[data-block="' + i + '"]')?.getBoundingClientRect(); const h = document.querySelector('[data-handle="' + i + '"]')?.getBoundingClientRect(); return r && r.top > 250 && r.bottom < 600 && r.height > 20 && document.elementFromPoint(r.left + r.width / 2, r.top + 6)?.closest("[data-block]")?.dataset.block === i && document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2)?.dataset.handle === i; })`);

await setup(1000);
let b = await rectOf(c, `[data-block="${await midBlock()}"]`);
await record("block-slow", () => drag({ x: b.x, y: b.top + 8 }, { x: b.x + 30, y: b.top + 8 + 140 }, 2000));
await setup(1000);
b = await rectOf(c, `[data-block="${await midBlock()}"]`);
await record("block-fast", () => drag({ x: b.x, y: b.top + 8 }, { x: b.x, y: b.top + 8 - 120 }, 280));
await setup(1000);
const card = await rectOf(c, `[data-id="${await c.evaluate("tcSpike.store.getState().columns.day[0]")}"]`);
const grid = await rectOf(c, ".tcs-timeline");
await record("list-onto-and-off", () => path([{ x: card.x, y: card.y }, { x: grid.x, y: card.y + 250 }, { x: grid.x + 100, y: card.y + 320 }, { x: card.x, y: card.y + 120 }], 700));
await setup(1000);
const rid = await midBlock();
const h = await rectOf(c, `[data-handle="${rid}"]`);
await record("resize", () => drag(h, { x: h.x, y: h.y + 90 }, 1500));
for (const [name, hour] of [["zoom-07", 7], ["zoom-12", 12], ["zoom-top-edge", 5.3]]) {
	await setup(0);
	const tl = await rectOf(c, ".tcs-timeline");
	const gTop = await c.evaluate(`document.querySelector(".tcs-grid").getBoundingClientRect().top`);
	const y = gTop + (hour - 5) * 56;
	const p = { x: tl.x + 100, y: Math.min(Math.max(y, tl.top + 4), tl.top + tl.h - 4) };
	await record(name, async () => {
		await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
		for (let i = 0; i < 25; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: p.x, y: p.y, deltaX: 0, deltaY: -6, modifiers: 2 }); await sleep(16); }
		await sleep(300);
		for (let i = 0; i < 15; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: p.x, y: p.y, deltaX: 0, deltaY: 6, modifiers: 2 }); await sleep(16); }
	});
}
await setup(0);
{
	const tl = await rectOf(c, ".tcs-timeline");
	const gTop = await c.evaluate(`document.querySelector(".tcs-grid").getBoundingClientRect().top`);
	const p = { x: tl.x + 100, y: gTop + 2 * 56 };
	await record("pinch-07", () => c.send("Input.synthesizePinchGesture", { x: p.x, y: p.y, scaleFactor: 2, relativeSpeed: 300, gestureSourceType: "mouse" }).catch((e) => console.log("pinch", e.message)));
}
c.close();
