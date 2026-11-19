import { readFileSync } from "node:fs";
export const R = new URL("../../../../../../tests/e2e/recordings/", import.meta.url).pathname;
export const FILES = ["max-2026-11-17.json", "max-2026-11-17-r5.json", "max-2026-11-17-r6-pager.json"];
export const load = (f) => JSON.parse(readFileSync(R + f, "utf8")).events.filter((e) => e.type === "wheel");
const horiz = (e) => !e.ctrl && Math.abs(e.dx) > Math.abs(e.dy);
const N = 6;
/** A delta per frame: an event that merged frames (Chromium hands one event per display frame) counts per frame it spans. */
export const perFrame = (w, k) => Math.abs(w[k].dx) / (k > 0 ? Math.max(1, Math.round((w[k].t - w[k - 1].t) / (1000 / 120))) : 1);
/** 6-grams of |dx| that recur across all recordings: the macOS momentum table (fingers do not repeat themselves). */
export function canonicalGrams() {
  const counts = new Map();
  for (const f of FILES) {
    const w = load(f).filter(horiz);
    for (let i = 0; i + N <= w.length; i++) {
      const g = w.slice(i, i + N);
      if (g.some((e, j) => j && (e.t - g[j - 1].t > 30 || Math.sign(e.dx) !== Math.sign(g[0].dx)))) continue;
      const k = g.map((e) => Math.abs(e.dx)).join(" ");
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([k, c]) => c >= 3 && Math.max(...k.split(" ").map(Number)) >= 8).map(([k]) => k));
}
/**
 * The reference, read with hindsight: each run of horizontal deltas (cut by 200 ms quiet or a turn) split into finger
 * phases and momentum runs. A momentum run starts at the first event of a recurring 6-gram (the OS's table) and lasts
 * until a cut (a delta under 0.6 of the one before, a 40 ms gap, a turn). Each finger phase is a stroke: its start, its
 * lift (the momentum's first event, or for a stroke without momentum its last event), its distance.
 */
export function strokes(events, grams) {
  const w = events.filter(horiz);
  const out = [];
  let i = 0;
  const key = (j) => w.slice(j, j + N).map((e) => Math.abs(e.dx)).join(" ");
  const same = (a, b) => Math.sign(w[a].dx) === Math.sign(w[b].dx) && w[b].t - w[a].t <= 200;
  while (i < w.length) {
    const start = i;
    let j = i;
    // finger phase: until a canonical gram starts (contiguous), or the run ends
    let mom = -1;
    while (j < w.length) {
      if (j > start && !same(j - 1, j)) break;
      const ok = j + N <= w.length && grams.has(key(j)) && w.slice(j, j + N).every((e, k) => k === 0 || (e.t - w[j + k - 1].t <= 30 && Math.sign(e.dx) === Math.sign(w[j].dx)));
      if (ok && j > start) { mom = j; break; }
      j++;
    }
    const s = { dir: Math.sign(w[start].dx), start: w[start].t, startIdx: start, moved: 0, momentum: mom >= 0 };
    const fingerEnd = mom >= 0 ? mom : j;
    for (let k = start; k < fingerEnd; k++) s.moved += w[k].dx;
    s.lift = mom >= 0 ? w[mom].t : w[fingerEnd - 1].t;
    s.lastFinger = w[fingerEnd - 1].t;
    s.liftIdx = fingerEnd;
    if (mom >= 0) {
      let k = mom + 1;
      while (k < w.length && same(k - 1, k) && w[k].t - w[k - 1].t <= 40 && !(perFrame(w, k) < 0.6 * perFrame(w, k - 1) && perFrame(w, k - 1) >= 6)) k++;
      s.momentumEnd = w[k - 1].t;
      s.momentumPx = w.slice(mom, k).reduce((a, e) => a + e.dx, 0);
      i = k;
    } else i = j;
    s.endIdx = i;
    out.push(s);
  }
  return { w, strokes: out };
}
if (process.argv[1]?.endsWith("ref.mjs")) {
  const grams = canonicalGrams();
  for (const f of FILES) {
    const { w, strokes: ss } = strokes(load(f), grams);
    const real = ss.filter((s) => Math.abs(s.moved) >= 12);
    console.log(`${f}: ${ss.length} finger phases, ${real.length} moving >=12px, with momentum ${real.filter((s) => s.momentum).length}`);
    if (process.argv[2] === f) for (const s of ss) console.log(`${(s.start / 1000).toFixed(2)} dir ${s.dir} moved ${s.moved} ${s.momentum ? `lift +${Math.round(s.lift - s.start)}ms mom ${s.momentumPx}px` : `no momentum, ${Math.round(s.lastFinger - s.start)}ms`} | ${w.slice(s.startIdx, s.endIdx).map((e, k) => (s.startIdx + k === s.liftIdx ? "|" : "") + Math.abs(e.dx)).join(" ").slice(0, 150)}`);
  }
}
