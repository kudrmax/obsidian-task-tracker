import { load } from "./ref.mjs";
const { WheelFollow } = await import("./engine.mjs");
const [, , file, from, to] = process.argv;
const f = new WheelFollow();
for (const e of load(file)) {
  const cs = f.feed({ dx: e.dx, dy: e.dy, t: e.t, ctrl: e.ctrl });
  if (e.t / 1000 >= +from && e.t / 1000 <= +to) console.log((e.t / 1000).toFixed(3), e.dx, cs.map((c) => c.kind === "move" ? "m" : c.kind === "begin" ? `BEGIN${c.fresh ? "" : "(resume)"}` : `RELEASE@${(c.t/1000).toFixed(3)} v=${c.speed.toFixed(2)}`).join(" "));
}
