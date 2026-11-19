import { canonicalGrams, load, strokes } from "./ref.mjs";
const { WheelFollow } = await import("./engine.mjs");
const f = process.argv[2]; const { w, strokes: ss } = strokes(load(f), canonicalGrams());
const fol = new WheelFollow(); const rel = new Map();
w.forEach((e, i) => { const cs = [...fol.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl })]; for (const c of cs) if (c.kind !== "move") rel.set(i, (rel.get(i) ?? "") + (c.kind === "begin" ? (c.fresh ? "B" : "R") : "L")); });
let n = 0;
for (const s of ss) { const ids = [...rel.keys()].filter((i) => i > s.startIdx && i < s.liftIdx - 1 && rel.get(i).includes("L")); if (!ids.length) continue; if (n++ > 25) break;
  console.log(`${(s.start / 1000).toFixed(2)} ${s.momentum ? "flick" : "held"}: ` + w.slice(s.startIdx, Math.min(s.endIdx, s.liftIdx + 6)).map((e, k) => { const i = s.startIdx + k; return (i === s.liftIdx ? "‖" : "") + Math.abs(e.dx) + (rel.get(i) ? `[${rel.get(i)}]` : ""); }).join(" ")); }
