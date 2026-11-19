import { createRequire } from "node:module";
import { canonicalGrams, FILES, load, strokes } from "./ref.mjs";
const require = createRequire(import.meta.url);
const { Lethargy } = require("./node_modules/lethargy/lethargy.js");
const { WheelGestures } = require("./node_modules/wheel-gestures");
const horiz = (e) => !e.ctrl && Math.abs(e.dx) > Math.abs(e.dy);

/** Each detector: run(events) → [{type:"start"|"lift", t}] (horizontal events only reach it, as the ribbon reads them). */
const QUIET = 150;
export const detectors = {
  "quiet 150 ms only (@use-gesture default)": (w) => {
    const out = []; let last = -1e9, dir = 0;
    for (const e of w) {
      if (e.t - last > QUIET || Math.sign(e.dx) !== dir) { if (last > 0) out.push({ type: "lift", t: Math.min(e.t, last + QUIET) }); out.push({ type: "start", t: e.t }); }
      last = e.t; dir = Math.sign(e.dx);
    }
    out.push({ type: "lift", t: last + QUIET });
    return out;
  },
  "Lethargy 1.0.9 (stage 0 round 4-5)": (w) => {
    const out = []; let now = 0; const real = Date.now; Date.now = () => now;
    const l = new Lethargy(); let on = false, last = -1e9;
    for (const e of w) {
      now = e.t;
      if (on && e.t - last > 120) { out.push({ type: "lift", t: last + 120 }); on = false; }
      const r = l.check({ deltaY: -e.dx });
      if (r && !on) { out.push({ type: "start", t: e.t }); on = true; }
      else if (!r && on) { out.push({ type: "lift", t: e.t }); on = false; }
      last = e.t;
    }
    if (on) out.push({ type: "lift", t: last + 120 });
    Date.now = real; return out;
  },
  "wheel-gestures 2.3 (Embla)": (w) => {
    const out = []; const wg = WheelGestures({ momentum: true });
    let timers = []; const st = globalThis.setTimeout, ct = globalThis.clearTimeout; let now = 0, id = 0;
    globalThis.setTimeout = (fn, ms) => { const k = ++id; timers.push({ k, at: now + ms, fn }); return k; };
    globalThis.clearTimeout = (k) => { timers = timers.filter((x) => x.k !== k); };
    const fire = (t) => { for (;;) { const due = timers.filter((x) => x.at <= t).sort((a, b) => a.at - b.at)[0]; if (!due) break; timers = timers.filter((x) => x !== due); now = due.at; due.fn(); } };
    let lifted = false;
    wg.on("wheel", (s) => {
      if (s.isStart) { out.push({ type: "start", t: now }); lifted = false; }
      if (s.isMomentum && !lifted) { out.push({ type: "lift", t: now }); lifted = true; }
      if (s.isEnding && !lifted) { out.push({ type: "lift", t: now }); lifted = true; }
    });
    for (const e of w) { fire(e.t); now = e.t; wg.feedWheel({ deltaX: e.dx, deltaY: e.dy, deltaMode: 0, timeStamp: e.t, ctrlKey: false }); }
    fire(1e15); globalThis.setTimeout = st; globalThis.clearTimeout = ct; return out;
  },
};

/**
 * Scores a detector against the hindsight reference, per recording: for each finger phase moving ≥ 12 px, whether a
 * gesture started within 100 ms of its start, the lift's delay against the reference lift (momentum's first event; for
 * a stroke without momentum its last finger event), lifts declared while the fingers still moved (more than one frame
 * before the reference lift), and strokes never lifted before the next one began (merged).
 */
export function score(run, files = FILES) {
  const grams = canonicalGrams();
  const res = { strokes: 0, startsFound: 0, startLag: [], flickLag: [], heldLag: [], falseLifts: 0, falseLiftStrokes: 0, merged: 0, momentumStarts: 0, splits: 0, flicks: 0, flickFound: 0 };
  for (const f of files) {
    const all = load(f);
    const { w, strokes: ss } = strokes(all, grams);
    const ev = run(w);
    const starts = ev.filter((x) => x.type === "start").map((x) => x.t);
    const lifts = ev.filter((x) => x.type === "lift").map((x) => x.t);
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      const next = i + 1 < ss.length ? ss[i + 1].start : Infinity;
      const momEnd = s.momentum ? s.momentumEnd : s.lastFinger;
      // starts inside this stroke's momentum (momentum moving the columns as a new gesture)
      if (s.momentum) res.momentumStarts += starts.filter((t) => t > s.lift + 1 && t <= momEnd && t < next).length;
      if (Math.abs(s.moved) < 12) continue;
      res.strokes++;
      const st = starts.find((t) => t >= s.start - 1 && t <= s.start + 100 && t < s.lift + 50);
      if (st !== undefined) { res.startsFound++; res.startLag.push(st - s.start); }
      res.splits += starts.filter((t) => t > s.start + 30 && t < s.lift - 9 && t !== st).length;
      const early = lifts.filter((t) => t > (st ?? s.start) && t < s.lift - 9);
      if (early.length) { res.falseLifts += early.length; res.falseLiftStrokes++; }
      const lift = lifts.find((t) => t >= s.lift - 9 && t < next + 1);
      if (lift === undefined) res.merged++;
      else (s.momentum ? res.flickLag : res.heldLag).push(lift - s.lift);
    }
  }
  return res;
}
export const q = (xs, p) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const fmt = (name, r) => `${name}\n  strokes ${r.strokes}; gesture started at the stroke ${r.startsFound} (lag median ${q(r.startLag, 0.5)?.toFixed(0)} ms)\n  flick lift late: median ${q(r.flickLag, 0.5)?.toFixed(0)} ms, p90 ${q(r.flickLag, 0.9)?.toFixed(0)}, max ${q(r.flickLag, 1)?.toFixed(0)} (n ${r.flickLag.length})\n  held stroke (no momentum) lift late: median ${q(r.heldLag, 0.5)?.toFixed(0)}, max ${q(r.heldLag, 1)?.toFixed(0)} (n ${r.heldLag.length})\n  false lifts while fingers moved: ${r.falseLifts} in ${r.falseLiftStrokes} strokes; new strokes begun inside one stroke (splits): ${r.splits}; touches missed: ${r.strokes - r.startsFound}; strokes never lifted before the next: ${r.merged}; momentum taken as a new stroke: ${r.momentumStarts}`;
if (process.argv[1]?.endsWith("eval.mjs")) for (const [name, run] of Object.entries(detectors)) console.log(fmt(name, score(run)));
