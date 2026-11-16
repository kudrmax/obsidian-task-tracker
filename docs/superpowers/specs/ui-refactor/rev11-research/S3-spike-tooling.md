# S3 — tooling spike for spec revision 14 (C5, Guards, Tests)

Date: 2026-11-16. Node v22.22.0, npm 10.9.4, macOS 15 (Darwin 24.6).
Everything ran in `scratchpad/spike-tooling/` (below `SP`). No repository file was changed.
Versions are the repository's (`.worktrees/ui-refactor-slice3-carry2`): vitest **5.0.5**, vite **8.3.5**, esbuild **0.28.2**, typescript **7.0.2**.

| # | Mechanism | Verdict |
|---|---|---|
| 1a | Vite plugin records every module a Vitest run loads | **WORKS-WITH** `fsModuleCache: false` (default `true` → a warm run records **nothing**) |
| 1b | fs reads (JSON fixture, CSS) recorded in the test workers | **WORKS** (setupFile wraps `fs`/`fs/promises` + `syncBuiltinESMExports()`) |
| 1c | Plain Node script via `node --import` | **WORKS-WITH** `module.registerHooks` (sync). `module.register` (async, what the spec names) **misses `require()`** and fs reads |
| 1d | esbuild metafile | **WORKS** for the bundle's inputs; files a plugin reads by `fs` are not in it (need the Node hook over the build script) |
| 2 | Stryker 10.1.1 + Vitest 5.0.5 + Vite 8.3.5, no checker, incremental | **WORKS-WITH** `npm i --legacy-peer-deps` (npm 10.9.4 crashes on vitest 5's peer set). ~4 s full, ~1 s reused |
| 3 | CDP trap in a `window.open('about:blank')` popout | **WORKS** in Electron 39.2.7 (Chromium 142) and headless Chrome 157: the trap is in place before `window.open` returns to the opener |
| 4 | jscpd threshold 0 on `obsidian/ui/next` (slice3) | **WORKS**: 0.6 s wall, 3 clones, 0 false positives; the gate is red today |

---

## 0. npm: vitest 5.0.5 does not install with plain `npm i` on npm 10.9.4

```
$ npm i -D vitest@5.0.5 vite@8.3.5 esbuild@0.28.2 typescript@7.0.2
npm error Cannot read properties of null (reading 'edgesOut')
  at #loadPeerSet (.../@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289:38)
```
Fails on its own too (`npm i -D vitest@5.0.5` after vite was installed). Works with `--legacy-peer-deps`. The repository has a lockfile, so `npm ci` there is not affected; adding a new devDependency next to vitest (Stryker) hits it. Spec consequence: adding `@stryker-mutator/*` to the repo needs `--legacy-peer-deps` or a newer npm.

## 1. Recording the closure

### 1.1 Toy project (`SP/closure/`)

```
src/a.ts        imports ./b
src/b.ts
src/lazy.ts     dynamically imported by a test
src/style.css   imported ?raw by a test AND read by fs.promises.readFile
src/legacy.cjs  require()d through createRequire
scripts/helper.mjs  imported by absolute file URL with /* @vite-ignore */
fixtures/rows.json  read by readFileSync
tests/a.test.ts, tests/native.test.ts
unit/u.test.ts  (second project, must NOT appear in the guard closure)
```

### 1.2 The Vite plugin (`guards/record-plugin.mjs`)

```js
import { appendFileSync, mkdirSync } from "node:fs";
export function recordClosure(outDir) {
  const seen = new Set();
  const note = (kind, id) => {
    const key = kind + "\t" + id;
    if (seen.has(key)) return;
    seen.add(key);
    mkdirSync(outDir, { recursive: true });
    appendFileSync(outDir + "/vite-modules.log", key + "\n");
  };
  return {
    name: "record-closure",
    enforce: "pre",
    configResolved(config) { for (const f of config.configFileDependencies ?? []) note("config", f); if (config.configFile) note("config", config.configFile); },
    load(id) { note("load", id); return null; },
    transform(_code, id) { note("transform", id); return null; },
  };
}
```
Written incrementally (append), because Vitest gives a plugin no reliable "run ended" hook (`closeBundle` never fires in serve mode).
`configResolved` → `configFileDependencies` adds the config file and every local file it imports (the plugin itself), which the transform hook never sees.

### 1.3 The fs setup file (`guards/fs-setup.ts`, a `setupFiles` entry, runs in each worker)

```ts
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
```
`syncBuiltinESMExports()` is what makes `import { readFileSync } from "node:fs"` in a test file see the wrapper (Vitest's runner imports builtins natively, so named imports are live bindings of the builtin namespace).

### 1.4 Config (`vitest.config.mts`)

```ts
import { defineConfig } from "vitest/config";
import { recordClosure } from "./guards/record-plugin.mjs";
const out = process.env.CLOSURE_OUT ?? "closure-out";
export default defineConfig({
  plugins: [recordClosure(out)],
  test: {
    include: ["tests/**/*.test.ts"],
    css: true,                       // without it `import css from "./x.css?raw"` is "" in Vitest
    setupFiles: ["guards/fs-setup.ts"],
    fsModuleCache: process.env.NOCACHE ? false : undefined,
    execArgv: process.env.NODEHOOK ? ["--import", new URL("./guards/loader-register.mjs", import.meta.url).pathname] : [],
  },
});
```

### 1.5 Results

Command: `NOCACHE=1 ./run.sh final` (= `CLOSURE_OUT=out-final npx vitest run`, then print the logs relative to the project).

```
 Test Files  2 passed (2)
--- vite (config + transform):
config	guards/record-plugin.mjs
config	vitest.config.mts
transform	guards/fs-setup.ts
transform	scripts/helper.mjs        <- imported by absolute file URL + @vite-ignore: still through Vite
transform	src/a.ts
transform	src/b.ts
transform	src/lazy.ts               <- dynamic import
transform	src/style.css?raw
transform	tests/a.test.ts
transform	tests/native.test.ts
--- fs reads (workers):
existsSync	fixtures/rows.json
existsSync	tests/__snapshots__/a.test.ts.snap        <- Vitest's own snapshot probe (filter or keep)
existsSync	tests/__snapshots__/native.test.ts.snap
openSync	node_modules/vitest/dist/index.js         <- Vitest's own (filter node_modules)
readFile	src/style.css
readFileSync	fixtures/rows.json
readFileSync	src/legacy.cjs                          <- require() of a CJS file is seen as an fs read
```

**The cache trap (default config):**

```
$ ./run.sh r1     # first run after a config change
transform	guards/fs-setup.ts ... src/lazy.ts           (6 modules)
$ ./run.sh r2     # same thing again, default fsModuleCache
--- vite modules (transform):
                                                    (EMPTY — every module came from node_modules/.vitest-cache)
$ NOCACHE=1 ./run.sh r3
transform	... (all 6 again)
```
In Vitest 5.0.5 `test.fsModuleCache` is **top-level** (not under `experimental`) and **defaults to `true`** (`dist/chunks/plugin.d.*.d.ts`: "Cache transformed modules on the file system … @default true"). A recorder that does not turn it off records an empty closure on every warm run — the pin would then pass with nothing. The `load` hook is skipped too. The spec's "Vitest's caches off for the run" must name exactly `test.fsModuleCache: false` in the guard project's config (and the recorder should fail when it records zero modules).

**Per project:** with `test.projects: [{ plugins: [recordClosure(out)], test: { name: "guards", … } }, { test: { name: "unit", … } }]` the guard project's plugin recorded only the guard project's modules; `unit/u.test.ts` did not appear. `fsModuleCache: false` set at the root applied. So "a Vite plugin in the guard project's config" works as written.

**Node loader hook inside Vitest workers** (`execArgv: ["--import", loader-register.mjs]`): installed and running in every worker (it logged ~40 `node_modules/vitest/dist/*` loads when unfiltered), but it saw **no project file**: Vitest's module runner loads every non-`node_modules` file through Vite, not through Node. Not needed for the closure; the Vite plugin + fs wrapper cover it.

**What the Vitest recorder does not see:** files read by the Vitest main process outside Vite (e.g. a `globalSetup` that does `readFileSync`) — the fs wrapper runs in workers only. If the guard project gets a `globalSetup`, wrap fs in it too.

### 1.6 Plain Node scripts (`node --import`)

`scripts/plain.mjs` imports `./helper.mjs` and `./lib.ts` (type stripping), `await import("../src/lazy.ts")`, `require("../src/legacy.cjs")` via `createRequire`, and `readFileSync(fixtures/rows.json)`.

**(a) `module.register` (async hooks — what the spec text names)**, `guards/loader-register.mjs` + `guards/loader-hooks.mjs`:
```js
// loader-register.mjs
import { register } from "node:module";
register("./loader-hooks.mjs", import.meta.url, { data: { out: process.env.CLOSURE_OUT } });
// loader-hooks.mjs
export async function load(url, context, next) { /* append url */ return next(url, context); }
```
```
$ node --import ./guards/loader-register.mjs scripts/plain.mjs
plain ran: helper X 42 3 lazy
load	scripts/helper.mjs
load	scripts/lib.ts
load	scripts/plain.mjs
load	src/lazy.ts
                                  <- src/legacy.cjs (require) MISSING, fixtures/rows.json (fs) MISSING
```

**(b) `module.registerHooks` (sync hooks, Node ≥ 22.15) + fs wrap, one `--import` file** (`guards/node-closure.mjs`):
```js
import fs from "node:fs";
import fsp from "node:fs/promises";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { fileURLToPath } from "node:url";
const out = process.env.CLOSURE_OUT;
fs.mkdirSync(out, { recursive: true });
const file = `${out}/node-script-${process.pid}.log`;
const append = fs.appendFileSync;
const note = (k, p) => { const s = p instanceof URL ? fileURLToPath(p) : String(p); if (!s.includes("/node_modules/")) append(file, `${k}\t${s}\n`); };
registerHooks({ load(url, context, next) { if (url.startsWith("file:")) note("module", fileURLToPath(url)); return next(url, context); } });
for (const n of ["readFileSync", "readFile", "existsSync", "statSync", "readdirSync", "openSync", "createReadStream"]) {
  const o = fs[n]; fs[n] = function (p, ...r) { note("fs:" + n, p); return o.call(this, p, ...r); };
}
for (const n of ["readFile", "open"]) { const o = fsp[n]; fsp[n] = function (p, ...r) { note("fsp:" + n, p); return o.call(this, p, ...r); }; }
syncBuiltinESMExports();
```
```
$ CLOSURE_OUT=out-node node --import ./guards/node-closure.mjs scripts/plain.mjs
plain ran: helper X 42 3 lazy
module	scripts/helper.mjs
module	scripts/lib.ts
module	scripts/plain.mjs
module	src/lazy.ts
module	src/legacy.cjs          <- require seen
fs:readFileSync	fixtures/rows.json
fs:readFileSync	src/legacy.cjs
fs:openSync	...             (Node's ESM loader opens each module with fs.openSync — harmless duplicates)
```
Spec fix: say `module.registerHooks` (sync, Node 22.15+, present in 22.22), not `module.register`, plus the fs wrap; or both.

### 1.7 esbuild (`SP/closure/build.mjs`)

Entry imports `./a` (→ `./b`), `./style.css`, `../fixtures/rows.json`, and `virtual:rows` served by a plugin whose `onLoad` reads `fixtures/rows.json` with `readFileSync` (with `watchFiles`).
```
$ CLOSURE_OUT=out-esbuild node --import ./guards/node-closure.mjs build.mjs
metafile inputs: [ 'src/b.ts', 'src/a.ts', 'src/style.css', 'virtual:rows', 'fixtures/rows.json', 'src/entry.ts' ]
--- node hook + fs:
module	build.mjs
fs:readFileSync	fixtures/rows.json     <- the plugin's own read (esbuild's Go side reads the sources; fs wrap does not see those)
```
- The metafile lists every bundled input; a plugin-served module appears only as `virtual:rows` (namespace path), not as the file it read. `watchFiles` is **not** in the metafile.
- The build script itself (`esbuild.config.mjs`, its imports, what its plugins read) is only in the Node hook's log. So "the build's closure" = metafile inputs ∪ `node --import guards/node-closure.mjs esbuild.config.mjs` log. The metafile alone is the product's inputs (as the spec uses it for the checker), not the build's guard closure.

## 2. Stryker (`SP/stryker/`)

Install:
```
npm i -D vite@8.3.5 typescript@7.0.2
npm i -D vitest@5.0.5 @stryker-mutator/core @stryker-mutator/vitest-runner --legacy-peer-deps
→ @stryker-mutator/core 10.1.1, @stryker-mutator/vitest-runner 10.1.1 (peer vitest >=2.0.0), vitest 5.0.5, vite 8.3.5
```

`stryker.config.mjs`:
```js
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.mts" },
  mutate: ["src/**/*.ts"],
  checkers: [],
  reporters: ["clear-text", "json", "progress"],
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  thresholds: { high: 90, low: 80, break: 70 },
  tempDirName: ".stryker-tmp",
};
```
Toy module `src/rule.ts` (string comparisons, `startsWith`, `length > 8`, `filter`), 4 tests.

Run 1 (cold): `time npx stryker run`
```
INFO DryRunExecutor Starting initial test run (vitest test runner with "perTest" coverage analysis).
INFO DryRunExecutor Initial test run succeeded. Ran 4 tests …
INFO ConcurrencyTokenProvider Creating 13 test runner process(es).
File      |  total | covered | # killed | # timeout | # survived | # no cov | # errors |
All files |  85.29 |   85.29 |       29 |         0 |          5 |        0 |        0 |
INFO MutationTestReportHelper Final mutation score of 85.29 is greater than or equal to break threshold 70
INFO MutationTestExecutor Done in 2 seconds.
real 4.34 s
```
No WARN or ERROR lines. Survivors were real (e.g. `owner.length > 8` → `>= 8`).

Run 2 (nothing changed): `npx stryker run --reporters clear-text`
```
INFO ProjectReader Found 1 of 6 file(s) to be mutated using incremental report with 34 mutant(s), and 4 test(s).
INFO IncrementalDiffer Incremental report:  Result: 34 of 34 mutant result(s) are reused.
All files |  85.29 | …
INFO MutationTestExecutor Done in 0 seconds.
```

Run 3 (one test added, one source line changed):
```
INFO IncrementalDiffer Incremental report:  Result: 20 of 39 mutant result(s) are reused.
All files |  92.31 |   92.31 |       36 |         0 |          3 |        0 |        0 |
INFO MutationTestExecutor Done in 1 second.
real 4.22 s   (process start + dry run dominate)
```
`--force` retests all while keeping the incremental file.

Multi-project Vitest config (`test.projects: [guards, unit]`) as `vitest.configFile`: works (`Ran 6 tests`, same score, 4.06 s). The runner has **no project option** (`vitest-runner-options.json`: `configFile`, `dir`, `related` only), so "Stryker over the guard code" needs a config file that holds only the guard project (e.g. `vitest.guards.config.mts`), not `--project guards`.

## 3. CDP trap in popout windows (`SP/cdp/`)

Targets started by me only: Electron **39.2.7** (Chromium 142, binary from `~/dev/tasknotes/node_modules/electron`, own app in `SP/cdp/app`, own `--user-data-dir`, port **9400**, windows `show:false`, `setActivationPolicy("accessory")` so no focus was taken), and headless Google Chrome **157.0.8103.78** (port **9401**, own `--user-data-dir`). Both were stopped by PID afterwards; Obsidian untouched.

Electron app: `BrowserWindow` loads `opener.html`; `setWindowOpenHandler(() => ({ action: "allow", overrideBrowserWindowOptions: { show: false } }))`. The opener's code (what Obsidian does for a popout):
```js
window.openPopout = async () => {
  const t = performance.now(); const w = window.open("about:blank", "_blank", "width=400,height=300"); const openMs = performance.now() - t;
  const r = { opened: !!w, openMs: Math.round(openMs) };
  r.syncTrap = !!(w.Element && w.Element.prototype.animate.__trap);   // right after open, same task
  const d = w.document.createElement("div"); w.document.body.appendChild(d);
  d.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 50 });
  r.syncLedger = (w.__ledger || []).length;                            // was the opener's first animate caught?
  await new Promise((res) => setTimeout(res, 0));   r.afterTick = !!w.Element.prototype.animate.__trap;
  await new Promise((res) => setTimeout(res, 500)); r.after500  = !!w.Element.prototype.animate.__trap;
  …
};
```
Trap (`trap.js`): wraps `Element.prototype.animate`, marks `__trap`, pushes to `window.__ledger`.

Driver (`drive.mjs`, Node 22 global `WebSocket`), browser-level session from `/json/version`:
```js
await send("Target.setDiscoverTargets", { discover: true });
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });   // browser level
// on every Target.attachedToTarget (type "page"):
await send("Page.addScriptToEvaluateOnNewDocument", { source, runImmediately: true }, sessionId);
await send("Runtime.evaluate", { expression: source }, sessionId);
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
if (waitingForDebugger) await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
// then in the opener: Runtime.evaluate("openPopout()", { awaitPromise: true, userGesture: true })
```

Results (`node drive.mjs <port> <mode>`):

Electron 39 / Chromium 142:
```
mode=autoattach
6.1ms attached type=page url=(empty) waiting=true opener=yes
21.9ms   trap installed (both) in page at about:blank
22.5ms   resumed
opener saw: {"opened":true,"openMs":21,"syncTrap":true,"syncLedger":1,"afterTick":true,"after500":true,"ledgerAfter500":2,"popupHref":"about:blank"}

mode=openeronly   (control: same auto-attach, trap NOT sent to the popup)
6.2ms attached type=page url=(empty) waiting=true opener=yes
18.0ms   resumed
opener saw: {"opened":true,"openMs":15,"syncTrap":false,"syncLedger":0,"afterTick":false,"after500":false,…}
```
Repeated 3× in `autoattach`: identical (`syncTrap:true, syncLedger:1`) every time.
Which call does it: `HOW=addscript` (only `addScriptToEvaluateOnNewDocument` with `runImmediately:true`) → `syncTrap:true`; `HOW=eval` (only `Runtime.evaluate`) → `syncTrap:true`; both → `true`.

Headless Chrome 157: same picture — `autoattach`: `openMs:44, syncTrap:true, syncLedger:1`; `openeronly`: `syncTrap:false`.

What this shows:
- With browser-level auto-attach + `waitForDebuggerOnStart`, the popup target is reported **while the opener is still inside `window.open`**: `openMs` (15–44 ms) equals the time until `runIfWaitingForDebugger`. The opener is blocked until the harness resumes the popup, so the trap is in the popup's realm before the opener's next statement; the opener's very first `animate` on a popup node is in the ledger.
- Gotchas for the harness: (1) it must resume **every** waiting target, not only pages — Chrome also auto-attached `service_worker`, `browser_ui` and a later `type=other waiting=true`; an unresumed one hangs. (2) A slow or dead harness stalls every `window.open` in the app for as long as it waits. (3) `Target.setAutoAttach` at browser level also re-attaches existing pages (the opener appeared twice: once auto, once by `attachToTarget`); install must be idempotent (the trap checks `__trap`).
- Not checked: Obsidian's own popout path (does it call `window.open("about:blank")` exactly like this and use the same renderer process). The spike used a generic Electron app per the brief.

## 4. jscpd on `obsidian/ui/next` (`.worktrees/ui-refactor-slice3`, HEAD 13fb8008)

```
cd SP/jscpd && npm i -D jscpd          # → jscpd 5.4.3 (the native rewrite)
npx jscpd <slice3>/obsidian/ui/next --threshold 0 --reporters console,json --output SP/jscpd/report
```
Output (default min-tokens 50, mode mild):
```
Clone found (typescript)
 - drivers/islands.ts [142:12 - 167:2] (26 lines, 119 tokens)   drivers/islands.ts [482:21 - 508:2]
Clone found (typescript)
 - drivers/islands.ts [214:1 - 237:3] (24 lines, 55 tokens)     drivers/keys.ts [75:1 - 98:3]
Clone found (typescript)
 - update/carry.ts [211:18 - 220:36] (10 lines, 61 tokens)      update/carry.ts [253:13 - 262:36]
│ tsx        │ 14 files │ 2116 lines │ 18242 tokens │ 0 clones │
│ typescript │ 40 files │ 6253 lines │ 57882 tokens │ 3 clones │ 60 (0.96%) │ 235 (0.41%) │
│ Total:     │ 54       │ 8369       │ 76124        │ 3        │ 60 (0.72%) │ 235 (0.31%) │
ERROR: jscpd found too many duplicates (0.7%) over threshold (0.0%)
time: 13.567ms           (jscpd's own); `/usr/bin/time -p npx jscpd … --reporters silent` → real 0.60 s
exit=1
```
All three are **true** duplicates, no false positive:
1. `islands.ts` declares the interfaces `ObsidianEditor` and `EditorOwner` twice in one file (lines ~148 and ~488).
2. `LINE_COMMANDS` (22 Obsidian command ids) is the same constant in `drivers/islands.ts` and `drivers/keys.ts`.
3. `update/carry.ts`: the carry-start record (`rows/folded/cards/grab/box/geometry/target/phase/lands` + the `haptic` and `measureCarry` commands) is built twice (~211 and ~253), differing only in `origins` and `pinned`.

So the threshold-0 gate is red on slice 3 today; each needs a real fix, not an ignore.

Sensitivity (not a gate, for judgement): `--min-tokens 30` → 8 clones (adds box-from-`getBoundingClientRect` shapes in `measure.ts`, two blocks in `input.ts`, `model/entry.ts`↔`model/taskMenu.ts`, another carry block); `--min-tokens 20` → 14, increasingly incidental (short object literals). Keep the default 50 for the gate.

## Spec consequences (for C5 / Guards / Tests)

1. The guard project's config must set `test.fsModuleCache: false` (top-level in 5.0.5) — otherwise the recorded closure is empty on any warm run. The pin should refuse a recorded closure with no modules.
2. Add the setupFile fs wrap (`syncBuiltinESMExports`) for fixtures and CSS a test reads by `fs`; add the config files via `configResolved` → `configFileDependencies`. Filter `node_modules/` and Vitest's `__snapshots__` probes (or keep the snapshot files: they are test data).
3. For plain Node scripts name `module.registerHooks` (sync), not `module.register`: the async hooks miss `require()`.
4. The build's guard closure = esbuild metafile inputs **plus** the Node hook over `esbuild.config.mjs` (the config, its plugins and the files they read are not in the metafile).
5. Stryker: install with `--legacy-peer-deps` (npm 10.9.4); give it a Vitest config holding only the guard project.
6. CDP: the mechanism holds; the harness must resume every waiting target and stay responsive (it blocks `window.open`). `runImmediately: true` on `addScriptToEvaluateOnNewDocument` alone suffices.
7. jscpd fails on slice 3 today with three real duplicates.
