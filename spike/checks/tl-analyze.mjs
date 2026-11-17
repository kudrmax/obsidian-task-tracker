import { readFileSync } from "node:fs";
/**
 * Frame checks over a tl-record run: the overlay following the pointer (its offset from the pointer may change only
 * when it enters or leaves the grid), the selection, the zoom anchor (the time under the pointer, in px at the current
 * zoom), and blocks that vanish. `node tl-analyze.mjs <label>`
 */
const label = process.argv[2];
const base = new URL(`../shots/`, import.meta.url).pathname;
const out = {};
for (const name of ["block-slow", "block-fast", "list-onto-and-off", "resize", "zoom-07", "zoom-12", "zoom-top-edge", "pinch-07"]) {
	let s;
	try { s = JSON.parse(readFileSync(`${base}tl-${label}-${name}/samples.json`, "utf8")); } catch { continue; }
	const r = { frames: s.length, selectionFrames: s.filter((f) => f.selection > 0).length };
	if (name.startsWith("zoom") || name.startsWith("pinch")) {
		const first = s.findIndex((f, i) => i > 0 && f.hourPx !== s[i - 1].hourPx);
		const moving = s.slice(first);
		const m0 = (moving[0].ptr.y - moving[0].gridTop) / moving[0].hourPx;
		r.hourPx = [moving[0].hourPx, Math.max(...moving.map((f) => f.hourPx)), moving.at(-1).hourPx];
		r.anchorDriftPx = +Math.max(...moving.map((f) => Math.abs(((f.ptr.y - f.gridTop) / f.hourPx - m0) * f.hourPx))).toFixed(2);
	} else {
		const drag = s.filter((f) => f.dragging && f.overlay.length);
		const offs = drag.map((f) => +(f.overlay[0][1] - f.ptr.y).toFixed(1));
		let jumps = 0, maxJump = 0;
		for (let i = 1; i < offs.length; i++) { const d = Math.abs(offs[i] - offs[i - 1]); if (d > 2) { jumps++; maxJump = Math.max(maxJump, d); } }
		r.dragFrames = drag.length;
		r.pointerOffsetChanges = jumps;
		r.maxOffsetJumpPx = +maxJump.toFixed(1);
		r.offsets = [...new Set(offs.map(Math.round))].slice(0, 12).join(" ");
		/** How far the overlay stands from where the pointer was one frame earlier (React draws the move a frame later), on the grid. */
		const lag = [];
		for (let i = 1; i < drag.length; i++) if (Math.abs(drag[i].overlay[0][1] - drag[i - 1].ptr.y) < 40) lag.push(Math.abs(drag[i].overlay[0][1] - drag[i - 1].ptr.y));
		lag.sort((a, b) => a - b);
		r.onGridLagErrorPx = lag.length ? { median: +lag[Math.floor(lag.length / 2)].toFixed(1), p95: +lag[Math.floor(lag.length * 0.95)].toFixed(1), max: +lag.at(-1).toFixed(1) } : null;
		const ids = Object.keys(s[0].blocks);
		r.blockVanishedFrames = s.filter((f) => !f.dragging && ids.some((id) => !(id in f.blocks))).length;
	}
	out[name] = r;
}
for (const [k, v] of Object.entries(out)) console.log(k.padEnd(18), JSON.stringify(v));
