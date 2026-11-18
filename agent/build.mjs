// Builds `agent/obsidian-task-calendar.mjs`, the agents' read-only command line program over the core, for Node.
// `node agent/build.mjs --stdout` prints it instead: the tests compare it with the committed one.
import esbuild from "esbuild";
import { chmod, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";

const OUTFILE = "agent/obsidian-task-calendar.mjs";

const result = await esbuild.build({
	stdin: { contents: 'import { start } from "./compose";\nawait start();\n', resolveDir: "agent", sourcefile: "obsidian-task-calendar.ts", loader: "ts" },
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	charset: "utf8",
	external: [...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
	banner: { js: "#!/usr/bin/env node\n// obsidian-task-calendar: built from agent/ by `node agent/build.mjs`. Do not edit." },
	write: false,
	logLevel: "warning",
});
const text = result.outputFiles[0].text;

if (process.argv.includes("--stdout")) process.stdout.write(text);
else {
	await writeFile(OUTFILE, text);
	await chmod(OUTFILE, 0o755);
}
