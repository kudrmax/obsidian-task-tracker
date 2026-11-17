import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
/** The spike's main.js without the @dnd-kit/react comparison view, and what each library adds to it (minified bytes). */
const stub = { name: "stub", setup(b) {
	b.onResolve({ filter: /assistant\/ClaudeTransport$|\.\/AltScreen$/ }, (a) => ({ path: a.path, namespace: "stub" }));
	b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: a.path.includes("Alt") ? "export function AltScreen(){return null}" : "export class ClaudeTransport {}", loader: "js" }));
	b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.slice(0, -4)), namespace: "raw" }));
	b.onLoad({ filter: /.*/, namespace: "raw" }, (a) => ({ contents: readFileSync(a.path, "utf8"), loader: "text" }));
} };
const r = await esbuild.build({ entryPoints: ["spike/main.tsx"], bundle: true, write: false, minify: true, format: "cjs", target: "es2020", jsx: "automatic", metafile: true, define: { "process.env.NODE_ENV": '"production"', "import.meta.url": '"x"' }, external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules, ...builtinModules.map((n) => `node:${n}`)], plugins: [stub] });
const out = r.outputFiles[0].contents;
const groups = {};
for (const [file, info] of Object.entries(r.metafile.outputs[Object.keys(r.metafile.outputs)[0]].inputs)) {
	const m = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
	const key = m ? m[1] : file.startsWith("core/") ? "core/" : file.startsWith("obsidian/") ? "obsidian/ (compose, infra)" : file.startsWith("spike/") ? "spike/" : "other";
	groups[key] = (groups[key] ?? 0) + info.bytesInOutput;
}
console.log("total", (out.length / 1024).toFixed(1), "KB; gzip", (gzipSync(out).length / 1024).toFixed(1), "KB");
for (const [k, v] of Object.entries(groups).sort((a, b) => b[1] - a[1])) console.log((v / 1024).toFixed(1).padStart(7), "KB", k);
