import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
import { writeFileSync } from "node:fs";
/**
 * Round six on the phone (390×844, emulateMobile): a flick moves one place, a second flick during the landing carries on
 * from where the ribbon stands (two places), a short slow drag stays, a long one moves, a vertical drag scrolls a list and
 * moves no place. `node phone-pager.mjs [shot-prefix]`
 */
// emulateMobile reloads the window: switch, wait for the reload, then connect again.
const first = await connect();
const isMobile = await first.evaluate(`app.isMobile`);
if (!isMobile) { first.evaluate(`(() => { const r = require("@electron/remote"); r.getCurrentWindow().setContentSize(390, 844); r.getCurrentWindow().setPosition(-5000, 2000, false); app.emulateMobile(true); return 1 })()`).catch(() => {}); await sleep(6000); }
first.close();
const c = await connect();
await c.send("Runtime.enable");
let exc = 0; c.on("Runtime.exceptionThrown", () => exc++);
await c.evaluate(`(async () => { const r = require("@electron/remote"); r.getCurrentWindow().setPosition(-5000, 2000, false); r.getCurrentWebContents().setBackgroundThrottling(false); await new Promise(r => app.workspace.onLayoutReady(r)); if (!document.querySelector(".tcs-ribbon")) await tcSpike.open(false); await new Promise(r => setTimeout(r, 1200)); return 1 })()`);
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const touch = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
async function path(from, to, steps = 8, stepMs = 14) { await touch("touchStart", [from]); for (let i = 1; i <= steps; i++) { await touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]); await sleep(stepMs); } await touch("touchEnd", []); }
const place = () => c.evaluate(`tcSpike.store.getState().place`);
const setPlace = (p) => c.evaluate(`(async () => { tcSpike.store.getState().setPlace(${p}); await new Promise(r => setTimeout(r, 700)); return 1 })()`);
const r = await rectOf(c, ".tcs-ribbon");
const results = [];
const check = async (label, expected) => { await sleep(700); const got = await place(); results.push({ label, expected, got, ok: got === expected }); };
await setPlace(0); await path({ x: r.x + 120, y: r.y }, { x: r.x - 40, y: r.y + 4 }); await check("one flick left from Inbox", 1);
await setPlace(0); await path({ x: r.x + 120, y: r.y }, { x: r.x - 40, y: r.y + 4 }); await sleep(90); await path({ x: r.x + 120, y: r.y }, { x: r.x - 40, y: r.y + 4 }); await check("two flicks 90 ms apart from Inbox (the second during the landing)", 2);
await setPlace(2); await path({ x: r.x - 120, y: r.y }, { x: r.x + 40, y: r.y + 4 }); await sleep(90); await path({ x: r.x - 120, y: r.y }, { x: r.x + 40, y: r.y + 4 }); await check("two flicks right 90 ms apart from the day", 0);
await setPlace(1); await path({ x: r.x - 100, y: r.y }, { x: r.x - 60, y: r.y }, 30, 25); await check("slow drag 40 px right stays", 1);
await setPlace(1); await path({ x: r.x - 150, y: r.y }, { x: r.x + 130, y: r.y }, 40, 25); await check("slow drag 280 px right moves", 0);
for (const col of ["inbox", "soon"]) {
	await setPlace(0);
	await c.evaluate(`document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0)`);
	const s = await rectOf(c, `[data-col="${col}"] .tcs-column-scroll`);
	if (!s) { results.push({ label: `vertical in ${col}`, ok: false, got: "no column" }); continue; }
	await path({ x: s.x, y: s.y + s.h * 0.3 }, { x: s.x + 4, y: s.y + s.h * 0.3 - 150 }, 10, 16);
	await sleep(700);
	const top = await c.evaluate(`document.querySelector('[data-col="${col}"] .tcs-column-scroll').scrollTop`);
	results.push({ label: `vertical drag in ${col} scrolls, place stays`, scrollTop: top, got: await place(), ok: top > 50 && (await place()) === 0 });
}
for (const r of results) console.log(r.ok ? "PASS" : "FAIL", r.label, "expected", r.expected ?? "", "got", r.got, r.scrollTop !== undefined ? `scrollTop ${r.scrollTop}` : "");
console.log("exceptions", exc);
if (process.argv[2]) {
	for (const [i, p] of [0, 1, 2].entries()) { await setPlace(p); const shot = await c.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${process.argv[2]}-p${i}.png`, Buffer.from(shot.data, "base64")); }
}
c.evaluate(`(() => { const r = require("@electron/remote"); r.getCurrentWindow().setContentSize(1280, 820); r.getCurrentWindow().setPosition(-5000, 2000, false); app.emulateMobile(false); return 1 })()`).catch(() => {});
await sleep(500);
c.close();
process.exit(results.every((r) => r.ok) && !exc ? 0 : 1);
