import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
const mode = process.argv[2];
await c.evaluate(`(async () => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message).slice(0, 300) + " | " + String(e.error?.stack ?? "").split("\\n").slice(1, 12).join(" <- "))); tcSpike.store.setState({ dragging: null, shown: null }); tcSpike.store.getState().setRibbon("${mode}"); await new Promise(r => setTimeout(r, 500)); tcSpike.store.getState().setPlace(0); document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); await new Promise(r => setTimeout(r, 900)); return 1 })()`);
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const touch = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
const id = await c.evaluate(`tcSpike.store.getState().columns.inbox[0]`);
const a = await rectOf(c, `[data-id="${id}"]`), b = await rectOf(c, `[data-id="${await c.evaluate(`tcSpike.store.getState().columns.soon[2]`)}"]`);
await touch("touchStart", [a]); await sleep(400);
console.log("dragging", await c.evaluate(`tcSpike.store.getState().dragging`));
for (let i = 1; i <= 25; i++) { await touch("touchMove", [{ x: a.x + (b.x - a.x) * i / 25, y: a.y + (b.top + 4 - a.y) * i / 25 }]); await sleep(16); if (i % 5 === 0) console.log(i, "ribbon", await c.evaluate(`!!document.querySelector(".tcs-ribbon")`), "track", await c.evaluate(`document.querySelector(".tcs-track")?.style.transform`)); }
await sleep(150); await touch("touchEnd", []); await sleep(1000);
console.log("after", await c.evaluate(`JSON.stringify({ ribbon: !!document.querySelector(".tcs-ribbon"), place: tcSpike.store.getState().place, soonIndex: tcSpike.store.getState().columns.soon.indexOf("${id}"), errs: window.__errs.slice(0, 2) })`));
c.close();
