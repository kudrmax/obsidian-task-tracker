import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/** `node spike/build.mjs <outdir> [ios]`: the spike plugin (main.js, manifest.json, styles.css), or the standalone iOS page. */
const outdir = path.resolve(process.argv[2] ?? "spike/dist");
const ios = process.argv.includes("ios");
await mkdir(outdir, { recursive: true });

const common = {
	bundle: true,
	format: ios ? "iife" : "cjs",
	target: "es2020",
	minify: process.env.SPIKE_MINIFY !== "0",
	jsx: "automatic",
	define: { "process.env.NODE_ENV": process.env.SPIKE_DEV ? '"development"' : '"production"', "import.meta.url": '"file:///task-calendar-spike/main.js"' },
	logLevel: "info",
	metafile: true,
};

/** The assistant's agent SDK is the real plugin's, not the stack's: left out so the size is the screen's. */
const noAssistant = {
	name: "no-assistant",
	setup(build) {
		build.onResolve({ filter: /assistant\/ClaudeTransport$/ }, () => ({ path: "stub", namespace: "stub" }));
		build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export class ClaudeTransport {}", loader: "js" }));
	},
};

/** `import text from "./file?raw"`, as the real build reads it. */
const raw = {
	name: "raw",
	setup(build) {
		build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -"?raw".length)), namespace: "raw" }));
		build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
	},
};

if (ios) {
	await esbuild.build({ ...common, entryPoints: ["spike/ios/page.tsx"], outfile: path.join(outdir, "page.js") });
	await copyFile("spike/ios/index.html", path.join(outdir, "index.html"));
} else {
	const result = await esbuild.build({
		...common,
		entryPoints: ["spike/main.tsx"],
		outfile: path.join(outdir, "main.js"),
		external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
		banner: { js: "// task-calendar-spike" },
		plugins: [noAssistant, raw],
	});
	await copyFile("spike/manifest.json", path.join(outdir, "manifest.json"));
	await copyFile("spike/styles.css", path.join(outdir, "styles.css"));
	const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
	console.log(text.split("\n").slice(0, 40).join("\n"));
}
