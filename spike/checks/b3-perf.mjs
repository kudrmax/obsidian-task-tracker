import { connect, sleep, traceTasks } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
const rate = +(process.argv[2] ?? 4);
await c.send("Emulation.setCPUThrottlingRate", { rate });
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
await c.evaluate(`app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach())`);
await sleep(500);
const initial = await traceTasks(c, async () => { await c.evaluate(`tcSpike.open(false).then(() => 1)`); await sleep(2500); });
console.log("initial render (open view, 239 cards + 10 blocks)", JSON.stringify(initial));
await sleep(500);
const mouse = (type, p, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
for (const [label, src, dst] of [["within Inbox", "inbox", "inbox"], ["Inbox to Soon", "inbox", "soon"]]) {
	const a = await rectOf(c, `[data-id="${await st(`s.columns.${src}[0]`)}"]`);
	const b = await rectOf(c, `[data-id="${await st(`s.columns.${dst}[4]`)}"]`);
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
	await mouse("mousePressed", a);
	const drag = await traceTasks(c, async () => {
		for (let i = 1; i <= 40; i++) { await mouse("mouseMoved", { x: a.x + ((b.x - a.x) * i) / 40, y: a.y + ((b.y - a.y) * i) / 40 }); await sleep(16); }
		await sleep(300);
	});
	const drop = await traceTasks(c, async () => { await mouse("mouseReleased", b); await sleep(1500); });
	console.log(`drag ${label}: frames`, JSON.stringify(drag), "| drop", JSON.stringify(drop), "| write ms", (await st("s.lastWriteMs")).toFixed(1));
	await sleep(400);
}
const cmd = await traceTasks(c, async () => { await c.evaluate(`app.commands.executeCommandById("task-calendar-spike:first-inbox-to-soon")`); await sleep(1200); });
console.log("command move", JSON.stringify(cmd));
await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });
c.close();
