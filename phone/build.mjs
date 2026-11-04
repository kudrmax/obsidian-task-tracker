// Builds `phone/task-calendar-phone.js`, the plugin's tasks-file rules for the iOS app (it runs the file in JavaScriptCore).
// `node phone/build.mjs --stdout` prints it instead: the tests compare it with the committed one.
import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";

const OUTFILE = "phone/task-calendar-phone.js";

const result = await esbuild.build({
	entryPoints: ["src/phone/main.ts"],
	bundle: true,
	format: "iife",
	target: "es2022",
	charset: "utf8",
	banner: { js: "// Task Calendar: built from src/phone by `node phone/build.mjs`. Do not edit." },
	write: false,
	logLevel: "warning",
});
const text = result.outputFiles[0].text;

if (process.argv.includes("--stdout")) process.stdout.write(text);
else await writeFile(OUTFILE, text);
