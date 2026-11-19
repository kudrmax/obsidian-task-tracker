import { readFileSync } from "node:fs";
import { FILES, R, load } from "./ref.mjs";
const { WheelFollow, FollowPager, WheelStrokes, WHEEL_FOLLOW } = await import("./engine.mjs");
const OMEGA = Math.sqrt(1400) / 1000;
/** The places the follow ribbon settles on, step by step, unbounded; and the pager's strokes (round six) over the same input. */
export function steps(f, tuning = WHEEL_FOLLOW) {
  const width = JSON.parse(readFileSync(R + f, "utf8")).w / 2;
  const w = load(f);
  const fol = new WheelFollow(tuning), pager = new FollowPager(1000, 2000), ws = new WheelStrokes();
  let at = 1000, land = null; const settled = [1000]; const strokes = [];
  const pos = (t) => (land ? land.to + (land.from - land.to) * (1 + OMEGA * (t - land.t0)) * Math.exp(-OMEGA * (t - land.t0)) : at);
  const apply = (cs) => { for (const c of cs) { if (c.kind === "begin") { at = pos(c.t); land = null; pager.begin(at, c.fresh); } else if (c.kind === "move") at = pager.move(c.dx, width); else { const to = pager.release(at, c.speed, width); if (to !== settled.at(-1)) settled.push(to); land = { from: at, to, t0: c.t }; } } };
  for (const e of w) {
    apply(fol.tick(e.t));
    apply(fol.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl }));
    const s = ws.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl }); if (s) strokes.push(s);
  }
  apply(fol.tick(1e15)); if (settled.at(-1) !== pager.stop) settled.push(pager.stop);
  const unroll = (xs) => xs.slice(1).flatMap((x, i) => Array.from({ length: Math.abs(x - xs[i]) }, () => Math.sign(x - xs[i])));
  return { follow: unroll(settled), pager: strokes };
}
function lcs(a, b) { let row = new Array(b.length + 1).fill(0); for (const x of a) { const next = [0]; for (let j = 0; j < b.length; j++) next.push(x === b[j] ? row[j] + 1 : Math.max(row[j + 1], next[j])); row = next; } return row[b.length]; }
export function agreement(tuning) {
  return FILES.map((f) => { const { follow, pager } = steps(f, tuning); const exp = f === "max-2026-11-17.json" ? JSON.parse(readFileSync(R + "max-2026-11-17.expect.json", "utf8")).swipes : pager; const c = lcs(follow, exp); return { f, follow: follow.length, expected: exp.length, extra: follow.length - c, missed: exp.length - c, seq: f === "max-2026-11-17.json" ? JSON.stringify(follow) : "" }; });
}
if (process.argv[1]?.endsWith("agree.mjs")) for (const r of agreement()) console.log(JSON.stringify(r));
