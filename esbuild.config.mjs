import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

const { version } = JSON.parse(await readFile("manifest.json", "utf8"));

const production = process.argv.includes("production");
const demo = process.argv.includes("demo");

/** `import text from "./file?raw"`: the file's text, as Vite (and so the tests) reads it. */
const raw = {
  name: "raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -"?raw".length)), namespace: "raw" }));
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
  },
};

const context = await esbuild.context({
  entryPoints: [demo ? "obsidian/demo.ts" : "obsidian/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules],
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
  plugins: [raw],
  // The release checks it: a main.js left from an older build carries another version.
  banner: { js: `// task-calendar ${version}` },
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
