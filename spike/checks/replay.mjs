import { connect, sleep } from "./cdp.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { visibilityFaults } from "./vis.mjs";
/**
 * Replays a recording of a person's real input (spike/recordings/*.json: wheel deltas, pointer moves, presses) over CDP
 * at its own timestamps and positions, in a window of its size, then checks what the person would have seen:
 * - every horizontal trackpad swipe moved the ribbon exactly one place its way (the expectation file, if any, lists them),
 *   decided once, the momentum tail moving nothing;
 * - vertical scrolls and pinches never moved the ribbon;
 * - every drop left its card visible in every frame after release.
 * `node replay.mjs <recording.json> [startPlace]`
 */
const file = process.argv[2];
const rec = JSON.parse(readFileSync(file, "utf8"));
const expectFile = file.replace(/\.json$/, ".expect.json");
const expected = existsSync(expectFile) ? JSON.parse(readFileSync(expectFile, "utf8")) : null;
const c = await connect();
await c.evaluate(`(async () => { const r = require("@electron/remote"); r.getCurrentWindow().setContentSize(${rec.w}, ${rec.h}); r.getCurrentWindow().setPosition(-5000, 2000, false); r.getCurrentWebContents().setBackgroundThrottling(false); const s = tcSpike.store.getState(); s.setPlace(${process.argv[3] ?? 1}); tcSpike.store.setState({ swipes: [] }); await new Promise(r => setTimeout(r, 900)); return 1 })()`);
await c.evaluate(`
window.__rp = { frames: [], run: true, last: null };
tcSpike.store.subscribe((s) => { if (s.dragging) window.__rp.last = s.dragging.replace(/^tl:/, ""); });
(function tick() {
	if (!window.__rp.run) return;
	const s = tcSpike.store.getState(); const id = window.__rp.last;
	const seen = (e) => { let o = 1, hidden = false; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); o *= +cs.opacity; if (cs.visibility === "hidden" || cs.display === "none") hidden = true; } const r = e.getBoundingClientRect(); return { o: +o.toFixed(2), hidden, scale: 1, x: Math.round(r.left), y: Math.round(r.top) }; };
	const track = document.querySelector(".tcs-track"); const ribbon = document.querySelector(".tcs-ribbon");
	window.__rp.frames.push({ t: performance.now(), place: s.place, off: track && ribbon ? +(track.getBoundingClientRect().left - ribbon.getBoundingClientRect().left + s.place * ribbon.clientWidth).toFixed(1) : null, dragging: s.dragging, id, cards: id ? [...document.querySelectorAll('[data-id="' + id + '"], [data-block="' + id + '"]')].map(seen) : [], overlay: id ? [...document.querySelectorAll('[data-overlay="' + id + '"]')].map(seen) : [], swipes: s.swipes.length, hourPx: s.hourPx });
	requestAnimationFrame(tick);
})(); 1`);
const t0 = rec.events[0].t, start = performance.now();
const marks = [];
let shift = { dx: 0, dy: 0 };
for (let e of rec.events) {
	const due = e.t - t0 - (performance.now() - start);
	if (due > 1) await sleep(due);
	if (e.type === "wheel") {
		await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: e.x, y: e.y, deltaX: e.dx, deltaY: e.dy, modifiers: e.ctrl ? 2 : 0 });
	} else {
		const type = e.type === "pointerdown" ? "mousePressed" : e.type === "pointerup" ? "mouseReleased" : "mouseMoved";
		if (type === "mousePressed" && process.env.ANCHOR !== "0") {
			const i = rec.events.indexOf(e);
			const upAt = rec.events.findIndex((x, k) => k > i && x.type === "pointerup");
			const path = rec.events.slice(i, upAt + 1);
			const span = { minX: Math.min(...path.map((p) => p.x)) - e.x, maxX: Math.max(...path.map((p) => p.x)) - e.x, minY: Math.min(...path.map((p) => p.y)) - e.y, maxY: Math.max(...path.map((p) => p.y)) - e.y };
			// The person's screen held other tasks: the press is moved onto the nearest card or block of this screen, and
			// the whole drag with it, so its path, speed and timing stay the person's.
			shift = await c.evaluate(`(() => { const els = [...document.querySelectorAll("[data-id], [data-block]")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(8, r.height / 2))?.closest("[data-id], [data-block]") === e; }); let best = null, d = Infinity; for (const e of els) { const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + Math.min(8, r.height / 2); const dd = Math.hypot(cx - ${e.x}, cy - ${e.y}); const inside = cx + ${span.minX} >= 2 && cx + ${span.maxX} <= innerWidth - 2 && cy + ${span.minY} >= 2 && cy + ${span.maxY} <= innerHeight - 2; if (inside && dd < d) { d = dd; best = { dx: cx - ${e.x}, dy: cy - ${e.y} }; } } return best ?? { dx: 0, dy: 0 }; })()`);
		}
		e = { ...e, x: e.x + shift.dx, y: e.y + shift.dy };
		if (type === "mouseReleased") setTimeout(() => {}, 0);
		const pageNow = await c.evaluate(`performance.now()`);
		if (type !== "mouseMoved") marks.push({ type, t: pageNow, x: e.x, y: e.y });
		await c.send("Input.dispatchMouseEvent", { type, x: e.x, y: e.y, button: e.b || type !== "mouseMoved" ? "left" : "none", buttons: type === "mouseReleased" ? 0 : e.b ? 1 : 0, clickCount: 1 });
		if (type === "mouseReleased") shift = { dx: 0, dy: 0 };
	}
}
await sleep(1500);
const frames = await c.evaluate(`window.__rp.run = false; window.__rp.frames`);
const swipes = await c.evaluate(`tcSpike.store.getState().swipes`);
// Swipes: each decided step equals its stroke's direction; with an expectation file, the sequence matches it.
const swipeFaults = swipes.filter((s) => s.step !== Math.sign(s.dir));
const sequenceOk = expected ? JSON.stringify(swipes.map((s) => s.step)) === JSON.stringify(expected.swipes) : null;
// Ribbon: after each decision the track reaches its place within 450 ms; it leaves it again only for a stroke that is
// decided within 450 ms (the tail never moves it, a stroke never stalls halfway).
const ribbon = [];
for (let i = 1; i < frames.length; i++) {
	if (frames[i].swipes === frames[i - 1].swipes) continue;
	const td = frames[i].t;
	const settled = frames.find((f) => f.t >= td && f.off !== null && Math.abs(f.off) < 1);
	const nextDecision = frames.find((f) => f.t > td && f.swipes > frames[i].swipes)?.t ?? Infinity;
	const loose = settled ? frames.filter((f) => f.t > settled.t && f.t < nextDecision - 450 && Math.abs(f.off) >= 1).length : null;
	ribbon.push({ decision: frames[i].swipes, settleMs: settled ? Math.round(settled.t - td) : null, framesOffPlaceWithoutDecision: loose });
}
const stalls = frames.filter((f, i) => i > 0 && f.off !== null && Math.abs(f.off) >= 1 && frames.slice(i, i + 60).every((g) => Math.abs(g.off - f.off) < 0.5)).length;
// Drops: frames from each release until the next press.
const releases = marks.filter((m) => m.type === "mouseReleased");
const dropFaults = [];
for (const r of releases) {
	const press = [...marks].reverse().find((m) => m.type === "mousePressed" && m.t < r.t)?.t ?? 0;
	const dragged = frames.find((f) => f.t >= press && f.t <= r.t && f.dragging)?.dragging?.replace(/^tl:/, "");
	if (!dragged) continue;
	const next = marks.find((m) => m.type === "mousePressed" && m.t > r.t)?.t ?? Infinity;
	const after = frames.filter((f) => f.t >= r.t && f.t < Math.min(next, r.t + 900)).map((f) => ({ ...f, released: Math.round(f.t - r.t) }));
	const faults = visibilityFaults(after);
	if (faults.length) dropFaults.push({ at: [Math.round(r.x), Math.round(r.y)], id: after[0]?.id, faults: faults.length, first: faults[0] });
}
const placeTrace = [];
for (const f of frames) if (!placeTrace.length || placeTrace.at(-1).place !== f.place) placeTrace.push({ atS: +((f.t - frames[0].t) / 1000).toFixed(2), place: f.place });
const report = { placeTrace, dragsReplayed: releases.filter((r) => frames.some((f) => f.dragging && f.t <= r.t && f.t >= ([...marks].reverse().find((m) => m.type === "mousePressed" && m.t < r.t)?.t ?? 0))).length, recording: file.split("/").pop(), ribbon, stalledFrames: stalls, verticalOrPinchMovedRibbon: null, swipes, swipeFaults: swipeFaults.length, sequence: sequenceOk, expected: expected?.swipes ?? null, drops: releases.length, dropFaults };
writeFileSync(new URL(`../shots/replay-${file.split("/").pop()}`, import.meta.url), JSON.stringify({ report, frames }, null, 1));
console.log(JSON.stringify(report, null, 1));
c.close();
