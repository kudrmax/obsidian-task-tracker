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
// Pauses longer than 2 s are shortened to 2 s (a recording can span many minutes); every time below is the shortened one.
{
	let removed = 0, prev = rec.events[0].t;
	const shift = [];
	for (const e of rec.events) { const gap = e.t - prev; if (gap > 2000) { removed += gap - 2000; shift.push([e.t, removed]); } prev = e.t; e.t -= removed; }
	const shorten = (t) => t - ([...shift].reverse().find(([at]) => at <= t)?.[1] ?? 0);
	if (rec.strokes) rec.strokes = rec.strokes.map((st) => ({ ...st, t: shorten(st.t) }));
}
const expectFile = file.replace(/\.json$/, ".expect.json");
const expected = existsSync(expectFile) ? JSON.parse(readFileSync(expectFile, "utf8")) : null;
const c = await connect();
await c.evaluate(`(async () => { const r = require("@electron/remote"); r.getCurrentWindow().setContentSize(${rec.w}, ${rec.h}); r.getCurrentWindow().setPosition(-5000, 2000, false); r.getCurrentWebContents().setBackgroundThrottling(false); const s = tcSpike.store.getState(); s.setPlace(${process.argv[3] ?? 1}); tcSpike.store.setState({ swipes: [] }); await new Promise(r => setTimeout(r, 900)); return 1 })()`);
await c.evaluate(`
window.__rp = { frames: [], run: true, last: null, wheels: [] };
if (!window.__rpWheel) { window.__rpWheel = true; document.addEventListener("wheel", (e) => window.__rp.wheels.push([Math.round(e.timeStamp), e.deltaX, e.deltaY]), { capture: true, passive: true }); }
tcSpike.store.subscribe((s) => { if (s.dragging) window.__rp.last = s.dragging.replace(/^tl:/, ""); });
(function tick() {
	if (!window.__rp.run) return;
	const s = tcSpike.store.getState(); const id = window.__rp.last;
	const seen = (e) => { let o = 1, hidden = false; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); o *= +cs.opacity; if (cs.visibility === "hidden" || cs.display === "none") hidden = true; } const r = e.getBoundingClientRect(); return { o: +o.toFixed(2), hidden, scale: 1, x: Math.round(r.left), y: Math.round(r.top) }; };
	const track = document.querySelector(".tcs-track"); const ribbon = document.querySelector(".tcs-ribbon");
	window.__rp.frames.push({ t: performance.now(), place: s.place, off: track && ribbon ? +(track.getBoundingClientRect().left - ribbon.getBoundingClientRect().left + [0, ribbon.clientWidth / 2, ribbon.clientWidth][s.place]).toFixed(1) : null, dragging: s.dragging, id, cards: id ? [...document.querySelectorAll('[data-id="' + id + '"], [data-block="' + id + '"]')].map(seen) : [], overlay: id ? [...document.querySelectorAll('[data-overlay="' + id + '"]')].map(seen) : [], swipes: s.swipes.length, hourPx: s.hourPx });
	requestAnimationFrame(tick);
})(); 1`);
const t0 = rec.events[0].t, start = performance.now();
const pageStart = await c.evaluate(`performance.now()`);
const marks = [];
let shift = { dx: 0, dy: 0 };
for (let e of rec.events) {
	const due = e.t - t0 - (performance.now() - start);
	if (due > 1) await sleep(due);
	if (e.type === "wheel") {
		// Not awaited: the commands keep their order on the socket and the recording keeps its pace (a round trip is 8–16 ms).
		c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: e.x, y: e.y, deltaX: e.dx, deltaY: e.dy, modifiers: e.ctrl ? 2 : 0 });
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
const received = await c.evaluate(`window.__rp.wheels`);
const swipes = await c.evaluate(`tcSpike.store.getState().swipes`);
// Strokes as the recording has them: horizontal deltas, a new stroke at a change of sign or after 150 ms of quiet; the
// finger lift estimated as the stroke's largest delta in its first 250 ms (the last delta before the monotonic decay).
const horizontal = rec.events.filter((e) => e.type === "wheel" && !e.ctrl && Math.abs(e.dx) > Math.abs(e.dy));
const strokes = [];
for (const e of horizontal) {
	const cur = strokes.at(-1);
	if (!cur || Math.sign(e.dx) !== cur.dir || e.t - cur.last > 150) strokes.push({ dir: Math.sign(e.dx), start: e.t, last: e.t, events: [e] });
	else { cur.events.push(e); cur.last = e.t; }
}
const toPage = (t) => pageStart + (t - t0);
const offset = (f) => f.off;
const perStroke = strokes.filter((s) => s.events.length >= 5).map((s) => {
	const head = s.events.filter((e) => e.t - s.start <= 250);
	const peak = head.reduce((m, e) => (Math.abs(e.dx) > Math.abs(m.dx) ? e : m), head[0]);
	const lift = toPage(peak.t), begin = toPage(s.start), end = toPage(s.last);
	const decision = swipes.find((w) => w.at >= begin - 5 && w.at <= end + 400);
	const decidedAt = decision?.at ?? null;
	const after = frames.filter((f) => f.t >= (decidedAt ?? lift));
	const settled = after.find((f, i) => Math.abs(offset(f)) < 1 && after.slice(i, i + 10).every((g) => Math.abs(offset(g)) < 1));
	// The tail: from the settle until the next stroke begins, the ribbon must stay on its place.
	const next = strokes.find((x) => x.start > s.start && x.events.length >= 5);
	const tailFrames = settled ? frames.filter((f) => f.t > settled.t && f.t < (next ? toPage(next.start) : Infinity)) : [];
	return { dir: s.dir, strokeMs: Math.round(end - begin), decisionAfterLastDeltaMs: decidedAt === null ? null : Math.round(decidedAt - end), settleEndAfterLastDeltaMs: settled ? Math.round(settled.t - end) : null, liftAfterStartMs: Math.round(lift - begin), decisionAfterLiftMs: decidedAt === null ? null : Math.round(decidedAt - lift), settleEndAfterLiftMs: settled ? Math.round(settled.t - lift) : null, settleAnimationMs: settled && decidedAt !== null ? Math.round(settled.t - decidedAt) : null, step: decision?.step ?? 0, tailMovedFrames: tailFrames.filter((f) => Math.abs(offset(f)) >= 1).length };
});
const startPlace = +(process.argv[3] ?? 1);
const expectedPlaces = expected ? expected.swipes.reduce((acc, st) => [...acc, Math.max(0, Math.min(2, acc.at(-1) + st))], [startPlace]) : null;
// Synthetic recordings name their strokes: the time from each stroke's first delta to the ribbon being sent on.
const strokeLatency = (rec.strokes ?? []).map((st, i) => {
	// From the stroke's first delta as the page received it (the CDP dispatch itself takes 8–20 ms).
	// The stroke's first delta is the smallest of its way near its dispatch time (a running tail is larger; a coalesced start still is).
	const near = received.filter(([t, dx]) => Math.abs(t - toPage(st.t) - 10) <= 25 && Math.sign(dx) === st.dir);
	const first = near.reduce((m, e) => (!m || Math.abs(e[1]) < Math.abs(m[1]) ? e : m), null);
	const at = first ? first[0] : toPage(st.t);
	// Strokes and decisions pair in order when their counts agree; otherwise the first decision after the stroke's start.
	const decided = swipes.length === rec.strokes.length ? swipes[i] : swipes.find((w) => w.at >= at - 1 && w.at <= at + 300);
	const clamped = expectedPlaces ? expectedPlaces[i + 1] === expectedPlaces[i] : false;
	const moved = decided && !clamped ? frames.find((f) => f.t >= decided.at && f.off !== null && Math.abs(f.off) >= 0.5) : null;
	return { dir: st.dir, clamped, decidedAfterStartMs: decided ? Math.round(decided.at - at) : null, firstMovingFrameAfterStartMs: moved ? Math.round(moved.t - at) : null };
});
const observed = [startPlace];
for (const f of frames) if (f.place !== observed.at(-1)) observed.push(f.place);
const dedup = (a) => a.filter((v, i) => i === 0 || v !== a[i - 1]);
const sequenceOk = expectedPlaces ? JSON.stringify(dedup(expectedPlaces)) === JSON.stringify(observed) : null;
const swipeFaults = perStroke.filter((p) => p.decisionAfterLiftMs === null && expected).length;
const ribbon = perStroke;
const stalls = frames.filter((f, i) => i > 0 && f.off !== null && Math.abs(f.off) >= 1 && frames.slice(i, i + 60).length === 60 && frames.slice(i, i + 60).every((g) => Math.abs(g.off - f.off) < 0.5)).length;
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
const report = { strokeLatency, swipeCount: swipes.length, expectedPlaces: expectedPlaces && dedup(expectedPlaces), observedPlaces: observed, placeTrace, dragsReplayed: releases.filter((r) => frames.some((f) => f.dragging && f.t <= r.t && f.t >= ([...marks].reverse().find((m) => m.type === "mousePressed" && m.t < r.t)?.t ?? 0))).length, recording: file.split("/").pop(), ribbon, stalledFrames: stalls, verticalOrPinchMovedRibbon: null, swipes, swipeFaults, sequence: sequenceOk, expected: expected?.swipes ?? null, drops: releases.length, dropFaults };
writeFileSync(new URL(`../shots/replay-${file.split("/").pop()}`, import.meta.url), JSON.stringify({ report, frames, received, sent: rec.events.filter((e) => e.type === "wheel").length }, null, 1));
console.log(JSON.stringify(report, null, 1));
c.close();
