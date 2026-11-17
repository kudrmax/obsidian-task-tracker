import { connect, sleep } from "./cdp.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
/** A CDP screencast of the window for N seconds into shots/<name>/. `node screencast.mjs <name> <seconds>` */
const c = await connect();
const dir = new URL(`../shots/${process.argv[2]}/`, import.meta.url).pathname; mkdirSync(dir, { recursive: true });
let n = 0;
c.on("Page.screencastFrame", (p) => { n++; writeFileSync(`${dir}${String(n).padStart(4, "0")}.jpg`, Buffer.from(p.data, "base64")); c.send("Page.screencastFrameAck", { sessionId: p.sessionId }); });
await c.send("Page.startScreencast", { format: "jpeg", quality: 50, everyNthFrame: 1, maxWidth: 640 });
await sleep(+process.argv[3] * 1000);
await c.send("Page.stopScreencast");
console.log(n, "frames");
c.close();
