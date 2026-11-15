// The e2e harness's entry (`npm run e2e`, `npm run e2e:smoke`): bundles scripts/e2e/main.ts for Node with esbuild, the
// project's own bundler, and runs it. No dependency beyond Node's fetch and WebSocket (Node 22).
import esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, ".e2e", "runner.mjs");
mkdirSync(dirname(out), { recursive: true });
await esbuild.build({ entryPoints: [join(root, "scripts/e2e/main.ts")], bundle: true, platform: "node", format: "esm", target: "node22", outfile: out, logLevel: "warning", packages: "external" });
const { main } = await import(pathToFileURL(out).href);
process.exitCode = await main(process.argv.slice(2));
