import { connect, sleep, traceTasks } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
/** Round two: every step's longest main-thread task, for one configuration. `node b13-round2.mjs <rate> <virtual 0|1> <measuring>` */
const [rate, virtual, measuring] = [+(process.argv[2] ?? 1), process.argv[3] !== "0", process.argv[4] ?? "whileDragging"];
const c = await connect();
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const reset = `tcSpike.counters.card.clear(); tcSpike.counters.wrapper.clear(); tcSpike.counters.face.clear(); tcSpike.counters.column.clear(); tcSpike.counters.dropArea.clear(); 1`;
const renders = `JSON.stringify({ rows: [...tcSpike.counters.card.values()].reduce((a, b) => a + b, 0), wrappers: [...tcSpike.counters.wrapper.values()].reduce((a, b) => a + b, 0), faces: [...tcSpike.counters.face.values()].reduce((a, b) => a + b, 0), columns: [...tcSpike.counters.column.values()].reduce((a, b) => a + b, 0), dropAreas: [...tcSpike.counters.dropArea.values()].reduce((a, b) => a + b, 0) })`;
await c.evaluate(`(async () => { tcSpike.store.getState().configure({ virtual: ${virtual}, measuring: "${measuring}", onlyCurrent: ${process.argv[5] === "only"} }); tcSpike.store.getState().setPlace(0); document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); return 1 })()`);
await sleep(800);
await c.send("Emulation.setCPUThrottlingRate", { rate });
const row = { view: process.env.VIEW ?? "classic", rate, virtual, measuring };
const top = (t) => t.top[0];
row.firstRender = top(await traceTasks(c, async () => { await c.evaluate(`(async () => { const old = [...app.workspace.getLeavesOfType("tc-spike"), ...app.workspace.getLeavesOfType("tc-spike-alt")]; await ${process.env.VIEW === "alt" ? "tcSpike.openAlt()" : "tcSpike.open(false)"}; old.forEach(l => l.detach()); return 1 })()`); await sleep(2000); }));
row.mounted = await c.evaluate(`document.querySelectorAll(".tcs-card-inner").length`);
await sleep(500);
const mouse = (type, p) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
for (const [label, dst] of [["within", "inbox"], ["cross", "soon"]]) {
	const a = await rectOf(c, `[data-id="${await st(`s.columns.inbox[0]`)}"]`);
	const b = await rectOf(c, `[data-id="${await st(`s.columns.${dst}[4]`)}"]`);
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
	await mouse("mousePressed", a);
	await c.evaluate(reset);
	row[`${label}.lift`] = top(await traceTasks(c, async () => { for (let i = 1; i <= 4; i++) { await mouse("mouseMoved", { x: a.x + i * 2, y: a.y + i * 2 }); await sleep(30); } await sleep(250); }));
	if (label === "within") row.liftRenders = JSON.parse(await c.evaluate(renders));
	const frames = await traceTasks(c, async () => { for (let i = 1; i <= 40; i++) { await mouse("mouseMoved", { x: a.x + ((b.x - a.x) * i) / 40, y: a.y + ((b.y - a.y) * i) / 40 }); await sleep(16); } await sleep(300); });
	row[`${label}.frames`] = top(frames);
	row[`${label}.framesOver16`] = `${frames.over16}`;
	await c.evaluate(reset);
	row[`${label}.drop`] = top(await traceTasks(c, async () => { await mouse("mouseReleased", b); await sleep(1500); }));
	if (label === "cross") row.dropRenders = JSON.parse(await c.evaluate(renders));
	await sleep(400);
}
await c.evaluate(reset);
row.command = top(await traceTasks(c, async () => { await c.evaluate(`app.commands.executeCommandById("task-calendar-spike:first-inbox-to-soon")`); await sleep(1200); }));
row.commandRenders = JSON.parse(await c.evaluate(renders));
await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });
console.log(JSON.stringify(row));
c.close();
