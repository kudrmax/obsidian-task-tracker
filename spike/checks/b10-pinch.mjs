import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await c.evaluate(`tcSpike.store.getState().setPlace(1); tcSpike.store.getState().setListWidth(170); 1`); await sleep(900);
const t = await rectOf(c, ".tcs-timeline");
const h0 = await c.evaluate(`tcSpike.store.getState().hourPx`);
const pts = (d) => [{ x: t.x, y: t.y - d, id: 0 }, { x: t.x, y: t.y + d, id: 1 }];
await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(40) });
for (let i = 1; i <= 15; i++) { await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(40 + i * 6) }); await sleep(16); }
await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(400);
const h1 = await c.evaluate(`tcSpike.store.getState().hourPx`);
await c.shot("phone-timeline-pinched");
const d = await rectOf(c, ".tcs-divider");
const w0 = (await rectOf(c, ".tcs-day-list")).w;
await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: d.x, y: d.y, id: 0 }] });
for (let i = 1; i <= 10; i++) { await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: d.x - i * 4, y: d.y, id: 0 }] }); await sleep(16); }
await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(400);
console.log(JSON.stringify({ pinch: { hourPxBefore: h0, after: h1, place: await c.evaluate(`tcSpike.store.getState().place`) }, divider: { before: w0, after: (await rectOf(c, ".tcs-day-list")).w, place: await c.evaluate(`tcSpike.store.getState().place`) } }));
c.close();
