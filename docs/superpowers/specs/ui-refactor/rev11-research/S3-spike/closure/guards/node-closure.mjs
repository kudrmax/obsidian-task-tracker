// --import entry for plain Node scripts: sync module hooks (cover import AND require) plus fs read wrapping.
import fs from "node:fs";
import fsp from "node:fs/promises";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
const out = process.env.CLOSURE_OUT;
fs.mkdirSync(out, { recursive: true });
const file = `${out}/node-script-${process.pid}.log`;
const append = fs.appendFileSync;
const note = (k, p) => { const s = p instanceof URL ? fileURLToPath(p) : String(p); if (!s.includes("/node_modules/")) append(file, `${k}\t${s}\n`); };
registerHooks({
  load(url, context, next) { if (url.startsWith("file:")) note("module", fileURLToPath(url)); return next(url, context); },
});
for (const n of ["readFileSync", "readFile", "existsSync", "statSync", "readdirSync", "openSync", "createReadStream"]) {
  const o = fs[n]; fs[n] = function (p, ...r) { note("fs:" + n, p); return o.call(this, p, ...r); };
}
for (const n of ["readFile", "open"]) { const o = fsp[n]; fsp[n] = function (p, ...r) { note("fsp:" + n, p); return o.call(this, p, ...r); }; }
syncBuiltinESMExports();
