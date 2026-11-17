import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.send("Runtime.enable");
let exc = 0; c.on("Runtime.exceptionThrown", () => exc++);
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const touch = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
async function path(from, to, steps = 8, stepMs = 14) { await touch("touchStart", [from]); for (let i = 1; i <= steps; i++) { await touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]); await sleep(stepMs); } await touch("touchEnd", []); await sleep(900); }
const r = await rectOf(c, ".tcs-ribbon");
const state = async (label) => console.log(label, "exc", exc, "ribbon", await c.evaluate(`!!document.querySelector(".tcs-ribbon")`), "place", await c.evaluate(`tcSpike.store.getState().place`));
await path({ x: r.x + 120, y: r.y }, { x: r.x - 40, y: r.y + 4 }); await state("flick 1");
await path({ x: r.x + 120, y: r.y }, { x: r.x - 40, y: r.y + 4 }); await state("flick 2");
await path({ x: r.x - 100, y: r.y }, { x: r.x - 20, y: r.y }, 30, 25); await state("slow 20% right");
await path({ x: r.x - 150, y: r.y }, { x: r.x + 130, y: r.y }, 40, 25); await state("slow 70% right");
await path({ x: r.x - 150, y: r.y }, { x: r.x + 150, y: r.y }, 6, 14); await state("flick right");
c.close();
