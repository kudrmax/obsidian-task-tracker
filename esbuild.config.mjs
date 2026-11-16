import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

const { version } = JSON.parse(await readFile("manifest.json", "utf8"));

const production = process.argv.includes("production");
const demo = process.argv.includes("demo");
/** `--outfile=<path>`: the build written elsewhere, as tests/build.test.ts loads it. */
const outfile = process.argv.find((arg) => arg.startsWith("--outfile="))?.slice("--outfile=".length) ?? "main.js";

/** `import text from "./file?raw"`: the file's text, as Vite (and so the tests) reads it. */
const raw = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -"?raw".length)), namespace: "raw" }));
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
  },
};

const EVENTS_IN_WINDOW = path.resolve("obsidian/infrastructure/assistant/eventsInWindow.js");

/** `events` and `node:events` in the bundle are the wrapper the agent SDK needs in Obsidian's window; the wrapper's own is Node's. */
const eventsInWindow = {
  name: "events-in-window",
  setup(build) {
    build.onResolve({ filter: /^(node:)?events$/ }, (args) =>
      args.importer === EVENTS_IN_WINDOW ? { path: "node:events", external: true } : { path: EVENTS_IN_WINDOW },
    );
  },
};

const context = await esbuild.context({
  entryPoints: [demo ? "obsidian/demo.ts" : "obsidian/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
  // The agent SDK calls createRequire(import.meta.url) as it loads; a cjs bundle has no import.meta.
  define: { "import.meta.url": '"file:///task-calendar/main.js"' },
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile,
  logLevel: "info",
  plugins: [raw, eventsInWindow],
  // The release checks it: a main.js left from an older build carries another version.
  banner: { js: `// task-calendar ${version}` },
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
