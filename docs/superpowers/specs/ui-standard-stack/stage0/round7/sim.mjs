import { readFileSync } from "node:fs";
import { canonicalGrams, FILES, R, load, strokes } from "./ref.mjs";
const ENG = "./engine.mjs";
const { WheelFollow } = await import(ENG);
const { FollowPager } = await import(ENG);
const OMEGA = Math.sqrt(1400) / 1000; // per ms, critically damped (stiffness 1400, damping 75)
/** Runs Max's recordings through the follow model; per stroke: places moved against what the gallery rule expects. */
export function simulate(files = FILES, tuning = undefined, verbose = false) {
  const grams = canonicalGrams();
  const tot = { strokes: 0, ok: 0, two: 0, none: 0, wrong: 0, back: 0, ignoredPx: 0, fingerPx: 0, ignoredStrokes: 0, momentumPx: 0, momentumMovedPx: 0, fingerEv: 0, ignoredEv: 0, ignoredInFlickEv: 0, ignoredInHeldEv: 0 };
  for (const f of files) {
    const width = JSON.parse(readFileSync(R + f, "utf8")).w / 2;
    const { w, strokes: ss } = strokes(load(f), grams);
    const fol = new WheelFollow(tuning); const pager = new FollowPager(1e6, 2e6);
    let at = 1e6, land = null; // {from, to, t0}
    const pos = (t) => (land ? land.to + (land.from - land.to) * (1 + OMEGA * (t - land.t0)) * Math.exp(-OMEGA * (t - land.t0)) : at);
    const placeAt = []; const moveOf = new Map();
    const apply = (cs) => { for (const c of cs) {
      if (c.kind === "begin") { at = pos(c.t); land = null; pager.begin(at, c.fresh); }
      else if (c.kind === "move") { at = pager.move(c.dx, width); }
      else { const to = pager.release(at, c.speed, width); land = { from: at, to, t0: c.t }; }
    } };
    for (let i = 0; i < w.length; i++) {
      apply(fol.tick(w[i].t));
      placeAt[i] = pager.stop;
      const cs = fol.feed({ dx: w[i].dx, dy: w[i].dy, t: w[i].t, ctrl: w[i].ctrl });
      apply(cs);
      moveOf.set(i, cs.some((c) => c.kind === "move"));
    }
    apply(fol.tick(1e15));
    const final = pager.stop;
    for (let k = 0; k < ss.length; k++) {
      const s = ss[k];
      for (let i = s.startIdx; i < s.liftIdx; i++) { tot.fingerPx += Math.abs(w[i].dx); tot.fingerEv++; if (!moveOf.get(i)) { tot.ignoredPx += Math.abs(w[i].dx); tot.ignoredEv++; if (s.momentum) tot.ignoredInFlickEv++; else tot.ignoredInHeldEv++; } }
      for (let i = s.liftIdx; i < s.endIdx; i++) { tot.momentumPx += Math.abs(w[i].dx); if (moveOf.get(i)) tot.momentumMovedPx += Math.abs(w[i].dx); }
      if (Math.abs(s.moved) < 12) continue;
      tot.strokes++;
      const from = placeAt[s.startIdx];
      // where this stroke's run ended: the place decided before the next stroke's first event
      const to = k + 1 < ss.length ? placeAt[ss[k + 1].startIdx] : final;
      const expect = s.momentum ? s.dir : Math.abs(s.moved) * 2 >= width ? s.dir : 0;
      const got = to - from;
      if (got === expect) tot.ok++; else if (Math.abs(got) > 1) tot.two++; else if (got === 0) tot.none++; else if (expect === 0) tot.wrong++; else tot.back++;
      if (verbose && got !== expect) console.log(`${f} ${(s.start / 1000).toFixed(2)} expect ${expect} got ${got} moved ${s.moved} ${s.momentum ? "mom" : "held"} | ${w.slice(s.startIdx, s.endIdx).map((e, j) => (s.startIdx + j === s.liftIdx ? "|" : "") + Math.abs(e.dx)).join(" ").slice(0, 160)}`);
    }
  }
  return tot;
}
if (process.argv[1]?.endsWith("sim.mjs")) {
  const r = simulate(FILES, undefined, process.argv[2] === "v");
  console.log(`strokes ${r.strokes}: right ${r.ok}, two places ${r.two}, none where one expected ${r.none}, a place where none expected ${r.wrong}, other ${r.back}; finger px not followed ${(100 * r.ignoredPx / r.fingerPx).toFixed(1)}%; momentum px that moved the columns ${(100 * r.momentumMovedPx / r.momentumPx).toFixed(1)}%`);
}
