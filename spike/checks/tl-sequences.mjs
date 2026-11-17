import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
/** Max-like sequences between the timeline and the list, fast and repeated; each ends with the file and the screen compared. */
const c = await connect();
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const mouse = (type, p) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const lineOfTask = (id) => c.evaluate(`app.vault.adapter.read("TODOs Tasks.md").then(t => { const title = tcSpike.store.getState().faces["${id}"].title; const ls = t.split("\\n"); const i = ls.findIndex(l => l.includes(title + " ") || l.endsWith(title)); const now = ls.indexOf("## Now"); return { line: ls[i], slotted: /[⏰📌🚨🔕] \\d{4}/.test(ls[i] ?? ""), indexInNow: i - now }; })`);
async function path(points, ms = 220) {
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: points[0].x, y: points[0].y });
	await mouse("mousePressed", points[0]); await sleep(50);
	for (let k = 1; k < points.length; k++) { const a = points[k - 1], b = points[k]; const n = Math.max(5, Math.round(ms / 16)); for (let i = 1; i <= n; i++) { await mouse("mouseMoved", { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }); await sleep(16); } }
	await sleep(80);
	await mouse("mouseReleased", points.at(-1));
}
const screenOf = (id) => c.evaluate(`(() => { const s = tcSpike.store.getState(); const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o > 0.95; }; return { inDay: s.columns.day.includes("${id}"), dayIndex: s.columns.day.indexOf("${id}"), slotted: s.slotted.includes("${id}"), rowVisible: vis('[data-id="${id}"]'), blockVisible: vis('[data-block="${id}"]') }; })()`);
const results = [];
const check = async (name, id, expect) => { await sleep(1200); const f = await lineOfTask(id), sc = await screenOf(id); const ok = expect(f, sc); results.push({ name, ok, file: { slotted: f.slotted, indexInNow: f.indexInNow }, screen: sc }); console.log(JSON.stringify(results.at(-1))); };
await c.evaluate(`(async () => { const s = tcSpike.store.getState(); s.setPlace(1); s.setHourPx(56); await new Promise(r => setTimeout(r, 700)); document.querySelector(".tcs-timeline").scrollTop = 840; document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); return 1 })()`);
await sleep(400);
const visibleBlock = () => st(`s.slotted.find(i => { const r = document.querySelector('[data-block="' + i + '"]')?.getBoundingClientRect(); const t = document.querySelector(".tcs-timeline").getBoundingClientRect(); return r && r.top > t.top + 10 && r.bottom < t.bottom - 10; })`);
for (let round = 1; round <= 3; round++) {
	await c.evaluate(`(async () => { document.querySelector(".tcs-timeline").scrollTop = 840; document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); return 1 })()`);
	await sleep(300);
	// 1: a block out of the timeline onto the day list, before its 3rd card.
	let id = await visibleBlock();
	let b = await rectOf(c, `[data-block="${id}"]`);
	let target = await rectOf(c, `[data-id="${await st("s.columns.day[2]")}"]`);
	await path([{ x: b.x, y: b.top + 6 }, { x: target.x, y: target.top + 4 }], 200);
	await check(`round ${round}: block to the list`, id, (f, sc) => !f.slotted && sc.inDay && !sc.slotted && sc.rowVisible);
	// 2: a list card onto the grid and back off onto the list.
	id = await st("s.columns.day[0]");
	const card = await rectOf(c, `[data-id="${id}"]`);
	const tl = await rectOf(c, ".tcs-timeline");
	target = await rectOf(c, `[data-id="${await st("s.columns.day[4]")}"]`);
	await path([{ x: card.x, y: card.y }, { x: tl.x, y: tl.y }, { x: tl.x + 80, y: tl.y + 60 }, { x: target.x, y: target.top + 4 }], 180);
	await check(`round ${round}: card onto the grid and back to the list`, id, (f, sc) => !f.slotted && sc.inDay && !sc.slotted && sc.rowVisible);
	// 3: a block let go outside any target: back where it was, nothing written.
	id = await visibleBlock();
	const before = await lineOfTask(id);
	b = await rectOf(c, `[data-block="${id}"]`);
	await path([{ x: b.x, y: b.top + 6 }, { x: b.x, y: 30 }], 150);
	await sleep(1200);
	const after = await lineOfTask(id), sc = await screenOf(id);
	results.push({ name: `round ${round}: block let go outside`, ok: after.line === before.line && sc.slotted && sc.blockVisible, screen: sc, before: before.line, after: after.line });
	console.log(JSON.stringify(results.at(-1)));
	// 4: a list card onto the grid at once.
	id = await st("s.columns.day[1]");
	const c2 = await rectOf(c, `[data-id="${id}"]`);
	await path([{ x: c2.x, y: c2.y }, { x: tl.x, y: tl.y + 40 }], 120);
	await check(`round ${round}: card onto the grid, fast`, id, (f, sc) => f.slotted && sc.slotted && sc.blockVisible && !sc.inDay);
}
console.log("passed", results.filter((r) => r.ok).length, "of", results.length);
c.close();
