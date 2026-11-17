import { connect, sleep, traceTasks } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
const view = process.argv[3] ?? "alt";
await c.evaluate(`(async () => { const old = [...app.workspace.getLeavesOfType("tc-spike"), ...app.workspace.getLeavesOfType("tc-spike-alt")]; require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); ${view === "alt" ? "await tcSpike.openAlt()" : "await tcSpike.open(false)"}; old.forEach(l => l.detach()); await new Promise(r => setTimeout(r, 1500)); return 1 })()`);
if (process.argv[4]) { await c.evaluate(`tcSpike.store.getState().setMounted(${process.argv[4]})`); await sleep(800); }
const rate = +(process.argv[2] ?? 1);
await c.send("Emulation.setCPUThrottlingRate", { rate });
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
const mouse = (type, p) => c.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const cards = await c.evaluate(`document.querySelectorAll(".tcs-card-inner").length`);
for (const [label, src, dst] of [["within Inbox", "inbox", "inbox"], ["Inbox to Soon", "inbox", "soon"]]) {
	const a = await rectOf(c, `[data-id="${await st(`s.columns.${src}[0]`)}"]`);
	const b = await rectOf(c, `[data-id="${await st(`s.columns.${dst}[4]`)}"]`);
	await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
	await mouse("mousePressed", a);
	const start = await traceTasks(c, async () => { for (let i = 1; i <= 4; i++) { await mouse("mouseMoved", { x: a.x + i * 2, y: a.y + i * 2 }); await sleep(30); } await sleep(200); });
	const frames = await traceTasks(c, async () => { for (let i = 1; i <= 40; i++) { await mouse("mouseMoved", { x: a.x + ((b.x - a.x) * i) / 40, y: a.y + ((b.y - a.y) * i) / 40 }); await sleep(16); } await sleep(300); });
	const drop = await traceTasks(c, async () => { await mouse("mouseReleased", b); await sleep(1500); });
	const after = await st(`s.columns.${dst}.indexOf("${await st(`s.columns.${dst}[4]`)}")`);
	console.log(`${view} ${rate}x ${cards} cards, ${label}: start ${JSON.stringify(start.top.slice(0, 3))} | frames over16 ${frames.over16}/${frames.count} top ${JSON.stringify(frames.top.slice(0, 4))} | drop ${JSON.stringify(drop.top.slice(0, 3))}`);
	await sleep(500);
}
await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });
c.close();
