/**
 * The end-to-end checks' page (tests/e2e/page) built into build/e2e-page/: index.html, main.js (the engine over the stand's
 * MockPort, Obsidian's editor swapped for the page's stand-in) and styles.css (the root styles.css after the Obsidian
 * values it reads). Playwright opens it from the disk.
 */
import esbuild from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("build/e2e-page");
const page = path.resolve("tests/e2e/page");
await mkdir(out, { recursive: true });

/** The engine's text field holds Obsidian's editor; the page has no Obsidian, so it gets the stand-in with the same interface. */
const editorStandIn = {
	name: "editor-stand-in",
	setup(build) {
		build.onResolve({ filter: /\/markdown\/EmbeddedEditor$/ }, (args) => (args.importer.startsWith(page) ? undefined : { path: path.join(page, "EditorStandIn.ts") }));
	},
};

const result = await esbuild.build({
	entryPoints: [path.join(page, "main.tsx")],
	bundle: true,
	format: "iife",
	target: "es2022",
	jsx: "automatic",
	sourcemap: "inline",
	define: { "process.env.NODE_ENV": '"production"' },
	plugins: [editorStandIn],
	outfile: path.join(out, "main.js"),
	banner: { js: `// task-calendar-e2e-page ${new Date().toISOString()}` },
	logLevel: "warning",
});
if (result.errors.length) process.exit(1);
await writeFile(path.join(out, "styles.css"), `${await readFile(path.join(page, "obsidian.css"), "utf8")}\n${await readFile("styles.css", "utf8")}`);
await writeFile(
	path.join(out, "index.html"),
	`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Task Calendar e2e</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>
<script src="main.js"></script>
</body>
</html>
`,
);
