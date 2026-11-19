import { readFileSync } from "node:fs";
import { R, load } from "./ref.mjs";
const { WheelFollow, FollowPager, WheelStrokes } = await import("./engine.mjs");
const OMEGA = Math.sqrt(1400) / 1000;
const f = process.argv[2];
const width = JSON.parse(readFileSync(R + f, "utf8")).w / 2;
const w = load(f);
const fol = new WheelFollow(), pager = new FollowPager(1000, 2000), ws = new WheelStrokes();
let at = 1000, land = null; const log = [];
const pos = (t) => (land ? land.to + (land.from - land.to) * (1 + OMEGA * (t - land.t0)) * Math.exp(-OMEGA * (t - land.t0)) : at);
const apply = (cs) => { for (const c of cs) { if (c.kind === "begin") { at = pos(c.t); land = null; pager.begin(at, c.fresh); log.push(`${(c.t/1000).toFixed(3)} F ${c.fresh ? "begin" : "resume"}`); } else if (c.kind === "move") at = pager.move(c.dx, width); else { const from = pager.stop; const to = pager.release(at, c.speed, width); log.push(`${(c.t/1000).toFixed(3)} F release v=${c.speed.toFixed(2)} at=${(at-1000).toFixed(2)} -> ${to - 1000}`); land = { from: at, to, t0: c.t }; } } };
for (const e of w) { apply(fol.tick(e.t)); apply(fol.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl })); const s = ws.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl }); if (s) log.push(`${(e.t/1000).toFixed(3)}            PAGER ${s}`); }
console.log(log.filter(l => { const t = +l.split(" ")[0]; return t >= +process.argv[3] && t <= +process.argv[4]; }).join("\n"));
