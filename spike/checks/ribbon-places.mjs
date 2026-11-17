import { connect, sleep } from "./cdp.mjs";
const c = await connect();
for (const mode of ["embla", "lethargy"]) for (const p of [0, 1, 2]) {
	await c.evaluate(`tcSpike.store.getState().setRibbon("${mode}"); 1`); await sleep(500);
	await c.evaluate(`tcSpike.store.getState().setPlace(${p}); 1`); await sleep(900);
	console.log(mode, p, await c.shot(`${process.argv[2] ?? "r5"}-${mode}-p${p}`), await c.evaluate(`JSON.stringify([...document.querySelectorAll(".tcs-column, .tcs-timeline")].map(e => [e.dataset.col ?? "timeline", Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().width)]).filter(x => x[1] > -10 && x[1] < innerWidth))`));
}
c.close();
