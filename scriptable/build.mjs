// Builds `scriptable/Task Notifications.js` from src/scriptable, with the tasks file read by the plugin's own parser.
// `node scriptable/build.mjs --stdout` prints the script instead: the tests compare it with the committed one.
import esbuild from "esbuild";
import { writeFile } from "node:fs/promises";

const OUTFILE = "scriptable/Task Notifications.js";

const BANNER = `// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: bell;

// Task Calendar: уведомления о задачах, поставленных на время. Ставит уведомление на начало каждой несделанной задачи
// из Now и Soon со слотом ⏰ и убирает те, что больше не нужны. Запускать после каждого изменения файла задач:
// автоматизацией Shortcuts «Obsidian закрыт» (см. README, раздел Notifications).
//
// Собран из src/scriptable командой \`node scriptable/build.mjs\`: править можно только настройки ниже.

const SETTINGS = {
	// Файловая закладка Scriptable на папку vault, та же, что у Export Work Calendar.
	bookmark: "ObsidianVault",
	// Как в настройках плагина Task Calendar.
	tasksFile: "TODOs Tasks.md",
	sections: { now: "Now", soon: "Soon", done: "Done" },
	markers: { dueDate: "📅", slot: "⏰" },
};
`;

const result = await esbuild.build({
	entryPoints: ["src/scriptable/main.ts"],
	bundle: true,
	format: "esm",
	target: "es2022",
	charset: "utf8",
	banner: { js: BANNER },
	write: false,
	logLevel: "warning",
});
const text = result.outputFiles[0].text;

if (process.argv.includes("--stdout")) process.stdout.write(text);
else await writeFile(OUTFILE, text);
