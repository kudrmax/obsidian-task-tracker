import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * The rules of the new screens (`obsidian/ui/next`, spec §Guards): what each part may import and touch. Each rule reads
 * one file as text and answers its violations; `tests/uiRules.test.ts` runs them over the tree and over bad samples.
 */

export const ROOT = resolve(__dirname, "..");
export const NEXT = "obsidian/ui/next";

/** The pure parts: what they draw and decide is a function of the model. */
export const PURE_PARTS = ["model", "update", "recognizers", "view"] as const;
/** The drivers (§Architecture): each owns its DOM work. `overlay` is the overlay host. */
export const DRIVERS = ["motion", "measure", "scroll", "focus", "input", "keys", "chrome", "islands", "overlay"] as const;

export type Part = (typeof PURE_PARTS)[number] | "drivers" | "host";
export type Driver = (typeof DRIVERS)[number];

export interface Source {
	/** The path from the repository's root, with forward slashes. */
	readonly path: string;
	readonly text: string;
}

export interface Place {
	readonly part: Part | null;
	/** The driver a file under `drivers/` belongs to: its folder, or its file's name. */
	readonly driver: Driver | null;
}

export function placeOf(path: string): Place {
	const rest = path.startsWith(`${NEXT}/`) ? path.slice(NEXT.length + 1).split("/") : [];
	const head = rest[0] ?? "";
	if ((PURE_PARTS as readonly string[]).includes(head) && rest.length > 1) return { part: head as Part, driver: null };
	if (head === "host" && rest.length > 1) return { part: "host", driver: null };
	if (head === "drivers" && rest.length > 1) {
		const name = rest[1].replace(/\.[cm]?tsx?$/, "");
		return { part: "drivers", driver: (DRIVERS as readonly string[]).includes(name) ? (name as Driver) : null };
	}
	return { part: null, driver: null };
}

