import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");

type Layer = "domain" | "application" | "infrastructure" | "ui" | "phone" | "settings" | "root";

/** Obsidian's own packages: the app provides them at run time (`external` in esbuild.config.mjs). */
const OBSIDIAN_PACKAGES = ["obsidian", "@codemirror/state", "@codemirror/view"];

function layerOf(file: string): Layer | null {
	if (["src/main.ts", "src/demo.ts", "src/compose.ts", "src/settingsFile.ts"].includes(file)) return "root";
	if (file === "src/settings.ts") return "settings";
	const m = /^src\/(domain|application|infrastructure|ui|phone)\//.exec(file);
	return m ? (m[1] as Layer) : null;
}

const under = (target: string, dir: string): boolean => target.startsWith(`src/${dir}/`);

/** What the iOS app's entry may use besides the contract: the door, which reaches the same rules the services write with. */
const PHONE_DOOR = "src/application/PhoneDoor.ts";

/** What a layer may import: a path in the repository, or a package's name. */
const MAY_IMPORT: Readonly<Record<Layer, (target: string) => boolean>> = {
	domain: (t) => under(t, "domain"),
	application: (t) => under(t, "domain") || under(t, "application") || t === "src/settings.ts",
	infrastructure: (t) => !under(t, "ui") && !under(t, "phone") && layerOf(t) !== "root",
	ui: (t) => under(t, "ui") || t === "src/application/contracts.ts" || OBSIDIAN_PACKAGES.includes(t),
	phone: (t) => under(t, "phone") || t === "src/application/contracts.ts" || t === PHONE_DOOR,
	settings: (t) => under(t, "domain"),
	root: () => true,
};

const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION = /\.d\.[cm]?ts$/;

function files(dir: string): string[] {
	return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		return entry.isDirectory() ? files(path) : [path];
	});
}

const isSource = (file: string): boolean => SOURCE.test(file) && !DECLARATION.test(file);

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
	const candidates = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"].flatMap((ext) => [`${path}.${ext}`, `${path}/index.${ext}`]);
	return candidates.find((c) => existsSync(join(ROOT, c))) ?? `${path}.ts`;
}

function importsOf(file: string): string[] {
	const text = withoutComments(readFileSync(join(ROOT, file), "utf8"));
	const found = IMPORT_FORMS.flatMap((form) => [...text.matchAll(form)].map((m) => target(file, m[1])));
	return [...new Set(found)];
}

const FILES = files("src").filter(isSource);

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

	it("crosses no layer", () => {
		expect(violations()).toEqual([]);
	});
});

