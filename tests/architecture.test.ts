import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { doorMethods } from "../core/application/PhoneCalls";

const ROOT = resolve(__dirname, "..");

type Layer = "domain" | "application" | "infrastructure" | "ui" | "phone" | "settings" | "root" | "stand" | "agentReads" | "agentMain";

/** Obsidian's own packages: the app provides them at run time (`external` in esbuild.config.mjs). */
const OBSIDIAN_PACKAGES = ["obsidian", "@codemirror/state", "@codemirror/view"];

/**
 * The view's libraries, the stack the UI is built on (docs/superpowers/specs/2026-11-16-ui-standard-stack.md, «The
 * stack»): drawing and gestures only, no layer of ours. Named one by one, by the exact entry the UI imports.
 */
const UI_PACKAGES = ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "zustand", "zustand/vanilla", "zustand/react/shallow", "motion/react", "@use-gesture/react", "@tanstack/react-virtual", "@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "@floating-ui/react"];

/** The agents' program (`agent/`): its composition over Node's files, as `obsidian/compose.ts` is the plugin's. */
const AGENT_ROOT = ["agent/compose.ts", "agent/nodePorts.ts"];

function layerOf(file: string): Layer | null {
	if (["obsidian/main.ts", "obsidian/demo.ts", "obsidian/compose.ts", "obsidian/settingsFile.ts", ...AGENT_ROOT].includes(file)) return "root";
	if (file === "agent/main.ts") return "agentMain";
	if (file.startsWith("core/application/agent/")) return "agentReads";
	if (file === "core/settings.ts") return "settings";
	if (file.startsWith("obsidian/stand/")) return "stand";
	const m = /^(?:core|obsidian)\/(domain|application|infrastructure|ui|phone)\//.exec(file);
	return m ? (m[1] as Layer) : null;
}

/** The folder each layer lives in: the core (`core/`) or the Obsidian frontend (`obsidian/`). */
const HOME: Readonly<Record<string, string>> = { domain: "core", application: "core", phone: "core", ui: "obsidian", infrastructure: "obsidian", stand: "obsidian" };

const under = (target: string, dir: string): boolean => target.startsWith(`${HOME[dir]}/${dir}/`);

/** What the iOS app's entry may use besides the contract: the door, which reaches the same rules the services write with. */
const PHONE_DOOR = "core/application/PhoneDoor.ts";

/** The trackpad's native module (Decision 126): it reads nothing of the core, so the stand takes it too. */
const STAND_TRACKPAD = "obsidian/infrastructure/trackpad/";

