import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.evaluate(`tcSpike.store.getState().setPlace(1)`); await sleep(900);
const t = await rectOf(c, ".tcs-timeline");
const h0 = await c.evaluate(`tcSpike.store.getState().hourPx`);
for (let i = 0; i < 10; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: t.x, y: t.y, deltaX: 0, deltaY: -10, modifiers: 2 }); await sleep(16); }
await sleep(300);
const h1 = await c.evaluate(`tcSpike.store.getState().hourPx`);
await c.shot((process.env.TARGET ?? "main") + "-b4-pinched");
for (let i = 0; i < 10; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: t.x, y: t.y, deltaX: 0, deltaY: 10, modifiers: 2 }); await sleep(16); }
await sleep(300);
console.log(JSON.stringify({ hourPxBefore: h0, afterPinchOut: h1, afterPinchIn: await c.evaluate(`tcSpike.store.getState().hourPx`), place: await c.evaluate(`tcSpike.store.getState().place`) }));
c.close();
