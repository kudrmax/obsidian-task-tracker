import { connect, sleep } from "./cdp.mjs";
/** The spike in the main window: pop-outs closed, a root leaf made active first. */
const c = await connect();
console.log(await c.evaluate(`(async () => { app.workspace.getLeavesOfType("tc-spike").forEach(l => l.detach()); await new Promise(r => setTimeout(r, 800)); let root = null; app.workspace.iterateRootLeaves(l => { root = root ?? l; }); if (root) app.workspace.setActiveLeaf(root, { focus: false }); await tcSpike.open(false); await new Promise(r => setTimeout(r, 1500)); return JSON.stringify({ hosts: document.querySelectorAll(".tcs-host").length, rows: document.querySelectorAll(".tcs-card-inner").length }) })()`));
c.close();
