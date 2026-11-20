/**
 * The stand plugin (obsidian/stand, id task-calendar-stand) built into build/stand/: its own main.js, its manifest, the
 * root styles.css. Never the root main.js: `npm run release` and BRAT never see it. Also build/stand-vault/: a whole vault
 * holding the stand, its note with the screen's block and only the stand turned on, to copy to a phone as a vault of its own.
 */
import esbuild from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";

/** `import text from "./file?raw"`: the file's text (the trackpad's main-process loader). */
const raw = {
	name: "raw",
	setup(build) {
		build.onResolve({ filter: /\?raw$/ }, (args) => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -"?raw".length)), namespace: "raw" }));
		build.onLoad({ filter: /.*/, namespace: "raw" }, async (args) => ({ contents: await readFile(args.path, "utf8"), loader: "text" }));
	},
};

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
	plugins: [raw],
	/** The trackpad's native module, embedded and written beside the plugin on load (Decision 126). */
	loader: { ".node": "base64" },
	outfile: path.join(out, "main.js"),
	banner: { js: `// task-calendar-stand ${new Date().toISOString()}` },
	logLevel: "info",
});
if (result.errors.length) process.exit(1);
await writeFile(path.join(out, "manifest.json"), `${JSON.stringify({ id: "task-calendar-stand", name: "Task Calendar Stand", version: "0.0.1", minAppVersion: "1.5.0", description: "The screen's engine on made-up tasks, for the test Obsidian only.", author: "Task Calendar", isDesktopOnly: false }, null, "\t")}\n`);
await copyFile("styles.css", path.join(out, "styles.css"));

const vault = path.resolve("build/stand-vault/Task Calendar Stand");
const config = path.join(vault, ".obsidian");
const plugin = path.join(config, "plugins", "task-calendar-stand");
await mkdir(plugin, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) await copyFile(path.join(out, file), path.join(plugin, file));
await writeFile(path.join(config, "community-plugins.json"), `${JSON.stringify(["task-calendar-stand"])}\n`);
await writeFile(path.join(config, "app.json"), "{}\n");
await writeFile(path.join(vault, "Заметка о доме.md"), "Дом.\n\n```task-calendar-stand\n```\n");
await writeFile(
	path.resolve("build/stand-vault/README.txt"),
	"Copy the folder «Task Calendar Stand» into iCloud Drive › Obsidian on the iPhone, open it in Obsidian as a vault, allow community plugins; the flask on the left ribbon (or «Task Calendar Stand: Open the screen») opens the screen.\n",
);
