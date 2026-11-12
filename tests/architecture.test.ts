import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { doorMethods } from "../core/application/PhoneCalls";

const ROOT = resolve(__dirname, "..");

type Layer = "domain" | "application" | "infrastructure" | "ui" | "phone" | "settings" | "root";

/** Obsidian's own packages: the app provides them at run time (`external` in esbuild.config.mjs). */
const OBSIDIAN_PACKAGES = ["obsidian", "@codemirror/state", "@codemirror/view"];

function layerOf(file: string): Layer | null {
	if (["obsidian/main.ts", "obsidian/demo.ts", "obsidian/compose.ts", "obsidian/settingsFile.ts"].includes(file)) return "root";
	if (file === "core/settings.ts") return "settings";
	const m = /^(?:core|obsidian)\/(domain|application|infrastructure|ui|phone)\//.exec(file);
	return m ? (m[1] as Layer) : null;
}

/** The folder each layer lives in: the core (`core/`) or the Obsidian frontend (`obsidian/`). */
const HOME: Readonly<Record<string, string>> = { domain: "core", application: "core", phone: "core", ui: "obsidian", infrastructure: "obsidian" };

const under = (target: string, dir: string): boolean => target.startsWith(`${HOME[dir]}/${dir}/`);

/** What the iOS app's entry may use besides the contract: the door, which reaches the same rules the services write with. */
const PHONE_DOOR = "core/application/PhoneDoor.ts";

/** What a layer may import: a path in the repository, or a package's name. */
const MAY_IMPORT: Readonly<Record<Layer, (target: string) => boolean>> = {
	domain: (t) => under(t, "domain"),
	application: (t) => under(t, "domain") || under(t, "application") || t === "core/settings.ts",
	infrastructure: (t) => !under(t, "ui") && !under(t, "phone") && layerOf(t) !== "root",
	ui: (t) => under(t, "ui") || t === "core/application/contracts.ts" || OBSIDIAN_PACKAGES.includes(t),
	phone: (t) => under(t, "phone") || t === "core/application/contracts.ts" || t === PHONE_DOOR,
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

/** The sources: the core but its build (`core/build.mjs`, `core/task-calendar-phone.js`), and the Obsidian frontend. */
const SOURCE_DIRS = ["core/domain", "core/application", "core/phone", "obsidian"];
const FILES = [...SOURCE_DIRS.flatMap(files), "core/settings.ts"].filter(isSource);

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
		expect(importsOf("core/application/contracts.ts")).toContain("core/domain/Repeat.ts");
		expect(importsOf("obsidian/main.ts")).toEqual(expect.arrayContaining(["obsidian", "child_process", "obsidian/ui/SettingsTab.ts"]));
		expect(importsOf("obsidian/infrastructure/WorkCalendarExportScript.ts")).toContain("scriptable/work-calendar-export.js");
	});

	it("crosses no layer", () => {
		expect(violations()).toEqual([]);
	});
});

