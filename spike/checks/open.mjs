import { connect, sleep } from "./cdp.mjs";
const c = await connect();
await c.evaluate(`(async () => { const r = require("@electron/remote"); r.getCurrentWindow().setSize(1280, 820); r.getCurrentWebContents().setBackgroundThrottling(false); app.workspace.leftSplit.collapse(); app.workspace.rightSplit.collapse(); await tcSpike.open(false); })()`);
await sleep(1500);
console.log(await c.evaluate(`JSON.stringify({ loadMs: tcSpike.loadMs, reads: tcSpike.store.getState().reads, cols: Object.fromEntries(Object.entries(tcSpike.store.getState().columns).map(([k,v])=>[k,v.length])), slotted: tcSpike.store.getState().slotted.length, cards: document.querySelectorAll('.tcs-card-inner').length, err: document.querySelector('.tcs-screen') ? null : document.body.innerText.slice(0,300) })`));
console.log(await c.shot("desktop-dark-place1"));
c.close();
