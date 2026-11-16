// setupFile: runs in each worker before the test file; wraps fs reads and syncs ESM named exports.
import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const out = process.env.CLOSURE_OUT!;
const log = appendFileSync; const mk = mkdirSync;
const norm = (p: unknown) => (p instanceof URL ? fileURLToPath(p) : typeof p === "string" ? p : String(p));
const g = globalThis as { __closureWrapped?: boolean };
if (!g.__closureWrapped) {
  g.__closureWrapped = true;
  mk(out, { recursive: true });
  const file = `${out}/fs-${process.pid}.log`;
  const wrap = (obj: any, name: string) => {
    const orig = obj[name];
    if (typeof orig !== "function") return;
    obj[name] = function (p: unknown, ...rest: unknown[]) { try { log(file, `${name}\t${norm(p)}\n`); } catch {} return orig.call(this, p, ...rest); };
  };
  for (const n of ["readFileSync", "readFile", "existsSync", "statSync", "readdirSync", "openSync", "createReadStream"]) wrap(fs, n);
  for (const n of ["readFile", "open", "stat", "readdir"]) wrap(fsp, n);
  syncBuiltinESMExports();
}
