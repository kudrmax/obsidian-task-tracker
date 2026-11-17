import { connect, sleep, traceTasks } from "./cdp.mjs";
const c = await connect();
const reset = `tcSpike.counters.face.clear(); tcSpike.counters.card.clear(); tcSpike.counters.column.clear(); tcSpike.counters.block.clear();`;
const counts = `JSON.stringify({ face: [...tcSpike.counters.face], card: [...tcSpike.counters.card].filter(([,n]) => n), column: [...tcSpike.counters.column], block: [...tcSpike.counters.block], screen: tcSpike.counters.screen, cardsOnScreen: document.querySelectorAll(".tcs-card-inner").length, faceTint: tcSpike.store.getState().faces["t40"].tint, write: tcSpike.store.getState().lastWriteMs, read: tcSpike.store.getState().lastReadMs })`;
for (const throttle of [1, 4]) {
	await c.send("Emulation.setCPUThrottlingRate", { rate: throttle });
	await c.evaluate(reset);
	const t = await traceTasks(c, async () => { await c.evaluate(`tcSpike.store.getState().togglePriority("t40")`); await sleep(600); });
	console.log(`throttle ${throttle}x priority toggle on t40:`, await c.evaluate(counts), "tasks", JSON.stringify(t));
}
await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });
c.close();
