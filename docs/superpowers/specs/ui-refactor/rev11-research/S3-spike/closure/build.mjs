import * as esbuild from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const virtualRows = {
  name: "virtual-rows",
  setup(b) {
    b.onResolve({ filter: /^virtual:rows$/ }, () => ({ path: "rows", namespace: "virtual" }));
    b.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({
      contents: readFileSync("fixtures/rows.json", "utf8"), loader: "json",
      watchFiles: [new URL("./fixtures/rows.json", import.meta.url).pathname],
    }));
  },
};
const r = await esbuild.build({ entryPoints: ["src/entry.ts"], bundle: true, outdir: "dist", metafile: true, write: true, plugins: [virtualRows], logLevel: "warning" });
writeFileSync("dist/meta.json", JSON.stringify(r.metafile, null, 1));
console.log("metafile inputs:", Object.keys(r.metafile.inputs));
