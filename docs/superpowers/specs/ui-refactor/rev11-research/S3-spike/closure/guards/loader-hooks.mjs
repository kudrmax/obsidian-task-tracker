import { appendFileSync, mkdirSync } from "node:fs";
let out;
export async function initialize(data) { out = data?.out; if (out) { mkdirSync(out, { recursive: true }); appendFileSync(`${out}/node-${process.pid}.log`, "init\t" + process.pid + "\n"); } }
export async function load(url, context, next) {
  if (out && url.startsWith("file:") && !url.includes("/node_modules/")) appendFileSync(`${out}/node-${process.pid}.log`, `load\t${url}\n`);
  return next(url, context);
}
