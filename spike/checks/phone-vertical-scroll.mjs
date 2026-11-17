import { connect, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
await c.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
const touch = (type, pts) => c.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i })) });
for (const mode of ["embla", "lethargy"]) {
	await c.evaluate(`(async () => { tcSpike.store.getState().setRibbon("${mode}"); await new Promise(r => setTimeout(r, 500)); tcSpike.store.getState().setPlace(0); document.querySelectorAll(".tcs-column-scroll").forEach(e => e.scrollTop = 0); await new Promise(r => setTimeout(r, 900)); return 1 })()`);
	for (const col of ["inbox", "soon"]) {
		const r = await rectOf(c, `[data-col="${col}"] .tcs-column-scroll`);
		await touch("touchStart", [{ x: r.x, y: r.y + r.h * 0.3 }]);
		for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: r.x + 2, y: r.y + r.h * 0.3 - i * 15 }]); await sleep(16); }
		await touch("touchEnd", []); await sleep(800);
		console.log(mode, col, "scrollTop", await c.evaluate(`document.querySelector('[data-col="${col}"] .tcs-column-scroll').scrollTop`), "place", await c.evaluate(`tcSpike.store.getState().place`), "dragging", await c.evaluate(`tcSpike.store.getState().dragging`));
	}
}
c.close();
