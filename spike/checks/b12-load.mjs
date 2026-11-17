import { connect, sleep } from "./cdp.mjs";
const c = await connect();
const runs = [];
for (let i = 0; i < 5; i++) {
	runs.push(await c.evaluate(`(async () => { const old = [...app.workspace.getLeavesOfType("tc-spike"), ...app.workspace.getLeavesOfType("tc-spike-alt")]; await app.workspace.getLeaf("tab").setViewState({ type: "empty" }); old.forEach(l => l.detach()); await app.plugins.disablePlugin("task-calendar-spike"); await new Promise(r => setTimeout(r, 300)); const t0 = performance.now(); await app.plugins.enablePlugin("task-calendar-spike"); const enable = performance.now() - t0; const t1 = performance.now(); await tcSpike.store.getState().refresh(); const firstRead = performance.now() - t1; const t2 = performance.now(); await tcSpike.open(false); await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); const open = performance.now() - t2; return { enableMs: +enable.toFixed(1), onloadMs: +tcSpike.loadMs.toFixed(1), firstReadMs: +firstRead.toFixed(1), openViewMs: +open.toFixed(1), cards: document.querySelectorAll(".tcs-card-inner").length }; })()`));
	await sleep(500);
}
console.log(JSON.stringify(runs));
c.close();
