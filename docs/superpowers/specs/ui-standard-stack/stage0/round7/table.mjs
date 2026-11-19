import { detectors, score, fmt } from "./eval.mjs";
const { WheelFollow, WHEEL_FOLLOW, WheelStrokes } = await import("./engine.mjs");
const follow = (tuning) => (w) => { const f = new WheelFollow(tuning); const out = []; const take = (cs) => { for (const c of cs) if (c.kind === "begin") { if (c.fresh) out.push({ type: "start", t: c.t }); } else if (c.kind === "release") out.push({ type: "lift", t: c.t }); }; for (const e of w) take(f.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl })); take(f.tick(1e15)); return out; };
const pager = (w) => { const p = new WheelStrokes(); const out = []; for (const e of w) if (p.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl })) out.push({ type: "start", t: e.t }); return out; };
for (const [n, r] of Object.entries(detectors)) console.log(fmt(n, score(r)));
console.log(fmt("round-six pager WheelStrokes (starts only, no lift)", score(pager)));
for (const t of [WHEEL_FOLLOW, { ...WHEEL_FOLLOW, momentumEvents: 3, momentumMinPx: 6, quietMs: 80 }]) console.log(fmt("WheelFollow " + JSON.stringify(t), score(follow(t))));