describe("the guard itself", () => {
	it("scans every file of src: a source of a known layer, or a declaration", () => {
		expect(files("src").filter((file) => !isSource(file) && !DECLARATION.test(file))).toEqual([]);
	});

	it("keeps the doors narrow", () => {
		expect(MAY_IMPORT.phone("src/application/TaskServiceImpl.ts")).toBe(false);
		expect(MAY_IMPORT.phone("src/settings.ts")).toBe(false);
		expect(MAY_IMPORT.phone("src/application/contracts.ts")).toBe(true);
		expect(MAY_IMPORT.phone("src/application/PhoneDoor.ts")).toBe(true);
		expect(MAY_IMPORT.phone("src/application/TaskRules.ts")).toBe(false);
		expect(MAY_IMPORT.phone("src/application/composeCore.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("src/phone/main.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("src/compose.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("src/ui/TaskCard.ts")).toBe(false);
		expect(target("src/ui/x.ts", "./TaskCard")).toBe("src/ui/TaskCard.ts");
	});
});

/**
 * Host globals `domain` and `application` still use, each with the branch that removes it. Delete the line when that
 * branch lands: the test fails while a listed exception is no longer needed.
 */
const TEMPORARY_HOST_GLOBALS: readonly { readonly file: string; readonly name: string; readonly until: string }[] = [];

/** What `tsc -p tsconfig.core.json` reports: domain, application and settings without DOM and Node, one line per error. */
function coreErrors(): string[] {
	try {
		execFileSync(join(ROOT, "node_modules/.bin/tsc"), ["-p", "tsconfig.core.json", "--pretty", "false"], { cwd: ROOT, encoding: "utf8" });
		return [];
	} catch (error) {
		const out = (error as { stdout?: string }).stdout ?? String(error);
		return out.split("\n").filter((line) => line.trim() !== "");
	}
}

const excused = (line: string, e: (typeof TEMPORARY_HOST_GLOBALS)[number]): boolean => line.startsWith(`${e.file}(`) && line.includes(`Cannot find name '${e.name}'`);

describe("domain and application run on any host", () => {
	const errors = coreErrors();

	it("use no host global: no window, document, timers, storage or Node (the iOS app runs them in JavaScriptCore)", () => {
		expect(errors.filter((line) => !TEMPORARY_HOST_GLOBALS.some((e) => excused(line, e)))).toEqual([]);
	});

	it("still need every temporary exception", () => {
		expect(TEMPORARY_HOST_GLOBALS.filter((e) => !errors.some((line) => excused(line, e)))).toEqual([]);
	});
});

/**
 * The runtime values contracts.ts hands the UI, by where they come from. Anything else it re-exports is a type. A new
 * one is a choice: the Swift frontend gets it only through the phone door or as a copy, so prefer an answer from a service.
 */
const CONTRACT_RUNTIME: Readonly<Record<string, string>> = {
	nextProgress: "../domain/Task",
	REMINDER_KINDS: "../domain/Task",
	sameSlot: "../domain/Task",
	sameRule: "../domain/Repeat",
	repeatParts: "../domain/Repeat",
	editRepeat: "../domain/RepeatDraft",
	repeatDraft: "../domain/RepeatDraft",
	DayBoundary: "../domain/DayBoundary",
	MINUTES_PER_DAY: "../domain/LocalDate",
	samePlacement: "../domain/operations",
	keyId: "./taskKeys",
	sameLine: "./taskKeys",
	samePlace: "./taskKeys",
	sameTaskTree: "./taskKeys",
	fitLevel: "./nesting",
	gapOfPlace: "./nesting",
	levelRange: "./nesting",
	placeOfGap: "./nesting",
	shiftLevel: "./nesting",
	gapAt: "./nesting",
	groupPlaceOf: "./nesting",
	placeOfDrop: "./nesting",
	sameGap: "./nesting",
	QuickEntrySession: "./QuickEntrySession",
	listView: "./sections",
	sectionChoice: "./sections",
	cardDue: "./cardDue",
	DESCRIPTION_TEMPLATE: "../domain/description",
	textParts: "../domain/TaskText",
	LINE_BREAK: "../domain/TaskTitle",
	oneLine: "../domain/TaskTitle",
	sameLevels: "../settings",
	labelTitle: "../domain/Label",
	sameLabels: "../domain/Label",
	isPresetColor: "../domain/Priority",
	PRIORITY_COLORS: "../domain/Priority",
	acceptsDrop: "./drops",
	placesInGap: "./drops",
};

/** Every runtime value contracts.ts re-exports, as `name ← module`: `export { … } from`, or a value imported and exported again. */
function contractRuntimeReexports(text: string): string[] {
	const code = withoutComments(text);
	const imported = new Map<string, string>();
	for (const m of code.matchAll(/^\s*import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
		if (m[1]) continue;
		for (const name of names(m[2])) imported.set(name, m[3]);
	}
	const found: string[] = [];
	for (const m of code.matchAll(/\bexport\s*\*[^;]*?from\s*["']([^"']+)["']/g)) found.push(`* ← ${m[1]}`);
	for (const m of code.matchAll(/\bexport\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g)) {
		if (m[1]) continue;
		for (const name of names(m[2])) {
			const from = m[3] ?? imported.get(name);
			if (from) found.push(`${name} ← ${from}`);
		}
	}
	return found;
}

/** The value names in `{ a, type B, c as d }`: the names they are exported as, types left out. */
function names(list: string): string[] {
	return list
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part !== "" && !part.startsWith("type "))
		.map((part) => part.split(/\s+as\s+/).pop()!.trim());
}

describe("contracts.ts", () => {
	it("re-exports types, and only the runtime values listed on purpose", () => {
		const listed = Object.entries(CONTRACT_RUNTIME).map(([name, from]) => `${name} ← ${from}`);
		expect(contractRuntimeReexports(readFileSync(join(ROOT, "src/application/contracts.ts"), "utf8")).sort()).toEqual(listed.sort());
	});

	it("reads every form of re-export it guards", () => {
		const sample = 'import { a } from "../domain/A";\nimport type { T } from "../domain/T";\nexport { a, type T };\nexport type { U } from "../domain/U";\nexport { b as c, type V } from "../domain/B";\nexport * from "../domain/D";';
		expect(contractRuntimeReexports(sample).sort()).toEqual(["* ← ../domain/D", "a ← ../domain/A", "c ← ../domain/B"]);
	});
});
