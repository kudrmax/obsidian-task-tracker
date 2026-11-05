import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

/**
 * The imports that still cross a layer, as `file → import`. Each block of the layers series strikes out its own;
 * none is added. A line that no longer occurs fails too, so the list only shrinks.
 */
const ALLOWED: readonly string[] = [
	"src/ui/ColumnSwitch.ts → src/settings.ts",
	"src/ui/ScreenTracks.ts → src/settings.ts",
	"src/ui/SettingsTab.ts → src/application/ports.ts",
	"src/ui/SettingsTab.ts → src/settings.ts",
	"src/ui/TaskCalendarView.ts → src/application/ports.ts",
	"src/ui/TaskCalendarView.ts → src/settings.ts",
	"src/ui/cardSize.ts → src/settings.ts",
	"src/ui/listWidth.ts → src/settings.ts",
	"src/ui/quick/QuickEntryController.ts → src/settings.ts",
	"src/ui/screens.ts → src/settings.ts",
	"src/ui/settingsEffect.ts → src/settings.ts",
	"src/ui/zoomLevels.ts → src/settings.ts",
];

type Layer = "domain" | "application" | "infrastructure" | "ui" | "phone" | "settings" | "root";

/** Obsidian's own packages: the app provides them at run time (`external` in esbuild.config.mjs). */
const OBSIDIAN_PACKAGES = ["obsidian", "@codemirror/state", "@codemirror/view"];

function layerOf(file: string): Layer | null {
	if (["src/main.ts", "src/demo.ts", "src/compose.ts"].includes(file)) return "root";
	if (file === "src/settings.ts") return "settings";
	const m = /^src\/(domain|application|infrastructure|ui|phone)\//.exec(file);
	return m ? (m[1] as Layer) : null;
}

const under = (target: string, dir: string): boolean => target.startsWith(`src/${dir}/`);

/** What a layer may import: a path in the repository, or a package's name. */
const MAY_IMPORT: Readonly<Record<Layer, (target: string) => boolean>> = {
	domain: (t) => under(t, "domain"),
	application: (t) => under(t, "domain") || under(t, "application") || t === "src/settings.ts",
	infrastructure: (t) => !under(t, "ui"),
	ui: (t) => under(t, "ui") || t === "src/application/contracts.ts" || OBSIDIAN_PACKAGES.includes(t),
	phone: (t) => under(t, "phone") || under(t, "application") || t === "src/settings.ts",
	settings: (t) => under(t, "domain"),
	root: () => true,
};

function sources(dir: string): string[] {
	return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		if (entry.isDirectory()) return sources(path);
		return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
	});
}

const IMPORT_FORMS = [
	/\b(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/g,
	/^\s*import\s*["']([^"']+)["']/gm,
	/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function withoutComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The import as the rule reads it: a repository path for a relative one, the package's name otherwise. */
function target(file: string, specifier: string): string {
	if (!specifier.startsWith(".")) return specifier;
	const path = relative(ROOT, resolve(ROOT, dirname(file), specifier.replace(/\?raw$/, "")));
	if (/\.\w+$/.test(path)) return path;
	return existsSync(join(ROOT, `${path}.ts`)) ? `${path}.ts` : `${path}/index.ts`;
}

function importsOf(file: string): string[] {
	const text = withoutComments(readFileSync(join(ROOT, file), "utf8"));
	const found = IMPORT_FORMS.flatMap((form) => [...text.matchAll(form)].map((m) => target(file, m[1])));
	return [...new Set(found)];
}

const FILES = sources("src");

function violations(): string[] {
	return FILES.flatMap((file) => {
		const layer = layerOf(file)!;
		return importsOf(file)
			.filter((t) => !MAY_IMPORT[layer](t))
			.map((t) => `${file} → ${t}`);
	});
}

describe("the layers", () => {
	it("knows the layer of every source file", () => {
		expect(FILES.filter((file) => layerOf(file) === null)).toEqual([]);
	});

	it("reads every form of import it guards", () => {
		expect(importsOf("src/application/contracts.ts")).toContain("src/domain/Repeat.ts");
		expect(importsOf("src/main.ts")).toEqual(expect.arrayContaining(["obsidian", "child_process", "src/ui/SettingsTab.ts"]));
		expect(importsOf("src/infrastructure/WorkCalendarExportScript.ts")).toContain("scriptable/work-calendar-export.js");
	});

	it("crosses no layer but where the list allows", () => {
		expect(violations().filter((v) => !ALLOWED.includes(v))).toEqual([]);
	});

	it("allows only what still occurs, so the list only shrinks", () => {
		const found = violations();
		expect(ALLOWED.filter((v) => !found.includes(v))).toEqual([]);
	});
});
