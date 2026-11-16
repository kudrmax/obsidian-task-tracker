// Vite plugin: notes every module id Vite loads/transforms for the test run (Vitest's main process),
// plus the config files Vite bundled to read the config.
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