/** The text without comments. */
export function code(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** The code without what string literals hold: names in a string are not code. */
export function bare(text: string): string {
	return code(text).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

export interface Import {
	/** A repository path for a relative import, the package's name otherwise. */
	readonly target: string;
	/** The names it brings in as values (not `type`), `*` for a namespace. */
	readonly values: readonly string[];
	readonly typeOnly: boolean;
}

function resolveTarget(file: string, specifier: string): string {
	if (!specifier.startsWith(".")) return specifier;
	const path = relative(ROOT, resolve(ROOT, dirname(file), specifier)).split("\\").join("/");
	if (/\.\w+$/.test(path)) return path;
	const candidates = ["ts", "tsx"].flatMap((ext) => [`${path}.${ext}`, `${path}/index.${ext}`]);
	return candidates.find((c) => existsSync(join(ROOT, c))) ?? `${path}.ts`;
}

export function importsOf(file: Source): Import[] {
	const text = code(file.text);
	const found: Import[] = [];
	for (const m of text.matchAll(/\b(import|export)(\s+type)?\s*([^"'`;]*?)\s*\bfrom\s*["']([^"']+)["']/g)) {
		const typeOnly = m[2] !== undefined;
		const clause = m[3];
		const values: string[] = [];
		if (!typeOnly) {
			if (/\*/.test(clause)) values.push("*");
			const named = /\{([^}]*)\}/.exec(clause);
			if (named)
				for (const part of named[1].split(",")) {
					const name = part.trim();
					if (name === "" || name.startsWith("type ")) continue;
					values.push(name.split(/\s+as\s+/)[0].trim());
				}
			const head = clause.replace(/\{[^}]*\}/, "").replace(/\*\s+as\s+\w+/, "").replace(/,/g, " ").trim();
			if (m[1] === "import" && head !== "") values.push("default");
		}
		found.push({ target: resolveTarget(file.path, m[4]), values, typeOnly: typeOnly || (values.length === 0 && /\{/.test(clause)) });
	}
	for (const m of text.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) found.push({ target: resolveTarget(file.path, m[1]), values: ["*"], typeOnly: false });
	for (const m of text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push({ target: resolveTarget(file.path, m[1]), values: ["*"], typeOnly: false });
	return found;
}

const CONTRACTS = "core/application/contracts.ts";

/**
 * The core's pure rules a screen may call directly (P2): plain functions and constants of `contracts.ts`, needed per frame
 * and per pointer move. Everything else of the core is reached through the runtime. The test keeps this list equal to
 * what `contracts.ts` exports as values, less `NOT_PURE`, so a new export is a decision made here.
 */
export const PURE_RULES: readonly string[] = [
	"CARD_GAPS", "CARD_HEIGHTS", "DEFAULT_CARD_SIZE", "DEFAULT_ZOOM_HOUR", "DEFAULT_ZOOM_LEVELS", "DESCRIPTION_TEMPLATE", "DIVIDER_SNAP",
	"EVENT_BG_ALPHA", "FUNNEL_PLACES", "LINE_BREAK", "LIST_WIDTHS", "MINUTES_PER_DAY", "MOST_CARD_COLORS", "NO_DAY_EVENTS", "PRIORITY_COLORS",
	"PROJECTS_HOVER_MS", "PROJECTS_INDENT", "REMINDER_KINDS", "REPEAT_WORDS", "ROW_LISTS", "SHOWN_LISTS", "SWIPE_FLICK_SPEED", "VIEW_WORDS",
	"acceptsDrop", "allColumnsDividerAt", "allColumnsShare", "allColumnsWidthAt", "allColumnsWidths", "bgAlphaFor", "branchOf", "canPick",
	"cardDue", "carriedMiddle", "contrast", "dayMonth", "dayTitle", "dividerAt", "dueLabel", "durationParts", "editRepeat", "endsSelection",
	"eventColors", "eventHex", "eventLeft", "eventLevels", "fitLevel", "formatZoomLevels", "funnelPlaceOf", "funnelPlaceShowing", "gapAt",
	"gapBranch", "gapOfPlace", "gridAt", "gridMarks", "groupPlaceOf", "grownStart", "inkOf", "isPresetColor", "keyId", "labelHidesNearNow",
	"labelTitle", "layoutShareAt", "layoutWidths", "levelAt", "levelRange", "levelsFor", "listShareOf", "listView", "listWidths", "nextProgress",
	"onTheDay", "oneLine", "overlayLeft", "parseZoomLevels", "pastEventPaint", "placeAt", "placeOfDrop", "placeOfGap", "placesInGap",
	"projectNodeOf", "projectsDrop", "projectsEntryLook", "projectsGap", "projectsLevels", "projectsPlusPlace", "projectsPlusTakes",
	"projectsTakes", "repeatDraft", "repeatParts", "repeatValue", "sameGap", "sameLabels", "sameLevels", "sameLine", "sameNewPlace", "samePlace",
	"samePlacement", "sameRule", "sameSlot", "sameTaskTree", "sectionChoice", "shadesOf", "shiftLevel", "stackCorner", "stackTasks",
	"stackedLists", "stackedRows", "stepFunnel", "swipeLanding", "textParts", "timeParts", "usableColor", "viewContext", "viewEntryLists",
	"viewLayout", "wholeWidth", "zoomAfterPinch", "zoomShown",
];

/** What `contracts.ts` exports as values that is not a pure rule: the core's sessions and its errors, reached through the runtime. */
export const NOT_PURE: readonly string[] = ["DayBoundary", "DescriptionDraft", "QuickEntrySession", "RepeatPage", "SectionNameEntry", "StaleTaskError", "TasksFileMissingError"];

export interface Rule {
	readonly name: string;
	check(file: Source): string[];
}

const at = (file: Source, what: string) => `${file.path}: ${what}`;

/** Each match of `pattern` in the file's bare code, said as `what`. */
const matches = (file: Source, pattern: RegExp, what: (m: RegExpMatchArray) => string, text = bare(file.text)): string[] =>
	[...text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].map((m) => at(file, what(m)));

const isPure = (path: string): boolean => (PURE_PARTS as readonly string[]).includes(placeOf(path).part ?? "");
const inNext = (path: string): boolean => path.startsWith(`${NEXT}/`);

/** A name used as a value of the host: not a member (`x.document`), not a property key, not part of a longer name. */
const global = (names: readonly string[]) => new RegExp(`(?<![\\w$.])(${names.join("|")})(?![\\w$])(?!\\s*:(?!:))`, "g");

const DOM_GLOBALS = [
	"document", "window", "globalThis", "navigator", "activeDocument", "activeWindow", "localStorage", "sessionStorage", "getComputedStyle",
	"matchMedia", "ResizeObserver", "MutationObserver", "IntersectionObserver", "PerformanceObserver", "performance", "createDiv", "createEl",
	"createSpan", "createFragment", "fetch", "XMLHttpRequest", "WebSocket", "addEventListener", "removeEventListener",
];
const TIMERS = ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "queueMicrotask"];

/** Purity: model, update, recognizers and view touch no host, no Obsidian, no runtime and no driver; no clock or chance of their own. */
const purity: Rule = {
	name: "purity",
	check(file) {
		if (!isPure(file.path)) return [];
		const imports = importsOf(file)
			.filter(({ target }) => {
				if (target === "obsidian" || target.startsWith("@codemirror/") || target === "electron") return true;
				if (target.startsWith("obsidian/runtime/") || target.startsWith("obsidian/infrastructure/")) return true;
				if (target.startsWith(`${NEXT}/drivers/`) || target.startsWith(`${NEXT}/host/`)) return true;
				if (target.startsWith("obsidian/") && !inNext(target)) return true;
				return false;
			})
			.map(({ target }) => at(file, `imports ${target}`));
		const globals = matches(file, global([...DOM_GLOBALS, ...TIMERS]), (m) => `uses ${m[1]}`);
		const impure = matches(file, /\bDate\.now\s*\(|\bnew Date\s*\(\s*\)|\bMath\.random\s*\(|\.addEventListener\s*\(/g, (m) => `uses ${m[0].replace(/\s+/g, "")}`);
		return [...imports, ...globals, ...impure];
	},
};

/** Core calls: `callDoor` and the replica only in the runtime; of the core, a screen imports types and the listed pure rules. */
const coreCalls: Rule = {
	name: "core calls",
	check(file) {
		if (!inNext(file.path)) return [];
		const out: string[] = [];
		for (const imp of importsOf(file)) {
			if (imp.target.startsWith("core/") && imp.target !== CONTRACTS && !imp.typeOnly) out.push(at(file, `imports the core's ${imp.target}`));
			if (imp.target === CONTRACTS) for (const name of imp.values) if (!PURE_RULES.includes(name)) out.push(at(file, `imports ${name} of the core, not a pure rule`));
			if (imp.target.startsWith("obsidian/runtime/") && !(placeOf(file.path).part === "host" && imp.target === "obsidian/runtime/Runtime.ts")) out.push(at(file, `imports the runtime's ${imp.target}`));
		}
		out.push(...matches(file, /(?<![\w$])callDoor(?![\w$])/g, () => "calls the door"));
		out.push(...matches(file, /\.replica(?![\w$])/g, () => "reads the replica"));
		if (placeOf(file.path).part === "view")
			for (const imp of importsOf(file)) {
				if (imp.typeOnly || imp.values.length === 0) continue;
				const ok = imp.target.startsWith("preact") || imp.target.startsWith(`${NEXT}/view/`) || imp.target.startsWith(`${NEXT}/model/`);
				if (!ok) out.push(at(file, `a view imports ${imp.values.join(", ")} of ${imp.target}: only selectors and dispatch`));
			}
		return out;
	},
};

/** Timers and frames only in the drivers (the runtime is outside `next/`). */
const timers: Rule = {
	name: "timers",
	check(file) {
		if (!inNext(file.path) || placeOf(file.path).part === "drivers") return [];
		return matches(file, new RegExp(`(?<![\\w$])(${TIMERS.join("|")})(?![\\w$])`, "g"), (m) => `starts a timer or frame (${m[1]})`);
	},
};

interface DomWork {
	readonly what: string;
	readonly owners: readonly Driver[];
	readonly pattern: RegExp;
}

/** Each piece of DOM work and the drivers that own it (§Guards). */
export const DOM_WORK: readonly DomWork[] = [
	{ what: "an animation", owners: ["motion"], pattern: /\.(animate|getAnimations)\s*\(/g },
	{ what: "a style write", owners: ["motion"], pattern: /\.style\s*(\.\s*[\w$]+\s*)?=(?!=)|\.style\s*\.\s*(setProperty|removeProperty)\s*\(|\.style\s*\[[^\]]+\]\s*=(?!=)|\b(setCssStyles|setCssProps)\s*\(/g },
	{ what: "a geometry read", owners: ["motion", "measure"], pattern: /\b(getBoundingClientRect|getClientRects|getComputedStyle)\s*\(|\.(offset|client|scroll)(Width|Height|Top|Left)\b(?!\s*[-+]?=(?!=))/g },
	{ what: "a scroll write", owners: ["scroll"], pattern: /\.(scrollTop|scrollLeft)\s*[-+]?=(?!=)|\.(scrollTo|scrollBy|scrollIntoView)\s*\(/g },
	{ what: "a focus", owners: ["focus"], pattern: /\.(focus|blur)\s*\(/g },
	{ what: "an observer", owners: ["measure"], pattern: /(?<![\w$])(ResizeObserver|IntersectionObserver|MutationObserver)(?![\w$])/g },
	{ what: "a class or dataset write", owners: ["chrome"], pattern: /\.classList\s*\.\s*(add|remove|toggle|replace)\s*\(|\.className\s*=(?!=)|\.dataset\s*(\.\s*[\w$]+|\[[^\]]+\])\s*=(?!=)|\b(setAttribute|removeAttribute|toggleAttribute)\s*\(\s*["'](class|data-[\w-]+)["']|\.(addClass|removeClass|toggleClass)\s*\(/g },
	{ what: "a key scope", owners: ["keys"], pattern: /(?<![\w$])Scope(?![\w$])|\.(pushScope|popScope)\s*\(/g },
];

/** DOM work, each only in its own driver. */
const domWork: Rule = {
	name: "DOM work",
	check(file) {
		if (!inNext(file.path)) return [];
		const driver = placeOf(file.path).driver;
		const text = code(file.text).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (s) => (/^["'](class|data-[\w-]+)["']$/.test(s) ? s : '""'));
		return DOM_WORK.flatMap((work) => (driver !== null && work.owners.includes(driver) ? [] : matches(file, work.pattern, (m) => `${work.what} (${m[0].trim()}) outside ${work.owners.join(" or ")}`, text)));
	},
};

/** No JSX `style`: what is moving is `motion`'s, what is still is a class. */
const jsxStyle: Rule = {
	name: "JSX style",
	check(file) {
		if (!inNext(file.path) || !file.path.endsWith(".tsx")) return [];
		return matches(file, /(?<!\b(?:const|let|var)\s+)(?<![\w$.])style\s*=\s*[{"']/g, () => "a JSX style", code(file.text));
	},
};

/** No code reads a class to decide: the model holds the fact. */
const classReads: Rule = {
	name: "class reads",
	check(file) {
		if (!inNext(file.path)) return [];
		const reads = matches(file, /\.classList\s*\.\s*contains\s*\(|\.hasClass\s*\(|\.className\b(?!\s*=(?!=))|\bgetAttribute\s*\(\s*["']class["']/g, (m) => `reads a class (${m[0].trim()})`, code(file.text));
		const selectors = matches(file, /\.(matches|closest|querySelector|querySelectorAll)\s*\(\s*(["'`])[^"'`]*\.[A-Za-z_-][^"'`]*\2/g, (m) => `decides by a class selector (${m[0].trim()})`, code(file.text));
		return [...reads, ...selectors];
	},
};

/** The braces' block that opens at `open` (an index of `{`): its text, inner. */
function block(text: string, open: number): string {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		if (text[i] === "{") depth++;
		else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
	}
	return text.slice(open + 1);
}

/** The `default:` branch of a switch's block, at its own depth. */
function defaultBranch(body: string): string | null {
	let depth = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === "{" || c === "(" || c === "[") depth++;
		else if (c === "}" || c === ")" || c === "]") depth--;
		else if (depth === 0 && /^default\s*:/.test(body.slice(i)) && !/[\w$]/.test(body[i - 1] ?? "")) {
			const rest = body.slice(i);
			const end = rest.search(/\bcase\b[^:]*:/);
			return end < 0 ? rest : rest.slice(0, end);
		}
	}
	return null;
}

/** Every switch over a message's kind, with whether its default proves it exhaustive (`assertNever(msg)`). */
export function messageSwitches(text: string): { readonly subject: string; readonly exhaustive: boolean }[] {
	const clean = bare(text);
	return [...clean.matchAll(/\bswitch\s*\(\s*(msg|message)\s*\.\s*kind\s*\)\s*\{/g)].map((m) => {
		const body = block(clean, m.index! + m[0].length - 1);
		const branch = defaultBranch(body);
		return { subject: m[1], exhaustive: branch !== null && new RegExp(`assertNever\\s*\\(\\s*${m[1]}\\s*\\)`).test(branch) };
	});
}

/** A file declares a message union. */
export const declaresMsg = (file: Source): boolean => /\b(type|interface)\s+Msg\b/.test(bare(file.text));

/** Messages: every switch over a message's kind ends in `assertNever`. The tree-wide half (update handles `Msg`) is in the test. */
const messages: Rule = {
	name: "messages",
	check(file) {
		if (!inNext(file.path)) return [];
		return messageSwitches(file.text)
			.filter((s) => !s.exhaustive)
			.map(() => at(file, "a switch over msg.kind without default: assertNever(msg)"));
	},
};

/** Windows: no bare `document` or `window`; a popout has its own, reached from the element (`ownerDocument`, `win`). */
const windows: Rule = {
	name: "windows",
	check(file) {
		if (!inNext(file.path)) return [];
		return matches(file, global(["document", "window", "activeDocument", "activeWindow", "globalThis"]), (m) => `a bare ${m[1]}`);
	},
};

/** Every file under `next/` is in a part the spec names. */
const places: Rule = {
	name: "places",
	check(file) {
		if (!inNext(file.path)) return [];
		const { part, driver } = placeOf(file.path);
		if (part === null) return [at(file, "in no part of next/ (model, update, recognizers, view, drivers/<driver>, host)")];
		if (part === "drivers" && driver === null) return [at(file, `in no driver the spec names (${DRIVERS.join(", ")})`)];
		return [];
	},
};

export const RULES: readonly Rule[] = [places, purity, coreCalls, timers, domWork, jsxStyle, classReads, messages, windows];

export function ruleNamed(name: string): Rule {
	const rule = RULES.find((r) => r.name === name);
	if (!rule) throw new Error(`no rule ${name}`);
	return rule;
}

/** Every source file under `next/`. */
export function nextSources(): Source[] {
	const dir = join(ROOT, NEXT);
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { recursive: true, encoding: "utf8" })
		.map((p) => `${NEXT}/${p.split("\\").join("/")}`)
		.filter((p) => /\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p))
		.map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));
}
