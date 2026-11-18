/**
 * The stand plugin (obsidian/stand, id task-calendar-stand) built into build/stand/: its own main.js, its manifest, the
 * root styles.css. Never the root main.js: `npm run release` and BRAT never see it.
 */
import esbuild from "esbuild";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

const out = path.resolve("build/stand");
await mkdir(out, { recursive: true });
const result = await esbuild.build({
	entryPoints: ["obsidian/stand/main.ts"],
	bundle: true,
	format: "cjs",
	target: "es2020",
	jsx: "automatic",
	minify: true,
	define: { "process.env.NODE_ENV": '"production"' },
	external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
	outfile: path.join(out, "main.js"),
	banner: { js: `// task-calendar-stand ${new Date().toISOString()}` },
	logLevel: "info",
});
if (result.errors.length) process.exit(1);
await writeFile(path.join(out, "manifest.json"), `${JSON.stringify({ id: "task-calendar-stand", name: "Task Calendar Stand", version: "0.0.1", minAppVersion: "1.5.0", description: "The screen's engine on made-up tasks, for the test Obsidian only.", author: "Task Calendar", isDesktopOnly: false }, null, "\t")}\n`);
await copyFile("styles.css", path.join(out, "styles.css"));