/** What a layer may import: a path in the repository, or a package's name. */
const MAY_IMPORT: Readonly<Record<Layer, (target: string) => boolean>> = {
	domain: (t) => under(t, "domain"),
	application: (t) => under(t, "domain") || under(t, "application") || t === "core/settings.ts",
	infrastructure: (t) => !under(t, "ui") && !under(t, "phone") && layerOf(t) !== "root",
	ui: (t) => under(t, "ui") || t === "core/application/contracts.ts" || OBSIDIAN_PACKAGES.includes(t) || UI_PACKAGES.includes(t),
	phone: (t) => under(t, "phone") || t === "core/application/contracts.ts" || t === PHONE_DOOR,
	/** The program's answers map the screens' reads into its words: the contract only, and their own wire. */
	agentReads: (t) => t === "core/application/contracts.ts" || t.startsWith("core/application/agent/"),
	/** argv in, the answer out: the contract only, as a frontend talks to the core. */
	agentMain: (t) => t === "core/application/contracts.ts",
	settings: (t) => under(t, "domain"),
	root: (t) => !under(t, "stand"),
	/**
	 * The stand (`obsidian/stand`, docs/superpowers/specs/2026-11-18-ui-engine.md): the engine over `MockPort`, never the core;
	 * nothing imports it. Of the infrastructure only the trackpad's native module, as the plugin gets it (Decision 126).
	 */
	stand: (t) => under(t, "stand") || under(t, "ui") || t.startsWith(STAND_TRACKPAD) || OBSIDIAN_PACKAGES.includes(t) || UI_PACKAGES.includes(t),
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
/** The program's sources: everything in `agent/` but its build script and its build. */
const AGENT_BUILD = ["agent/build.mjs", "agent/obsidian-task-calendar.mjs"];
const AGENT_FILES = files("agent").filter((file) => !AGENT_BUILD.includes(file));
const FILES = [...SOURCE_DIRS.flatMap(files), ...AGENT_FILES, "core/settings.ts"].filter(isSource);

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
		expect([...SOURCE_DIRS.flatMap(files), ...AGENT_FILES, "core/settings.ts"].filter((file) => !isSource(file) && !DECLARATION.test(file))).toEqual([]);
		expect(AGENT_FILES.sort()).toEqual(["agent/compose.ts", "agent/main.ts", "agent/nodePorts.ts"]);
	});

	it("keeps the agents' program a frontend: its answers and its argv read the contract alone", () => {
		expect(MAY_IMPORT.agentMain("core/application/composeCore.ts")).toBe(false);
		expect(MAY_IMPORT.agentMain("core/application/agent/AgentReads.ts")).toBe(false);
		expect(MAY_IMPORT.agentReads("core/application/TaskReads.ts")).toBe(false);
		expect(MAY_IMPORT.agentReads("core/domain/Days.ts")).toBe(false);
		expect(MAY_IMPORT.agentReads("core/application/agent/agentWire.ts")).toBe(true);
		expect(MAY_IMPORT.application("core/application/agent/AgentReads.ts")).toBe(true);
		expect(layerOf("core/application/agent/AgentReads.ts")).toBe("agentReads");
		expect(layerOf("agent/main.ts")).toBe("agentMain");
	});

	it("keeps the doors narrow", () => {
		expect(MAY_IMPORT.phone("core/application/TaskServiceImpl.ts")).toBe(false);
		expect(MAY_IMPORT.ui("react")).toBe(true);
		expect(MAY_IMPORT.stand("obsidian/ui/engine/mount.tsx")).toBe(true);
		expect(MAY_IMPORT.stand("core/application/contracts.ts")).toBe(false);
		expect(MAY_IMPORT.stand("tests/fakes/InMemoryTaskFileStore.ts")).toBe(false);
		expect(MAY_IMPORT.stand("core/application/TaskServiceImpl.ts")).toBe(false);
		expect(MAY_IMPORT.stand("obsidian/infrastructure/VaultTaskFileStore.ts")).toBe(false);
		expect(MAY_IMPORT.stand("obsidian/infrastructure/trackpad/MacTrackpadFingers.ts")).toBe(true);
		expect(MAY_IMPORT.root("obsidian/stand/main.ts")).toBe(false);
		expect(MAY_IMPORT.ui("obsidian/stand/main.ts")).toBe(false);
		expect(MAY_IMPORT.ui("@anthropic-ai/claude-agent-sdk")).toBe(false);
		expect(MAY_IMPORT.ui("core/application/TaskServiceImpl.ts")).toBe(false);
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
	usableLabelColor: "../domain/Label",
	CLEAR_COLOR: "../domain/Label",
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
	projectsPlusPlace: "./projectsDrop",
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
	repeatSentence: "./repeatWords",
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
	CLEAR_COLOR: "rules.constants",
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

/**
 * The engine's owners (docs/superpowers/specs/2026-11-18-ui-engine.md, «The owners» and «How the owners are kept one»):
 * every concern of the screen has one owner, a library used the documented way and wrapped once. The table is the spec's,
 * as data: a library is imported only by its owner, there is one `DndContext`, no component touches the page by hand, the
 * engine imports nothing from the core, the mounting place is read in the layout only, and the keys are the host's.
 */
const ENGINE = "obsidian/ui/engine/";
const STAND = "obsidian/stand/";

interface Owner {
	readonly concern: string;
	/** The imports only the owner may make: a package by its name, or a repository path. */
	readonly imports: (target: string) => boolean;
	readonly owners: readonly string[];
}

/** The one ribbon's landing: the only Motion spring started by hand, from where the fingers let the strip go (Decisions 64, 126). */
const RIBBON_LANDING = `${ENGINE}gestures/FollowRibbon.ts`;
/** The ribbon's files that draw with Motion: its landing, its strip and the calendar's quick day change (Decision 127). */
const RIBBON_MOTION = [RIBBON_LANDING, `${ENGINE}gestures/RibbonTrack.tsx`, `${ENGINE}gestures/dayChange.ts`];

const OWNERS: readonly Owner[] = [
	{ concern: "Screen state: Zustand", imports: (t) => t === "zustand" || t.startsWith("zustand/"), owners: [`${ENGINE}store/`] },
	{ concern: "Drag and drop: dnd-kit", imports: (t) => t.startsWith("@dnd-kit/"), owners: [`${ENGINE}drag/`] },
	{ concern: "Gestures that are not drag: @use-gesture", imports: (t) => t.startsWith("@use-gesture/"), owners: [`${ENGINE}gestures/`] },
	{ concern: "Layers and focus: Floating UI", imports: (t) => t.startsWith("@floating-ui/"), owners: [`${ENGINE}layers/`] },
	/** Motion: the rows that move and the regions that slide; of the gestures, only the ribbon's own files: its landing spring, its strip and the calendar's day change (the table's gestures row). */
	{ concern: "Rows that move, regions that slide: Motion", imports: (t) => t === "motion" || t.startsWith("motion/") || t === "framer-motion", owners: [`${ENGINE}view/MovingRow.tsx`, `${ENGINE}view/Slide.tsx`, ...RIBBON_MOTION] },
	{ concern: "Long lists: TanStack Virtual", imports: (t) => t.startsWith("@tanstack/"), owners: [`${ENGINE}view/TaskList.tsx`] },
	{ concern: "Text fields: Obsidian's editor", imports: (t) => t === "obsidian/ui/markdown/EmbeddedEditor.ts", owners: [`${ENGINE}view/ObsidianEditor.tsx`] },
	/** The overlay of a carried card goes in a portal (stage 0, «Integration findings» 1); the root is made by the mount. */
	{ concern: "Portals and roots: react-dom", imports: (t) => t === "react-dom" || t === "react-dom/client", owners: [`${ENGINE}drag/`, `${ENGINE}mount.tsx`] },
];

/**
 * The task actions spec (2026-11-20, «What the engine and MockPort change»): the port takes the task actions' ids and groups
 * from the contract, so a new action does not compile in the engine until it gets its look. Types only, in the port only.
 */
const CONTRACT_TYPES = { file: `${ENGINE}port.ts`, target: "core/application/contracts.ts" } as const;

/** What the engine may import besides itself, React's stack and Obsidian's packages: the design's icons and measures (`DESIGN`, which agrees with the CSS) and Obsidian's editor. */
const ENGINE_MAY_ALSO = ["obsidian/ui/kit/icons.ts", "obsidian/ui/design.ts", "obsidian/ui/markdown/EmbeddedEditor.ts"];

/**
 * Touching the page by hand, each with where the standard puts it instead: a library measures and listens, Motion animates,
 * the store's tick is the one timer, TanStack Virtual and the browser reveal.
 */
const BY_HAND: readonly { readonly name: string; readonly pattern: RegExp; readonly allowed: readonly string[] }[] = [
	{ name: "a listener added by hand", pattern: /\baddEventListener\s*\(/, allowed: [] },
	{ name: "a size read from the page", pattern: /\bgetBoundingClientRect\s*\(|\bgetClientRects\s*\(|\bgetComputedStyle\s*\(/, allowed: [] },
	{ name: "an animation frame", pattern: /\brequestAnimationFrame\s*\(/, allowed: [] },
	{ name: "an animation by hand", pattern: /(?<![.\w])animate\s*\(|\.animate\s*\(/, allowed: [RIBBON_LANDING] },
	{ name: "a timer", pattern: /\bset(?:Timeout|Interval)\s*\(/, allowed: [`${ENGINE}store/`] },
	{ name: "an observer", pattern: /\b(?:Resize|Mutation|Intersection)Observer\b/, allowed: [] },
	{ name: "a scroll set by hand", pattern: /\.scrollTop\s*=(?!=)|\.scrollLeft\s*=(?!=)|\bscrollTo\s*\(|\bscrollBy\s*\(/, allowed: [] },
	{ name: "a reveal that is not TanStack Virtual's or the browser's", pattern: /\bscrollIntoView\s*\(/, allowed: [`${ENGINE}view/Timeline.tsx`] },
	{ name: "a key handled outside the host's key table", pattern: /\bonKey(?:Down|Up|Press)\b|["']key(?:down|up|press)["']|\bnew Scope\b|\baddCommand\s*\(/, allowed: [] },
];

/**
 * The only exceptions to `BY_HAND`, each approved by Max in chat with the lead on 2026-11-19 (F97, F98), each one call in
 * one file: the calendar's zoom reads the calendar's top on the page once a pinch (to know the minute under the pointer)
 * and sets the calendar's scroll offset in one place (to keep that minute under the pointer, as every zoom does); and it
 * observes the calendar's own size with one `ResizeObserver` (to refit the whole day when the calendar's height changes).
 * No library the engine owns does either. Anything else of the same rule in that file, or a second such call, still fails.
 */
const BY_HAND_EXCEPTIONS: readonly { readonly file: string; readonly rule: string; readonly call: RegExp; readonly most: number }[] = [
	{ file: `${ENGINE}gestures/Zoom.ts`, rule: "a size read from the page", call: /\.getBoundingClientRect\s*\(\s*\)/g, most: 1 },
	{ file: `${ENGINE}gestures/Zoom.ts`, rule: "a scroll set by hand", call: /\.scrollTop\s*=(?!=)/g, most: 1 },
	{ file: `${ENGINE}gestures/Zoom.ts`, rule: "an observer", call: /\.ResizeObserver\s*\(/g, most: 1 },
];

/** The code a rule reads in `file`: its approved exception's one call taken out, unless there are more of them than approved. */
function withoutException(file: string, rule: string, code: string): string {
	return BY_HAND_EXCEPTIONS.filter((e) => e.file === file && e.rule === rule).reduce((text, e) => ((text.match(e.call) ?? []).length <= e.most ? text.replace(e.call, "") : text), code);
}

/** The mounting place (leaf, note) is read in the layout only; the screen hands it there. */
const PLACE_READERS = [`${ENGINE}layout/`, `${ENGINE}view/TaskScreen.tsx`, `${ENGINE}mount.tsx`];

const ownedBy = (file: string, owners: readonly string[]): boolean => owners.some((o) => (o.endsWith("/") ? file.startsWith(o) : file === o));
const engineFiles = (): string[] => FILES.filter((f) => f.startsWith(ENGINE));
const engineAndStand = (): string[] => FILES.filter((f) => f.startsWith(ENGINE) || f.startsWith(STAND));

function ownerViolations(files: readonly string[], importsOfFile: (file: string) => readonly string[]): string[] {
	return files.flatMap((file) =>
		importsOfFile(file).flatMap((t) => OWNERS.filter((o) => o.imports(t) && !ownedBy(file, o.owners)).map((o) => `${file} → ${t} (${o.concern}: only ${o.owners.join(", ")})`)),
	);
}

function byHandIn(file: string, text: string): string[] {
	const code = withoutComments(text);
	return BY_HAND.filter((rule) => rule.pattern.test(withoutException(file, rule.name, code)) && !ownedBy(file, rule.allowed)).map((rule) => `${file}: ${rule.name}`);
}

/** The word as a name in the code; a CSS class of the design that ends in it (`tc-bar-place`, `is-place`) names a button, not the mounting place. */
const readsPlace = (text: string): boolean => /(?<![\w-])place\b(?!-)/.test(withoutComments(text));

describe("the engine's owners", () => {
	const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

	it("imports each library only in its owner", () => {
		expect(ownerViolations(engineAndStand(), importsOf)).toEqual([]);
	});

	it("has one DndContext", () => {
		const contexts = engineFiles().flatMap((file) => [...withoutComments(source(file)).matchAll(/<DndContext\b/g)].map(() => file));
		expect(contexts).toHaveLength(1);
	});

	it("touches the page by hand nowhere", () => {
		expect(engineFiles().flatMap((file) => byHandIn(file, source(file)))).toEqual([]);
	});

	it("imports nothing from the core, and of the rest of the plugin only the icons and Obsidian's editor", () => {
		const outside = engineFiles().flatMap((file) => importsOf(file).filter((t) => (t.startsWith("core/") || t.startsWith("obsidian/") || t.startsWith("tests/")) && !t.startsWith(ENGINE) && !ENGINE_MAY_ALSO.includes(t) && !(file === CONTRACT_TYPES.file && t === CONTRACT_TYPES.target)).map((t) => `${file} → ${t}`));
		expect(outside).toEqual([]);
	});

	it("takes the contract's types in the port alone, as types: the task actions' ids and groups, no code of the core", () => {
		const takers = engineFiles().filter((file) => importsOf(file).includes(CONTRACT_TYPES.target));
		expect(takers.filter((file) => file !== CONTRACT_TYPES.file)).toEqual([]);
		const forms = [...withoutComments(source(CONTRACT_TYPES.file)).matchAll(/\b(import|export)\s+(type\s+)?\{[^}]*\}\s+from\s+["']([^"']+)["']/g)].filter((m) => m[3].endsWith("core/application/contracts"));
		expect(forms.length).toBeGreaterThan(0);
		expect(forms.filter((m) => !m[2]).map((m) => m[0])).toEqual([]);
	});

	it("reads the mounting place in the layout only", () => {
		expect(engineFiles().filter((file) => !ownedBy(file, PLACE_READERS) && readsPlace(source(file)))).toEqual([]);
	});

	it("leaves the key table to the host: the stand registers it once", () => {
		const registering = engineAndStand().filter((file) => /\bKEYS\b/.test(withoutComments(source(file))) && !file.startsWith(`${ENGINE}keys.ts`));
		expect(registering.every((file) => file.startsWith(STAND))).toBe(true);
		expect(registering.length).toBeLessThanOrEqual(1);
	});
});

describe("the owners' guard itself", () => {
	it("finds a library imported outside its owner", () => {
		const imports: Record<string, string[]> = { [`${ENGINE}view/Card.tsx`]: ["@dnd-kit/core", "motion/react", "react"], [`${ENGINE}drag/Sortable.tsx`]: ["@dnd-kit/sortable"], [`${ENGINE}view/MovingRow.tsx`]: ["motion/react"], [`${ENGINE}gestures/Zoom.ts`]: ["motion/react"] };
		expect(ownerViolations(Object.keys(imports), (f) => imports[f])).toEqual([
			`${ENGINE}view/Card.tsx → @dnd-kit/core (Drag and drop: dnd-kit: only ${ENGINE}drag/)`,
			`${ENGINE}view/Card.tsx → motion/react (Rows that move, regions that slide: Motion: only ${ENGINE}view/MovingRow.tsx, ${ENGINE}view/Slide.tsx, ${RIBBON_MOTION.join(", ")})`,
			`${ENGINE}gestures/Zoom.ts → motion/react (Rows that move, regions that slide: Motion: only ${ENGINE}view/MovingRow.tsx, ${ENGINE}view/Slide.tsx, ${RIBBON_MOTION.join(", ")})`,
		]);
	});

	it("finds the page touched by hand, and leaves each standard's own place alone", () => {
		expect(byHandIn(`${ENGINE}view/Card.tsx`, "el.addEventListener('x', f); const r = el.getBoundingClientRect(); requestAnimationFrame(f); animate(x, 1); setTimeout(f, 1); new ResizeObserver(f); el.scrollTop = 4; <div onKeyDown={f} />")).toEqual(
			["a listener added by hand", "a size read from the page", "an animation frame", "an animation by hand", "a timer", "an observer", "a scroll set by hand", "a key handled outside the host's key table"].map((name) => `${ENGINE}view/Card.tsx: ${name}`),
		);
		expect(byHandIn(RIBBON_LANDING, "animate(x, 1, spring)")).toEqual([]);
		expect(byHandIn(`${ENGINE}gestures/Zoom.ts`, "animate(x, 1, spring)")).toEqual([`${ENGINE}gestures/Zoom.ts: an animation by hand`]);
		expect(byHandIn(`${ENGINE}store/screenStore.ts`, "setTimeout(tick, 60000)")).toEqual([]);
		expect(byHandIn(`${ENGINE}view/Card.tsx`, "// el.addEventListener('x', f)\nconst a = el.scrollTop === 3;")).toEqual([]);
	});

	it("lets the zoom have its one approved call of each kind and nothing more (Max, 2026-11-19)", () => {
		const zoom = `${ENGINE}gestures/Zoom.ts`;
		expect(byHandIn(zoom, "const top = room.getBoundingClientRect().top; room.scrollTop = 4; const o = new view.ResizeObserver(f);")).toEqual([]);
		expect(byHandIn(zoom, "a.getBoundingClientRect(); b.getBoundingClientRect(); room.scrollTop = 1; room.scrollTop = 2; new view.ResizeObserver(f); new view.ResizeObserver(g);")).toEqual(
			["a size read from the page", "an observer", "a scroll set by hand"].map((name) => `${zoom}: ${name}`),
		);
		expect(byHandIn(zoom, "getComputedStyle(room); room.scrollTo(0, 1); room.scrollLeft = 3; new MutationObserver(f); new ResizeObserver(f);")).toEqual(["a size read from the page", "an observer", "a scroll set by hand"].map((name) => `${zoom}: ${name}`));
		expect(byHandIn(`${ENGINE}view/Timeline.tsx`, "room.getBoundingClientRect(); room.scrollTop = 1; new view.ResizeObserver(f);")).toEqual(
			["a size read from the page", "an observer", "a scroll set by hand"].map((name) => `${ENGINE}view/Timeline.tsx: ${name}`),
		);
	});

	it("tells a word in a comment from the place read in code", () => {
		expect(readsPlace("/** the place it was mounted */ const x = 1;")).toBe(false);
		expect(readsPlace("const wide = place === 'leaf';")).toBe(true);
		expect(readsPlace("const at = { place };")).toBe(true);
		expect(readsPlace('<button className="tc-btn tc-bar-place" />; <div className="tc-menu-tiles is-place" />')).toBe(false);
	});
});
