import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

const { version } = JSON.parse(await readFile("manifest.json", "utf8"));

const production = process.argv.includes("production");
const demo = process.argv.includes("demo");
/** The e2e build (`scripts/e2e`): its frozen clock and fixture network, beside main.js, never in its place. */
const e2e = process.argv.includes("e2e");
/** Where the e2e build goes (`--outfile=<path>`): the harness passes its own, under E2E_HOME. */
const outfileArg = process.argv.find((a) => a.startsWith("--outfile="))?.slice("--outfile=".length);
if (outfileArg && !e2e) throw new Error("--outfile is for the e2e build only: main.js stays at the root");

/** `import text from "./file?raw"`: the file's text, as Vite (and so the tests) reads it. */
const raw = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -"?raw".length)), namespace: "raw" }));
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
  },
};

const context = await esbuild.context({
  entryPoints: [e2e ? "obsidian/e2e.ts" : demo ? "obsidian/demo.ts" : "obsidian/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules],
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: e2e ? (outfileArg ?? ".e2e/build/main.js") : "main.js",
  logLevel: "info",
  plugins: [raw],
  // The release checks it: a main.js left from an older build carries another version.
  banner: { js: `// task-calendar ${version}${e2e ? " e2e" : ""}` },
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
