import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

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
  entryPoints: [demo ? "src/demo.ts" : "src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtinModules],
  format: "cjs",
  target: "es2020",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
  plugins: [raw],
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