describe("the guard itself", () => {
	it("scans every file of the sources: a source of a known layer, or a declaration", () => {
		expect([...SOURCE_DIRS.flatMap(files), "core/settings.ts"].filter((file) => !isSource(file) && !DECLARATION.test(file))).toEqual([]);
	});

	it("keeps the doors narrow", () => {
		expect(MAY_IMPORT.phone("core/application/TaskServiceImpl.ts")).toBe(false);
		expect(MAY_IMPORT.phone("core/settings.ts")).toBe(false);
		expect(MAY_IMPORT.phone("core/application/contracts.ts")).toBe(true);
		expect(MAY_IMPORT.phone("core/application/PhoneDoor.ts")).toBe(true);
		expect(MAY_IMPORT.phone("core/application/TaskRules.ts")).toBe(false);
		expect(MAY_IMPORT.phone("core/application/composeCore.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("core/phone/main.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("obsidian/compose.ts")).toBe(false);
		expect(MAY_IMPORT.infrastructure("obsidian/ui/TaskCard.ts")).toBe(false);
		expect(target("obsidian/ui/x.ts", "./TaskCard")).toBe("obsidian/ui/TaskCard.ts");
	});
});

/**
 * Host globals `domain` and `application` still use, each with the branch that removes it. Delete the line when that
 * branch lands: the test fails while a listed exception is no longer needed.
 */
const TEMPORARY_HOST_GLOBALS: readonly { readonly file: string; readonly name: string; readonly until: string }[] = [];

/** What `tsc -p core/tsconfig.json` reports: domain, application and settings without DOM and Node, one line per error. */
function coreErrors(): string[] {
	try {
		execFileSync(join(ROOT, "node_modules/.bin/tsc"), ["-p", "core/tsconfig.json", "--pretty", "false"], { cwd: ROOT, encoding: "utf8" });
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
	it("read the device's own clock and nothing of its locale: no Intl, localeCompare or toLocale… (Electron and JavaScriptCore differ there)", () => {
		const core = [...files("core/domain"), ...files("core/application"), "core/settings.ts"].filter(isSource);
		const LOCALE = /\bIntl\b|\.localeCompare\s*\(|\.toLocale\w*\s*\(/;
		expect(core.filter((file) => LOCALE.test(withoutComments(readFileSync(join(ROOT, file), "utf8"))))).toEqual([]);
	});
	it("read no date from text the engine's own way: no Date.parse, no Date's toString or toDateString, new Date of one argument only of epoch ms (a text goes through isoMoment)", () => {
		const core = [...files("core/domain"), ...files("core/application"), "core/settings.ts"].filter(isSource);
		const ENGINE = /\bDate\.parse\s*\(|\.to(?:Date|Time|UTC|GMT)?String\s*\(\s*\)/;
		const found = core.flatMap((file) => {
			const text = withoutComments(readFileSync(join(ROOT, file), "utf8"));
			const engine = ENGINE.test(text) ? [`${file}: Date.parse or toString`] : [];
			return [...engine, ...oneArgumentDates(text).filter((arg) => !EPOCH_MS.test(arg)).map((arg) => `${file}: new Date(${arg})`)];
		});
		expect(found).toEqual([]);
	});
	it("tells a date read from text from one of epoch ms", () => {
		const args = oneArgumentDates("new Date(text); new Date(e.startMs); new Date(a, b); new Date(now.getTime() + f(1, 2)); new Date(); new Date(Number.NaN); new Date(Date.UTC(1, 2))");
		expect(args).toEqual(["text", "e.startMs", "now.getTime() + f(1, 2)", "Number.NaN", "Date.UTC(1, 2)"]);
		expect(args.filter((a) => !EPOCH_MS.test(a))).toEqual(["text"]);
	});
});

/** A single argument of `new Date(...)` that reads as epoch milliseconds: a …Ms or …ms value, a getTime(), Date.UTC, NaN. */
const EPOCH_MS = /(?:Ms|ms)\b|\.getTime\(\)|\bDate\.UTC\(|\bNumber\.NaN\b/;

/** The argument of each `new Date(...)` of exactly one argument in `text`. */
function oneArgumentDates(text: string): string[] {
	const found: string[] = [];
	for (const m of text.matchAll(/\bnew Date\(/g)) {
		let depth = 1;
		let commas = 0;
		let i = m.index! + m[0].length;
		const start = i;
		for (; i < text.length && depth > 0; i++) {
			const ch = text[i];
			if (ch === "(" || ch === "[" || ch === "{") depth++;
			else if (ch === ")" || ch === "]" || ch === "}") depth--;
			else if (ch === "," && depth === 1) commas++;
		}
		const arg = text.slice(start, i - 1).trim();
		if (arg !== "" && commas === 0) found.push(arg);
	}
	return found;
}

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
	projectNodeOf: "./projectsScreen",
	projectsGap: "./projectsScreen",
	projectsTakes: "./projectsDrop",
	projectsPlusTakes: "./projectsDrop",
	projectsLevels: "./projectsScreen",
	projectsDrop: "./projectsScreen",
	PROJECTS_HOVER_MS: "./projectsScreen",
	PROJECTS_INDENT: "./projectsScreen",
	MOST_CARD_COLORS: "./marks",
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
	NO_DAY_EVENTS: "./calendarDay",
	QuickEntrySession: "./QuickEntrySession",
	SectionNameEntry: "./SectionNameEntry",
	RepeatPage: "./RepeatPage",
	DescriptionDraft: "./DescriptionDraft",
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
	usableColor: "../domain/Priority",
	PRIORITY_COLORS: "../domain/Priority",
	acceptsDrop: "./drops",
	placesInGap: "./drops",
	bgAlphaFor: "./paints",
	contrast: "./paints",
	EVENT_BG_ALPHA: "./paints",
	eventColors: "./paints",
	eventHex: "./paints",
	inkOf: "./paints",
	shadesOf: "./paints",
	pastEventPaint: "./paints",
	DEFAULT_ZOOM_LEVELS: "./timelineZoom",
	DEFAULT_ZOOM_HOUR: "./timelineZoom",
	parseZoomLevels: "./timelineZoom",
	formatZoomLevels: "./timelineZoom",
	levelsFor: "./timelineZoom",
	gridAt: "./timelineZoom",
	gridMarks: "./timelineZoom",
	zoomAfterPinch: "./timelineZoom",
	zoomShown: "./timelineZoom",
	labelHidesNearNow: "./timelineZoom",
	levelAt: "./listDrop",
	carriedMiddle: "./listDrop",
	placeAt: "./listDrop",
	branchOf: "./listDrop",
	gapBranch: "./listDrop",
	dayTitle: "./dayLabels",
	dueLabel: "./dayLabels",
	eventLevels: "./eventLevels",
	stackTasks: "./timelineStack",
	overlayLeft: "./timelineStack",
	eventLeft: "./timelineStack",
	stackCorner: "./timelineStack",
	timeParts: "./timelineStack",
	durationParts: "./timelineStack",
	SHOWN_LISTS: "./screenPlaces",
	projectsEntryLook: "./projectsEntry",
	swipeLanding: "./screenPlaces",
	SWIPE_FLICK_SPEED: "./screenPlaces",
	FUNNEL_PLACES: "./screenPlaces",
	funnelPlaceShowing: "./screenPlaces",
	funnelPlaceOf: "./screenPlaces",
	endsSelection: "./projectsCarry",
	stackedRows: "./stackedRows",
	stackedLists: "./stackedRows",
	sameNewPlace: "./newTaskPlaces",
	viewLayout: "./viewLayout",
	layoutWidths: "./viewLayout",
	layoutShareAt: "./viewLayout",
	viewContext: "./viewModes",
	stepFunnel: "./screenPlaces",
	ROW_LISTS: "./viewModes",
	VIEW_WORDS: "./viewModes",
	viewEntryLists: "./viewModes",
	wholeWidth: "./wholeCard",
	grownStart: "./wholeCard",
	CARD_HEIGHTS: "../settings",
	CARD_GAPS: "../settings",
	DEFAULT_CARD_SIZE: "../settings",
	LIST_WIDTHS: "./listWidth",
	listWidths: "./listWidth",
	listShareOf: "./listWidth",
	dividerAt: "./listWidth",
	allColumnsWidths: "./listWidth",
	allColumnsShare: "./listWidth",
	allColumnsDividerAt: "./listWidth",
	allColumnsWidthAt: "./listWidth",
	DIVIDER_SNAP: "./listWidth",
	repeatValue: "./repeatWords",
	onTheDay: "./repeatWords",
	REPEAT_WORDS: "./repeatWords",
	dayMonth: "./dayLabels",
	canPick: "./menus",
};

/**
 * Where the phone's door offers each runtime value: a function by its name among `rules.*`; a constant in `rules.constants`;
 * the line break as `rules.oneLine`; a class by the calls that stand for it. A new runtime value is listed here, or the
 * Swift frontend could not reach it.
 */
const DOOR_OF_RUNTIME: Readonly<Record<string, string>> = {
	...Object.fromEntries(Object.keys(CONTRACT_RUNTIME).map((name) => [name, `rules.${name}`])),
	REMINDER_KINDS: "rules.constants",
	NO_DAY_EVENTS: "rules.constants",
	MINUTES_PER_DAY: "rules.constants",
	DESCRIPTION_TEMPLATE: "rules.constants",
	PRIORITY_COLORS: "rules.constants",
	EVENT_BG_ALPHA: "rules.constants",
	DEFAULT_ZOOM_LEVELS: "rules.constants",
	DEFAULT_ZOOM_HOUR: "rules.constants",
	SHOWN_LISTS: "rules.constants",
	SWIPE_FLICK_SPEED: "rules.constants",
	FUNNEL_PLACES: "rules.constants",
	ROW_LISTS: "rules.constants",
	VIEW_WORDS: "rules.constants",
	stepFunnel: "days.stepFunnel",
	PROJECTS_HOVER_MS: "rules.constants",
	PROJECTS_INDENT: "rules.constants",
	CARD_HEIGHTS: "rules.constants",
	CARD_GAPS: "rules.constants",
	DEFAULT_CARD_SIZE: "rules.constants",
	LIST_WIDTHS: "rules.constants",
	REPEAT_WORDS: "rules.constants",
	DIVIDER_SNAP: "rules.constants",
	MOST_CARD_COLORS: "rules.constants",
	LINE_BREAK: "rules.oneLine",
	DayBoundary: "boundary.dayOf",
	QuickEntrySession: "entry.enter",
	SectionNameEntry: "sectionName.end",
	RepeatPage: "repeatPage.end",
	DescriptionDraft: "description.read",
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
		expect(contractRuntimeReexports(readFileSync(join(ROOT, "core/application/contracts.ts"), "utf8")).sort()).toEqual(listed.sort());
	});

	it("hands the UI nothing the phone's door does not offer", () => {
		const offered = new Set(doorMethods());
		expect(Object.entries(DOOR_OF_RUNTIME).filter(([, method]) => !offered.has(method))).toEqual([]);
	});

	it("reads every form of re-export it guards", () => {
		const sample = 'import { a } from "../domain/A";\nimport type { T } from "../domain/T";\nexport { a, type T };\nexport type { U } from "../domain/U";\nexport { b as c, type V } from "../domain/B";\nexport * from "../domain/D";';
		expect(contractRuntimeReexports(sample).sort()).toEqual(["* ← ../domain/D", "a ← ../domain/A", "c ← ../domain/B"]);
	});
});
