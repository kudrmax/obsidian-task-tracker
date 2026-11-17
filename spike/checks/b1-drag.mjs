import { connect, mouseDrag, SAMPLER, sleep } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
import { writeFileSync } from "node:fs";
const c = await connect();
await c.evaluate(SAMPLER);
const st = (e) => c.evaluate(`(() => { const s = tcSpike.store.getState(); return ${e}; })()`);
// A: within Inbox: card 0 to after card 3. Watch moved card and the 3 siblings that shift.
const ids = await st(`s.columns.inbox.slice(0, 6)`);
const a = await rectOf(c, `[data-id="${ids[0]}"]`), b = await rectOf(c, `[data-id="${ids[3]}"]`);
await c.evaluate(`window.__stop = __sample(${JSON.stringify(ids)})`);
const titleBefore = await st(`s.faces["${ids[0]}"].title`);
await mouseDrag(c, a, { x: b.x, y: b.y + 8 });
await sleep(900);
const samples = await c.evaluate(`window.__stop()`);
const after = await st(`({ inbox: s.columns.inbox.slice(0, 6), reads: s.reads, write: s.lastWriteMs, read: s.lastReadMs, shown: s.shown })`);
const file = await c.evaluate(`app.vault.adapter.read("TODOs Tasks.md").then(t => t.split("\\n").slice(1, 7).join("\\n"))`);
writeFileSync(new URL("../shots/b1-within.json", import.meta.url), JSON.stringify({ ids, titleBefore, after, file, samples }, null, 1));
console.log(JSON.stringify({ ids, titleBefore, after, file }, null, 1));
c.close();
