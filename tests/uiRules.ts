import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { type Checker, type Signature, SignatureKind, SymbolFlags, type Symbol as TsSymbol, type Type, TypeFlags } from "typescript/unstable/sync";
import { TsProgram } from "./guards/TsProgram";

/**
 * The rules of the new screens (`obsidian/ui/next`, spec §Guards), read the way the compiler reads the code rather than
 * as text, and denying by default:
 *
 * - The pure parts (model, update, recognizers) compile in a project of their own with no DOM and no host
 *   (`tsconfig.next-pure.json`): a window, a document, a timer or an element cannot be named there at all.
 * - Everywhere in `next/`, every name, member, shorthand property, import and type is resolved to its declaration by
 *   TypeScript. Anything declared by the host (the DOM's and the workers' libraries, Node's, Obsidian's, and the
 *   language's own doors to the host: `globalThis`, `Reflect`, `Function`, `eval`, `Proxy`…) may be reached only where an
 *   allowlist lets that part reach it (`PART_ALLOW`, `DRIVER_ALLOW`); a few kinds of work are allowed nowhere (`NOWHERE`).
 *   Whatever no list names is refused.
 * - A host value may not leave the host's types outside the drivers (a document passed as `unknown`, an element given a
 *   type literal of its own, handed to a generic helper): every value carrying a host type is checked against the type
 *   it flows into.
 * - A switch over a message's discriminant ends in `assertNever`, the discriminant found by its type, through variables too.
 * - A view's `class` names its states only as literal `is-…` classes; no `style` in a view, by JSX or by `h()`.
 */

export const ROOT = resolve(__dirname, "..");
export const NEXT = "obsidian/ui/next";
export const MAIN_CONFIG = join(ROOT, "tsconfig.json");
export const PURE_CONFIG = join(ROOT, "tsconfig.next-pure.json");

/** The pure parts: what they draw and decide is a function of the model. */
export const PURE_PARTS = ["model", "update", "recognizers"] as const;
export const PARTS = [...PURE_PARTS, "view", "drivers", "host"] as const;
/** The drivers (§Architecture): each owns its DOM work. `overlay` is the overlay host. */
export const DRIVERS = ["motion", "measure", "scroll", "focus", "input", "keys", "chrome", "islands", "overlay"] as const;

export type Part = (typeof PARTS)[number];
export type Driver = (typeof DRIVERS)[number];

export interface Source {
	/** The path from the repository's root, with forward slashes. */
	readonly path: string;
	readonly text: string;
}

export interface Place {
	readonly part: Part | null;
	readonly driver: Driver | null;
}

export function placeOf(path: string): Place {
	const rest = path.startsWith(`${NEXT}/`) ? path.slice(NEXT.length + 1).split("/") : [];
	const head = rest[0] ?? "";
	if (rest.length < 2 || !(PARTS as readonly string[]).includes(head)) return { part: null, driver: null };
	if (head !== "drivers") return { part: head as Part, driver: null };
	const name = rest[1].replace(/\.[cm]?[jt]sx?$/, "");
	return { part: "drivers", driver: (DRIVERS as readonly string[]).includes(name) ? (name as Driver) : null };
}

const isPure = (path: string): boolean => (PURE_PARTS as readonly string[]).includes(placeOf(path).part ?? "");

const CONTRACTS = "core/application/contracts.ts";

/**
 * The core's pure rules a screen may call directly (P2): plain functions and constants of `contracts.ts`. The test keeps
 * this list equal to what `contracts.ts` exports as values, less `NOT_PURE`, so a new export is a decision made here.
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

// The host's API, by declaration ------------------------------------------------------------------------------------

/** A reach of the code into something declared outside it: a member of a declared type, a global, a type. */
export interface Reach {
	/** The interface, class or module declaring it (`CSSStyleProperties`, `Element`, `Window`…); null for a global. */
	readonly owner: string | null;
	readonly name: string;
	/** The file declaring it, from the repository's root or as an absolute path. */
	readonly file: string;
	/** The reach is written to (an assignment's target, `++`, `Object.assign`'s target). */
	readonly write: boolean;
	/** The first argument when the reach is called: a string literal's value, `dynamic` for anything else, null for none. */
	readonly firstArg: string | null | "dynamic";
	/** Every argument of the call, a string literal's value or null. */
	readonly args: readonly (string | null)[];
	readonly called: boolean;
	/** How it is used: called, constructed, as a member's object, whole, on the right of `instanceof`, or named as a type. */
	readonly at: "call" | "new" | "member" | "whole" | "instanceof" | "type";
}

/** The host's own libraries: the DOM's, the workers', Node's and Obsidian's (its module and what it adds to the DOM). */
const HOST_FILE = /(^|\/)(lib\.(dom|webworker|scripthost)[\w.-]*\.d\.ts|node_modules\/@types\/node\/.*|node_modules\/obsidian\/obsidian\.d\.ts)$/;
/** The language's own doors to the host and to code named at run time, declared in its standard library. */
const ES_HOST = new Set(["globalThis", "Reflect", "Function", "eval", "Proxy", "WeakRef", "FinalizationRegistry", "SharedArrayBuffer", "Atomics"]);
const STD_LIB = /(^|\/)lib\.[\w.-]*\.d\.ts$/;
/** The DOM's, the workers' and Node's: what a host value is for the flow rule (Obsidian's own objects reach the runtime as structural ports). */
const DOM_FILE = /(^|\/)(lib\.(dom|webworker|scripthost)[\w.-]*\.d\.ts|node_modules\/@types\/node\/.*)$/;
const OBSIDIAN_FILE = /node_modules\/obsidian\/obsidian\.d\.ts$/;
const PREACT_FILE = /node_modules\/preact\//;

/** Whether a reach is the host's: declared in a host library, or one of the language's doors to it. */
export const isHost = (r: Pick<Reach, "file" | "name" | "owner">): boolean =>
	HOST_FILE.test(r.file) || (ES_HOST.has(r.name) && r.owner === null && (r.file === "" || STD_LIB.test(r.file))) || (r.owner !== null && ES_HOST.has(r.owner) && STD_LIB.test(r.file));

const member = (owners: readonly string[], names: readonly string[] | "*") => (r: Reach) =>
	isHost(r) && r.at !== "type" && r.owner !== null && owners.includes(r.owner) && (names === "*" || names.includes(r.name));
/** A member declared in the language's or the host's libraries, host or not (`Math.random`, `Date.now`). */
const declared = (owners: readonly string[], names: readonly string[]) => (r: Reach) => (STD_LIB.test(r.file) || HOST_FILE.test(r.file)) && r.owner !== null && owners.includes(r.owner) && names.includes(r.name);
const reading = (test: (r: Reach) => boolean) => (r: Reach) => test(r) && !r.write;
const WINDOWS = ["Window", "WindowOrWorkerGlobalScope", "AnimationFrameProvider", "WindowLocalStorage", "WindowSessionStorage", "__global"];
const globalNamed = (names: readonly string[]) => (r: Reach) => isHost(r) && r.at !== "type" && (r.owner === null || WINDOWS.includes(r.owner)) && names.includes(r.name);
/** A member of Obsidian's module: one of its exports, named or imported. */
const obsidianExport = (names: readonly string[]) => (r: Reach) => OBSIDIAN_FILE.test(r.file) && r.owner !== null && /obsidian\/obsidian"?$/.test(r.owner) && names.includes(r.name);
const obsidianMember = (owners: readonly string[], names: readonly string[] | "*", except: readonly string[] = []) => (r: Reach) =>
	OBSIDIAN_FILE.test(r.file) && r.at !== "type" && r.owner !== null && owners.includes(r.owner) && (names === "*" || names.includes(r.name)) && !except.includes(r.name);

const ATTRIBUTE_CALLS = ["setAttribute", "removeAttribute", "toggleAttribute", "setAttributeNS", "removeAttributeNS", "getAttribute", "getAttributeNS", "hasAttribute", "hasAttributeNS", "getAttributeNode", "getAttributeNodeNS", "setAttributeNode", "removeAttributeNode", "attributes"];
/** An attribute's name, compared as HTML compares it: whatever its case. */
const attributeName = (r: Reach): string | null => {
	const ns = /NS$/.test(r.name);
	const name = ns ? r.args[1] : r.firstArg === "dynamic" ? null : r.firstArg;
	return typeof name === "string" ? name.toLowerCase() : null;
};
const attribute = (calls: readonly string[], names: RegExp) => (r: Reach) => member(["Element"], calls)(r) && r.called && attributeName(r) !== null && names.test(attributeName(r)!);

const ELEMENTS = /^(HTML\w*Element|SVG\w*Element|MathMLElement|Element|Node|EventTarget|Text|DocumentFragment)$/;
const EVENTS = /^(\w*Event|Touch|TouchList|EventInit|\w+EventInit|AddEventListenerOptions|EventListenerOptions|EventListener|EventListenerOrEventListenerObject)$/;
/** The DOM's element and event types, named as types (a handler's parameter, a ref handed to a driver), never their members. */
const domType = (r: Reach) => r.at === "type" && isHost(r) && (ELEMENTS.test(r.name) || EVENTS.test(r.name));

const TIMERS = ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "queueMicrotask", "setImmediate", "clearImmediate"];
const CLASS_CALLS_ALL = ["add", "remove"];
const OBSIDIAN_CLASS_CALLS_ALL = ["addClass", "removeClass"];
const literalState = (arg: string | null | undefined) => typeof arg === "string" && /^is-[\w-]+$/.test(arg);

/** A piece of host work and the drivers it belongs to; `nowhere` for what no part of `next/` may do. */
export interface HostWork {
	readonly what: string;
	readonly owners: readonly Driver[] | "nowhere" | "impure";
	readonly matches: (r: Reach) => boolean;
}

/** The work each driver owns (§Architecture's table), and what no part may do. A reach named here and denied says which. */
export const HOST_WORK: readonly HostWork[] = [
	{ what: "a bare window or document (a popout has its own: reach it from the element)", owners: "nowhere", matches: globalNamed(["window", "document", "globalThis", "self", "activeDocument", "activeWindow", "top", "parent", "frames", "location", "history", "navigator", "screen", "localStorage", "sessionStorage", "indexedDB", "opener", "frameElement"]) },
	{ what: "a door to code or the host named at run time (globalThis, Reflect, Function, eval, Proxy)", owners: "nowhere", matches: (r) => isHost(r) && !HOST_FILE.test(r.file) },
	{ what: "a timer or a frame", owners: [...DRIVERS], matches: (r) => globalNamed(TIMERS)(r) },
	{ what: "the door or the replica (the runtime's)", owners: "nowhere", matches: (r) => /^(core\/application\/(PhoneCalls|PhoneDoor)\.ts|obsidian\/runtime\/replica\/)/.test(r.file) || (r.owner === "Runtime" && r.name === "replica") },
	{
		what: "an inline style",
		owners: ["motion"],
		matches: (r) =>
			member(["CSSStyleDeclaration", "CSSStyleDeclarationBase", "CSSStyleProperties", "CSS2Properties", "StylePropertyMap", "StylePropertyMapReadOnly"], "*")(r) ||
			member(["ElementCSSInlineStyle"], ["style", "attributeStyleMap"])(r) ||
			member(["HTMLElement", "SVGElement", "Element"], ["setCssStyles", "setCssProps", "attributeStyleMap"])(r) ||
			attribute(ATTRIBUTE_CALLS, /^style$/)(r),
	},
	{ what: "an animation", owners: ["motion"], matches: (r) => member(["Animatable", "Element", "Document", "DocumentOrShadowRoot"], ["animate", "getAnimations"])(r) || member(["Animation", "KeyframeEffect", "AnimationEffect", "AnimationTimeline", "DocumentTimeline"], "*")(r) || globalNamed(["Animation", "KeyframeEffect"])(r) },
	{
		what: "a geometry read",
		owners: ["motion", "measure"],
		matches: (r) =>
			member(["Element"], ["getBoundingClientRect", "getClientRects", "clientWidth", "clientHeight", "clientTop", "clientLeft", "scrollWidth", "scrollHeight", "checkVisibility"])(r) ||
			(member(["Element"], ["scrollTop", "scrollLeft"])(r) && !r.write) ||
			member(["HTMLElement"], ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft", "offsetParent"])(r) ||
			member(["Range"], ["getBoundingClientRect", "getClientRects"])(r) ||
			member(["VisualViewport", "Screen", "DOMRect", "DOMRectReadOnly", "CSSStyleDeclaration"], "*")(r) ||
			member(["Document", "DocumentOrShadowRoot"], ["elementFromPoint", "elementsFromPoint", "caretRangeFromPoint", "caretPositionFromPoint"])(r) ||
			globalNamed(["getComputedStyle", "innerWidth", "innerHeight", "outerWidth", "outerHeight", "devicePixelRatio", "visualViewport", "scrollX", "scrollY", "pageXOffset", "pageYOffset", "screenX", "screenY", "screenLeft", "screenTop"])(r),
	},
	{ what: "a scroll", owners: ["scroll"], matches: (r) => (member(["Element"], ["scrollTop", "scrollLeft"])(r) && r.write) || member(["Element", "Window", "HTMLElement"], ["scroll", "scrollTo", "scrollBy", "scrollIntoView", "scrollIntoViewIfNeeded"])(r) || globalNamed(["scroll", "scrollTo", "scrollBy"])(r) },
	{ what: "a focus", owners: ["focus"], matches: (r) => member(["HTMLOrSVGElement", "HTMLElement", "SVGElement", "Window", "Element"], ["focus", "blur"])(r) || globalNamed(["focus", "blur"])(r) || reading(member(["Document", "DocumentOrShadowRoot"], ["activeElement", "hasFocus"]))(r) },
	{ what: "an observer", owners: ["measure"], matches: (r) => globalNamed(["ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver"])(r) || member(["ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver", "ResizeObserverEntry", "IntersectionObserverEntry", "MutationRecord", "ResizeObserverSize"], "*")(r) },
	{ what: "the platform, the theme or the viewport's media", owners: ["chrome"], matches: (r) => globalNamed(["matchMedia"])(r) || member(["MediaQueryList", "MediaQueryListEvent"], "*")(r) || (OBSIDIAN_FILE.test(r.file) && r.owner === "Workspace" && r.name === "on" && r.firstArg === "css-change") },
	{
		what: "a class written whole, from a list or by its attribute (chrome writes only literal is-… states, one class each)",
		owners: "nowhere",
		matches: (r) =>
			(member(["Element"], ["className"])(r) && r.write) ||
			(member(["DOMTokenList"], ["value"])(r) && r.write) ||
			member(["HTMLElement", "Element", "SVGElement"], ["setCls", "addClasses", "removeClasses"])(r) ||
			attribute(ATTRIBUTE_CALLS.filter((c) => !/^(get|has)/.test(c)), /^class$/)(r),
	},
	{
		what: "a class or dataset write",
		owners: ["chrome"],
		matches: (r) =>
			member(["DOMTokenList"], ["add", "remove", "toggle", "replace"])(r) ||
			(r.owner === "DOMStringMap" && r.write) ||
			member(["HTMLElement", "Element", "SVGElement"], ["addClass", "removeClass", "toggleClass"])(r) ||
			attribute(["setAttribute", "removeAttribute", "toggleAttribute", "setAttributeNS", "removeAttributeNS"], /^data-[\w-]+$/)(r),
	},
	{
		what: "a class that is not a literal is-… state (the CSS reads every class chrome writes as a state)",
		owners: "nowhere",
		matches: (r) => {
			if (!r.called) return false;
			if (member(["DOMTokenList"], CLASS_CALLS_ALL)(r) || member(["HTMLElement", "Element", "SVGElement"], OBSIDIAN_CLASS_CALLS_ALL)(r)) return r.args.length === 0 || !r.args.every(literalState);
			if (member(["DOMTokenList"], ["toggle"])(r) || member(["HTMLElement", "Element", "SVGElement"], ["toggleClass"])(r)) return !literalState(r.args[0]);
			if (member(["DOMTokenList"], ["replace"])(r)) return !literalState(r.args[0]) || !literalState(r.args[1]);
			return false;
		},
	},
	{
		what: "a class read (no code reads a class to decide: the model holds the fact)",
		owners: "nowhere",
		matches: (r) =>
			member(["DOMTokenList"], ["contains", "item", "length", "forEach", "entries", "keys", "values", "supports"])(r) ||
			(member(["DOMTokenList"], ["value"])(r) && !r.write) ||
			(member(["Element"], ["className"])(r) && !r.write) ||
			member(["HTMLElement", "Element", "SVGElement"], ["hasClass"])(r) ||
			attribute(["getAttribute", "getAttributeNS", "hasAttribute", "hasAttributeNS", "getAttributeNode", "getAttributeNodeNS"], /^class$/)(r) ||
			member(["Element", "Document", "ParentNode"], ["getElementsByClassName"])(r),
	},
	{ what: "the class list taken whole (spread, iterated, passed on)", owners: "nowhere", matches: (r) => member(["Element"], ["classList"])(r) && !r.called && r.at === "whole" },
	{ what: "an attribute named at run time", owners: "nowhere", matches: (r) => member(["Element"], ATTRIBUTE_CALLS)(r) && r.called && attributeName(r) === null },
	{
		what: "a selector that is not a literal, or that names a class",
		owners: "nowhere",
		matches: (r) => member(["Element", "ParentNode", "Document", "DocumentFragment", "DocumentOrShadowRoot"], ["matches", "closest", "querySelector", "querySelectorAll", "webkitMatchesSelector"])(r) && r.called && (r.firstArg === "dynamic" || (typeof r.firstArg === "string" && namesAClass(r.firstArg))),
	},
	{ what: "a key scope", owners: ["keys"], matches: (r) => (r.name === "Scope" && OBSIDIAN_FILE.test(r.file)) || member(["Keymap"], ["pushScope", "popScope"])(r) || member(["App"], ["scope"])(r) || member(["Scope"], "*")(r) },
	{ what: "a listener on the DOM (a view takes events through JSX)", owners: [...DRIVERS], matches: (r) => (isHost(r) && r.at !== "type" && ["addEventListener", "removeEventListener"].includes(r.name)) || (isHost(r) && r.at !== "type" && /^on[a-z]+$/.test(r.name) && r.write) || member(["HTMLElement", "Element", "Document", "Window"], ["registerDomEvent", "onClickEvent", "on", "off"])(r) },
	{ what: "the clock or chance in a pure part", owners: "impure", matches: (r) => declared(["DateConstructor"], ["now"])(r) || declared(["Math"], ["random"])(r) || declared(["Performance"], ["now"])(r) || (r.name === "Date" && r.owner === null && r.called && r.firstArg === null && r.at === "new") },
];

/** A selector naming a class: `.x` outside strings and attribute values, or an attribute selector on `class`, whatever its case. */
export function namesAClass(selector: string): boolean {
	if (/\[\s*class\s*([~|^$*]?=|\])/i.test(selector)) return true;
	return /\.[A-Za-z_-]/.test(selector.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, ""));
}

// What each part may reach: an allowlist, nothing else --------------------------------------------------------------

const workOf = (what: string) => HOST_WORK.find((w) => w.what.startsWith(what))!.matches;
const NODE_OWNERS = ["Node", "Element", "HTMLElement", "SVGElement", "ParentNode", "ChildNode", "NonDocumentTypeChildNode", "Document", "DocumentOrShadowRoot", "DocumentFragment", "HTMLOrSVGElement"];

/** What every driver may reach: its element's neighbours and own window, data attributes, events as they come, timers, listeners. */
const DRIVER_COMMON: readonly ((r: Reach) => boolean)[] = [
	reading(member(NODE_OWNERS, ["ownerDocument", "parentNode", "parentElement", "contains", "isConnected", "nodeType", "firstChild", "lastChild", "nextSibling", "previousSibling", "childNodes", "getRootNode", "children", "firstElementChild", "lastElementChild", "nextElementSibling", "previousElementSibling", "childElementCount", "tagName", "localName", "closest", "matches", "querySelector", "querySelectorAll", "defaultView", "body", "documentElement", "dataset"])),
	reading((r) => r.owner === "DOMStringMap"),
	attribute(["getAttribute", "hasAttribute"], /^data-[\w-]+$/),
	member(["Event", "UIEvent"], ["type", "target", "currentTarget", "preventDefault", "stopPropagation", "stopImmediatePropagation", "defaultPrevented", "timeStamp", "isTrusted", "composedPath", "cancelable", "eventPhase", "detail"]),
	member(["NodeListOf", "NodeList", "HTMLCollection", "HTMLCollectionBase", "HTMLCollectionOf"], ["length", "item", "forEach", "entries", "keys", "values"]),
	workOf("a timer"),
	workOf("a listener"),
	(r) => r.at === "instanceof" && isHost(r) && (ELEMENTS.test(r.name) || EVENTS.test(r.name)),
	(r) => r.at === "type" && isHost(r),
];

const POINTER_OWNERS = ["MouseEvent", "PointerEvent", "WheelEvent", "TouchEvent", "Touch", "TouchList", "DragEvent"];
const PLATFORM = ["isMobile", "isDesktop", "isDesktopApp", "isMobileApp", "isIosApp", "isAndroidApp", "isPhone", "isTablet", "isMacOS", "isWin", "isLinux", "isSafari"];
const MOUNTING = member(NODE_OWNERS, ["appendChild", "insertBefore", "removeChild", "replaceChild", "remove", "append", "prepend", "replaceChildren", "createElement", "createElementNS", "createDocumentFragment"]);

/** Each driver's own work beside the common: its row of §Architecture's table. */
export const DRIVER_ALLOW: Readonly<Record<Driver, readonly ((r: Reach) => boolean)[]>> = {
	motion: [workOf("an inline style"), workOf("an animation"), workOf("a geometry read")],
	measure: [workOf("a geometry read"), workOf("an observer")],
	scroll: [workOf("a scroll")],
	focus: [workOf("a focus"), reading(member(["FocusEvent"], "*")), reading(member(["ElementContentEditable", "HTMLElement", "HTMLOrSVGElement"], ["isContentEditable", "contentEditable", "tabIndex"]))],
	/** The pointer, touch and wheel; a key read while a gesture runs (Escape ends a lift). */
	input: [member(POINTER_OWNERS, "*"), reading(member(["KeyboardEvent"], "*")), member(["Element"], ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"])],
	/** Scopes and keys; where focus went, so a scope ends when its field loses it. */
	keys: [workOf("a key scope"), reading(member(["KeyboardEvent", "FocusEvent"], "*")), obsidianExport(["Scope", "Keymap"]), reading(obsidianMember(["App"], ["keymap"]))],
	chrome: [
		workOf("a class or dataset write"),
		(r) => member(["Element"], ["classList"])(r) && r.at === "member",
		workOf("the platform"),
		obsidianMember(["Workspace", "Events"], ["on", "offref"]),
		obsidianExport(["Platform"]),
		(r) => OBSIDIAN_FILE.test(r.file) && r.owner === "__type" && PLATFORM.includes(r.name) && !r.write,
	],
	islands: [
		MOUNTING,
		obsidianExport(["MarkdownRenderer", "Modal", "Component", "MarkdownRenderChild"]),
		obsidianMember(["MarkdownRenderer", "Modal", "Component", "MarkdownRenderChild"], "*", ["registerDomEvent", "registerInterval"]),
	],
	overlay: [MOUNTING],
};

/**
 * Obsidian's API as a host uses it: the views it extends and their lifecycle, the vault's and the workspace's events and
 * leaves to find where its blocks go, the files' names. Never the files' contents (the runtime reads and writes them),
 * never Obsidian's own UI (a notice is the runtime's words, a menu or a modal a layer or an island), never its DOM helpers.
 */
const HOST_OBSIDIAN: readonly ((r: Reach) => boolean)[] = [
	obsidianExport(["ItemView", "View", "MarkdownView", "MarkdownRenderChild", "PluginSettingTab", "SettingTab", "Component", "TFile", "TFolder", "TAbstractFile", "WorkspaceLeaf"]),
	obsidianMember(["Component", "View", "ItemView", "FileView", "TextFileView", "EditableFileView", "MarkdownView", "MarkdownRenderChild", "PluginSettingTab", "SettingTab"], "*", ["registerDomEvent", "registerInterval", "registerScopeEvent", "scope", "navigation"]),
	reading(obsidianMember(["App"], ["vault", "workspace", "metadataCache"])),
	obsidianMember(["Vault", "MetadataCache", "Workspace", "Events"], ["on", "offref", "getAbstractFileByPath", "getFileByPath", "getName", "iterateAllLeaves", "iterateRootLeaves", "getLeavesOfType", "getActiveViewOfType", "onLayoutReady", "layoutReady", "activeLeaf"]),
	reading(obsidianMember(["WorkspaceLeaf"], ["view", "getViewState", "getRoot"])),
	reading(obsidianMember(["TAbstractFile", "TFile", "TFolder"], ["path", "name", "basename", "extension", "parent"])),
];
const obsidianApi = (r: Reach) => HOST_OBSIDIAN.some((a) => a(r));
/** Work a driver owns: a host never does it, even through Obsidian's API (a scope, the theme's change). */
const driversWork = (r: Reach) => HOST_WORK.some((w) => Array.isArray(w.owners) && w.matches(r));

/**
 * What a host may reach (§Architecture: mount, own, dispose): Obsidian's API (the app, the vault's and the workspace's
 * events, the leaves and views it mounts into), the DOM's tree read to find where its block goes, DOM and Obsidian types.
 * The node itself is made and placed by a driver (`islands`, `overlay`: host nodes made once), and Preact renders into
 * it; a host never writes the DOM, nor does a driver's work (style, class, listener, geometry, timer, scope, focus).
 */
const HOST_ALLOW: readonly ((r: Reach) => boolean)[] = [
	domType,
	(r) => r.at === "type" && OBSIDIAN_FILE.test(r.file),
	(r) => !driversWork(r) && (obsidianApi(r) || reading(member(NODE_OWNERS, ["parentNode", "parentElement", "contains", "isConnected", "firstChild", "lastChild", "nextSibling", "previousSibling", "firstElementChild", "lastElementChild", "nextElementSibling", "previousElementSibling"]))(r)),
	(r) => r.at === "instanceof" && isHost(r) && ELEMENTS.test(r.name),
];

/** What a view may reach: the DOM's types for its handlers, and what a field says it holds as it is typed. */
const VIEW_ALLOW: readonly ((r: Reach) => boolean)[] = [
	domType,
	reading(member(["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement"], ["value", "checked", "selectionStart", "selectionEnd"])),
	reading(member(["KeyboardEvent"], ["key", "isComposing"])),
	reading(member(["InputEvent", "CompositionEvent"], ["isComposing", "data", "inputType"])),
];

export const PART_ALLOW: Readonly<Record<"pure" | "view" | "host", readonly ((r: Reach) => boolean)[]>> = { pure: [], view: VIEW_ALLOW, host: HOST_ALLOW };

function allowList(place: Place, path: string): readonly ((r: Reach) => boolean)[] {
	if (place.part === "drivers" && place.driver) return [...DRIVER_COMMON, ...DRIVER_ALLOW[place.driver]];
	if (place.part === "view") return PART_ALLOW.view;
	if (place.part === "host") return PART_ALLOW.host;
	return isPure(path) ? PART_ALLOW.pure : [];
}

// Walking a file ----------------------------------------------------------------------------------------------------

type AnyNode = Node & Record<string, unknown>;

function walk(node: Node, visit: (n: AnyNode) => void): void {
	visit(node as AnyNode);
	node.forEachChild((child) => {
		walk(child, visit);
		return undefined;
	});
}

const text = (sf: SourceFile, n: Node) => sf.text.slice(n.getStart(sf), n.end).replace(/\s+/g, " ").slice(0, 80);

/** A string literal's value, or null; template literals with substitutions are not literals. */
function literal(n: Node | undefined): string | null {
	if (!n) return null;
	if (n.kind === SyntaxKind.StringLiteral || n.kind === SyntaxKind.NoSubstitutionTemplateLiteral) return (n as unknown as { text: string }).text;
	return null;
}

const isAssignmentTarget = (n: AnyNode): boolean => {
	const parent = n.parent as AnyNode;
	if (parent.kind === SyntaxKind.BinaryExpression && parent.left === n) {
		const op = (parent.operatorToken as Node).kind;
		return op >= SyntaxKind.FirstAssignment && op <= SyntaxKind.LastAssignment;
	}
	if ((parent.kind === SyntaxKind.PrefixUnaryExpression || parent.kind === SyntaxKind.PostfixUnaryExpression) && [SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken].includes(parent.operator as SyntaxKind)) return true;
	if (parent.kind === SyntaxKind.DeleteExpression) return true;
	return false;
};

/** How a reach is used: called (and with what arguments), constructed, as an object, whole, or as `instanceof`'s class. */
function useOf(n: AnyNode): Pick<Reach, "called" | "firstArg" | "args" | "at"> {
	const parent = n.parent as AnyNode;
	const argsOf = (call: AnyNode) => ((call.arguments as unknown as Node[] | undefined) ?? []).map((a) => literal(a));
	if (parent.kind === SyntaxKind.CallExpression && parent.expression === n) {
		const args = argsOf(parent);
		return { called: true, args, firstArg: args.length === 0 ? null : (args[0] ?? "dynamic"), at: "call" };
	}
	if (parent.kind === SyntaxKind.NewExpression && parent.expression === n) {
		const args = argsOf(parent);
		return { called: true, args, firstArg: args.length === 0 ? null : (args[0] ?? "dynamic"), at: "new" };
	}
	if (parent.kind === SyntaxKind.BinaryExpression && parent.right === n && (parent.operatorToken as Node).kind === SyntaxKind.InstanceOfKeyword) return { called: false, args: [], firstArg: null, at: "instanceof" };
	const isMemberObject = (parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === n;
	return { called: false, args: [], firstArg: null, at: isMemberObject ? "member" : "whole" };
}

/** Whether an expression is written into as an argument: `Object.assign(target, …)`, `Reflect.set(target, …)`. */
const writesInto = (n: AnyNode): boolean => {
	const call = n.parent as AnyNode;
	if (call.kind !== SyntaxKind.CallExpression || (call.arguments as unknown as Node[])[0] !== n) return false;
	const callee = call.expression as AnyNode;
	if (callee.kind !== SyntaxKind.PropertyAccessExpression) return false;
	const object = callee.expression as AnyNode;
	const name = String((callee.name as AnyNode).text);
	return object.kind === SyntaxKind.Identifier && ((object.text === "Object" && /^(assign|defineProperty|defineProperties)$/.test(name)) || (object.text === "Reflect" && /^(set|defineProperty)$/.test(name)));
};

interface Found {
	readonly node: AnyNode;
	/** The node to resolve the symbol at; null when the member is found through the object's type. */
	readonly at: Node | null;
	/** For a member found through a type: the object expression and the member's name. */
	readonly through?: { readonly object: Node; readonly name: string };
	readonly type?: boolean;
	readonly shorthand?: boolean;
}

function fileOf(symbol: TsSymbol | undefined): string {
	const path = symbol?.declarations?.[0]?.path ?? "";
	const rel = relative(ROOT, path);
	return rel.startsWith("..") ? path : rel;
}

/** The names a type goes by: its alias, its symbol, and those of the members of a union or intersection, a few levels down. */
function typeName(type: Type | undefined, depth = 0): string[] {
	if (!type || depth > 3) return [];
	const own = [type.getAliasSymbol()?.name, type.getSymbol()?.name].filter((n): n is string => !!n);
	const parts = type.isUnionType() || type.isIntersectionType() ? (type.getTypes() ?? []).flatMap((t) => typeName(t, depth + 1)) : [];
	return [...new Set([...own, ...parts])];
}

const ANY = TypeFlags.Any;

/** The declaration a name ends at: through an import's alias to what it names. */
function target(checker: Checker, symbol: TsSymbol | undefined): TsSymbol | undefined {
	if (!symbol || (symbol.flags & SymbolFlags.Alias) === 0) return symbol;
	try {
		return checker.getAliasedSymbol(symbol);
	} catch {
		return symbol;
	}
}

/** Names that declare rather than reach: a declaration's own name, a property's key, a label. */
const DECLARING = new Set([
	SyntaxKind.PropertyAssignment, SyntaxKind.PropertyDeclaration, SyntaxKind.PropertySignature, SyntaxKind.MethodDeclaration, SyntaxKind.MethodSignature,
	SyntaxKind.BindingElement, SyntaxKind.VariableDeclaration, SyntaxKind.Parameter, SyntaxKind.FunctionDeclaration, SyntaxKind.ClassDeclaration,
	SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration, SyntaxKind.ImportSpecifier, SyntaxKind.ImportClause, SyntaxKind.NamespaceImport,
	SyntaxKind.ExportSpecifier, SyntaxKind.JsxAttribute, SyntaxKind.EnumMember, SyntaxKind.LabeledStatement, SyntaxKind.TypeParameter, SyntaxKind.GetAccessor,
	SyntaxKind.SetAccessor, SyntaxKind.ShorthandPropertyAssignment, SyntaxKind.FunctionExpression, SyntaxKind.ClassExpression, SyntaxKind.EnumDeclaration,
	SyntaxKind.ModuleDeclaration, SyntaxKind.ImportEqualsDeclaration, SyntaxKind.NamespaceExport,
]);

/** Every reach of a file into declarations, resolved by the checker. */
function reaches(sf: SourceFile, checker: Checker): (Reach & { node: AnyNode })[] {
	const found: Found[] = [];
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.PropertyAccessExpression) found.push({ node: n, at: n.name as Node });
		else if (n.kind === SyntaxKind.ElementAccessExpression) {
			const key = literal(n.argumentExpression as Node);
			found.push({ node: n, at: null, through: { object: n.expression as Node, name: key ?? "" } });
		} else if (n.kind === SyntaxKind.BindingElement && (n.parent as Node).kind === SyntaxKind.ObjectBindingPattern) {
			const key = (n.propertyName as AnyNode | undefined) ?? (n.name as AnyNode);
			found.push({ node: n, at: null, through: { object: n.parent as Node, name: String(key.text ?? literal(key as Node) ?? "") } });
		} else if (n.kind === SyntaxKind.ShorthandPropertyAssignment) found.push({ node: n, at: n, shorthand: true });
		else if (n.kind === SyntaxKind.Identifier) {
			const parent = n.parent as AnyNode;
			if (parent.kind === SyntaxKind.TypeReference || parent.kind === SyntaxKind.ExpressionWithTypeArguments && (parent.parent as AnyNode)?.kind === SyntaxKind.HeritageClause && ((parent.parent as AnyNode).token as SyntaxKind) === SyntaxKind.ImplementsKeyword) {
				found.push({ node: n, at: n, type: true });
				return;
			}
			if (parent.kind === SyntaxKind.QualifiedName) {
				if (parent.right === n) found.push({ node: n, at: n, type: true });
				return;
			}
			const isName = (parent.kind === SyntaxKind.PropertyAccessExpression && parent.name === n) || (DECLARING.has(parent.kind) && parent.name === n) || (parent.kind === SyntaxKind.BindingElement && parent.propertyName === n) || (parent.kind === SyntaxKind.ImportSpecifier || parent.kind === SyntaxKind.ExportSpecifier);
			if (!isName) found.push({ node: n, at: n });
		}
	});
	const plain = found.filter((f) => f.at !== null && !f.shorthand);
	const symbols = plain.length ? checker.getSymbolAtLocation(plain.map((f) => f.at as Node)) : [];
	const bySymbol = new Map(plain.map((f, i) => [f, symbols[i]]));
	const throughs = found.filter((f) => f.through);
	const objectTypes = throughs.length ? checker.getTypeAtLocation(throughs.map((f) => f.through!.object)) : [];
	const accesses = found.filter((f) => f.node.kind === SyntaxKind.PropertyAccessExpression || f.node.kind === SyntaxKind.ElementAccessExpression);
	const accessTypes = accesses.length ? checker.getTypeAtLocation(accesses.map((f) => f.node.expression as Node)) : [];
	const accessType = new Map(accesses.map((f, i) => [f, accessTypes[i]]));
	const out: (Reach & { node: AnyNode })[] = [];
	for (const f of found) {
		let symbol: TsSymbol | undefined;
		const objectType = accessType.get(f);
		if (f.shorthand) symbol = checker.getShorthandAssignmentValueSymbol(f.node);
		else if (f.through) {
			const type = objectTypes[throughs.indexOf(f)];
			if (type && f.through.name) symbol = checker.getPropertyOfType(type, f.through.name);
			if (!symbol && f.node.kind === SyntaxKind.ElementAccessExpression && type) {
				const host = HOST_FILE.test(fileOf(type.getSymbol())) || typeName(type).some((n) => ES_HOST.has(n));
				if (host || (type.flags & ANY) !== 0)
					out.push({ owner: typeName(type)[0] ?? "any", name: `[${text(sf, f.node.argumentExpression as Node)}]`, file: "computed", write: false, firstArg: null, args: [], called: false, at: "member", node: f.node });
			}
		} else symbol = bySymbol.get(f);
		if (objectType && (objectType.flags & ANY) !== 0) out.push({ owner: "any", name: text(sf, f.node), file: "untyped", write: false, firstArg: null, args: [], called: false, at: "member", node: f.node });
		symbol = target(checker, symbol);
		if (!symbol) continue;
		const owner = symbol.getParent()?.name ?? null;
		const use: Pick<Reach, "called" | "firstArg" | "args" | "at"> = f.type ? { called: false, args: [], firstArg: null, at: "type" } : f.shorthand ? { called: false, args: [], firstArg: null, at: "whole" } : useOf(f.node);
		const write = !f.type && !f.shorthand && (isAssignmentTarget(f.node) || writesInto(f.node));
		out.push({ owner, name: symbol.name, file: fileOf(symbol), write, ...use, node: f.node });
		// A member read and then written through (`el.dataset.x = …`): the object's type is written.
		if (!write && !f.type && f.node.kind !== SyntaxKind.Identifier) {
			const parent = f.node.parent as AnyNode;
			if ((parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === f.node && isAssignmentTarget(parent)) {
				const objectNames = typeName(checker.getTypeAtLocation(f.node as Node));
				if (objectNames.includes("DOMStringMap")) out.push({ owner: "DOMStringMap", name: "*", file: "lib.dom.d.ts", write: true, firstArg: null, args: [], called: false, at: "member", node: parent });
			}
		}
	}
	return out;
}

// The rules ---------------------------------------------------------------------------------------------------------

export interface Violation {
	readonly path: string;
	readonly rule: string;
	readonly what: string;
}

function importsOf(sf: SourceFile, path: string): { target: string; values: string[]; typeOnly: boolean }[] {
	const out: { target: string; values: string[]; typeOnly: boolean }[] = [];
	const resolveTarget = (specifier: string): string => {
		if (!specifier.startsWith(".")) return specifier;
		const p = relative(ROOT, resolve(ROOT, dirname(path), specifier)).split("\\").join("/");
		if (/\.\w+$/.test(p)) return p;
		return ["ts", "tsx"].flatMap((ext) => [`${p}.${ext}`, `${p}/index.${ext}`]).find((c) => existsSync(join(ROOT, c))) ?? `${p}.ts`;
	};
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.ImportDeclaration) {
			const clause = n.importClause as AnyNode | undefined;
			const typeOnly = clause?.phaseModifier === SyntaxKind.TypeKeyword;
			const values: string[] = [];
			if (clause && !typeOnly) {
				if (clause.name) values.push("default");
				const bindings = clause.namedBindings as AnyNode | undefined;
				if (bindings?.kind === SyntaxKind.NamespaceImport) values.push("*");
				if (bindings?.kind === SyntaxKind.NamedImports)
					for (const s of bindings.elements as unknown as AnyNode[]) if (!s.isTypeOnly) values.push(String(((s.propertyName ?? s.name) as AnyNode).text));
			}
			if (!clause) values.push("*");
			out.push({ target: resolveTarget(literal(n.moduleSpecifier as Node) ?? ""), values, typeOnly: typeOnly || (values.length === 0 && !!clause) });
		} else if (n.kind === SyntaxKind.ExportDeclaration && n.moduleSpecifier) {
			const values = n.isTypeOnly ? [] : ((n.exportClause as AnyNode | undefined)?.elements as unknown as AnyNode[] | undefined)?.filter((s) => !s.isTypeOnly).map((s) => String(((s.propertyName ?? s.name) as AnyNode).text)) ?? ["*"];
			out.push({ target: resolveTarget(literal(n.moduleSpecifier as Node) ?? ""), values, typeOnly: values.length === 0 });
		} else if (n.kind === SyntaxKind.ImportEqualsDeclaration) {
			out.push({ target: "<an import = require(…)>", values: ["*"], typeOnly: false });
		} else if (n.kind === SyntaxKind.CallExpression) {
			const callee = n.expression as AnyNode;
			const isImport = callee.kind === SyntaxKind.ImportKeyword || (callee.kind === SyntaxKind.Identifier && callee.text === "require");
			if (isImport) {
				const spec = literal((n.arguments as unknown as Node[])[0]);
				out.push({ target: spec === null ? "<a module named at run time>" : resolveTarget(spec), values: ["*"], typeOnly: false });
			}
		} else if (n.kind === SyntaxKind.ImportType) {
			const arg = n.argument as AnyNode | undefined;
			const spec = literal(arg?.literal as Node | undefined);
			out.push({ target: spec === null ? "<a module named at run time>" : resolveTarget(spec), values: [], typeOnly: true });
		}
	});
	return out;
}

/** The modules `next/` may import at all; everything else is refused (a helper of the tests, a script, Node's modules). */
function importable(t: string, part: Part | null, driver: Driver | null, typeOnly: boolean, given: readonly string[]): boolean {
	if (given.includes(t)) return true;
	if (t.startsWith(`${NEXT}/`)) return true;
	if (t === "preact" || t.startsWith("preact/")) return true;
	if (t.startsWith("core/")) return true;
	if (t.startsWith("obsidian/runtime/")) return true;
	if (t === "obsidian") return part === "host" || part === "drivers";
	if (t.startsWith("@codemirror/")) return typeOnly || driver === "islands";
	return false;
}

function importRules(path: string, sf: SourceFile, given: readonly string[]): Violation[] {
	const v = (what: string): Violation => ({ path, rule: "imports", what });
	const { part, driver } = placeOf(path);
	const out: Violation[] = [];
	for (const imp of importsOf(sf, path)) {
		const t = imp.target;
		if (t.startsWith("<")) {
			out.push(v(`imports ${t}`));
			continue;
		}
		if (!importable(t, part, driver, imp.typeOnly, given) && !(t.startsWith("obsidian/") && !t.startsWith(`${NEXT}/`))) out.push(v(`imports ${t}: not a module next/ may use (its own parts, Preact, the core's contracts, the runtime's door for hosts, Obsidian for hosts and drivers, CodeMirror for islands)`));
		if (t.startsWith("core/") && t !== CONTRACTS && !imp.typeOnly) out.push(v(`imports the core's ${t}`));
		if (t === CONTRACTS) for (const name of imp.values) if (!PURE_RULES.includes(name)) out.push(v(`imports ${name} of the core, not a pure rule`));
		if (t.startsWith("obsidian/runtime/") && !(part === "host" && t === "obsidian/runtime/Runtime.ts")) out.push(v(`imports the runtime's ${t}`));
		if (t.startsWith("obsidian/") && !t.startsWith(`${NEXT}/`) && !t.startsWith("obsidian/runtime/")) out.push(v(`imports the old screen or the plugin's ${t}`));
		if (part && isPure(`${NEXT}/${part}/x.ts`)) {
			if (t === "obsidian" || t.startsWith("@codemirror/") || t === "electron" || t.startsWith("preact")) out.push(v(`a pure part imports ${t}`));
			if (t.startsWith(`${NEXT}/drivers/`) || t.startsWith(`${NEXT}/host/`) || t.startsWith(`${NEXT}/view/`)) out.push(v(`a pure part imports ${t}`));
		}
		if (part === "view" && !imp.typeOnly && imp.values.length > 0 && !given.includes(t) && !(t.startsWith("preact") || t.startsWith(`${NEXT}/view/`) || t.startsWith(`${NEXT}/model/`)))
			out.push(v(`a view imports ${imp.values.join(", ")} of ${t}: only selectors and dispatch`));
		if (part === "view" && (t === "obsidian" || t.startsWith(`${NEXT}/drivers/`) || t.startsWith(`${NEXT}/host/`))) out.push(v(`a view imports ${t}`));
	}
	return out;
}

function hostRules(path: string, sf: SourceFile, checker: Checker): Violation[] {
	const place = placeOf(path);
	const allow = allowList(place, path);
	const out: Violation[] = [];
	const where = place.part === "drivers" ? `the ${place.driver} driver` : place.part ? `a ${place.part === "host" ? "host" : place.part} file` : "this file";
	for (const r of reaches(sf, checker)) {
		if (r.file === "untyped") {
			out.push({ path, rule: "untyped", what: `an access on an untyped value (${r.name}): a host member can hide behind any` });
			continue;
		}
		if (r.file === "computed") {
			out.push({ path, rule: "computed", what: `a host member named at run time (${r.owner}${r.name})` });
			continue;
		}
		const named = `${r.owner && !r.owner.includes("/") ? `${r.owner}.` : ""}${r.name}`;
		const at = `«${text(sf, r.node)}»`;
		for (const work of HOST_WORK) if (work.owners === "impure" && work.matches(r) && isPure(path)) out.push({ path, rule: work.what, what: `${named} at ${at}` });
		const nowhere = HOST_WORK.filter((w) => w.owners === "nowhere" && w.matches(r));
		for (const w of nowhere) out.push({ path, rule: w.what, what: `${named} at ${at}` });
		if (!isHost(r) || nowhere.length > 0 || allow.some((a) => a(r))) continue;
		const work = HOST_WORK.find((w) => Array.isArray(w.owners) && w.matches(r));
		if (work) {
			const owners = work.owners as readonly Driver[];
			out.push({ path, rule: work.what, what: `${named} at ${at} outside ${owners.length === DRIVERS.length ? "the drivers" : owners.join(" or ")}` });
		} else out.push({ path, rule: "deny by default", what: `${r.at === "type" ? "the host's type " : ""}${named} at ${at}: no allowlist lets ${where} reach it` });
	}
	return out;
}

// Host values leaving the host's types ------------------------------------------------------------------------------

/**
 * Whether a type is the host's or holds one: declared in a host library (an element, a window, a style, a class list),
 * or a union, an instantiation (`Map<K, Element>`) or an object one of whose members is. Preact's `ContainerNode`, the
 * element it renders into, counts as the host's.
 */
class HostTypes {
	private readonly memo = new Map<number, boolean>();
	constructor(private readonly checker: Checker) {}

	carries(type: Type | undefined, depth = 0): boolean {
		if (!type || depth > 3) return false;
		const known = this.memo.get(type.id);
		if (known !== undefined) return known;
		this.memo.set(type.id, false);
		const result = this.compute(type, depth);
		this.memo.set(type.id, result);
		return result;
	}

	private compute(type: Type, depth: number): boolean {
		const own = [type.getSymbol(), type.getAliasSymbol()].filter((s): s is TsSymbol => !!s);
		if (own.some((s) => DOM_FILE.test(fileOf(s)) || ES_HOST.has(s.name) || (s.name === "ContainerNode" && PREACT_FILE.test(fileOf(s))))) return true;
		if (type.isUnionType() || type.isIntersectionType()) return (type.getTypes() ?? []).some((t) => this.carries(t, depth + 1));
		if (type.isTypeReference()) {
			const args = this.checker.getTypeArguments(type);
			if (args.some((t) => this.carries(t, depth + 1))) return true;
		}
		const library = (file: string) => STD_LIB.test(file) || HOST_FILE.test(file) || PREACT_FILE.test(file) || /node_modules\//.test(file);
		if ((type.flags & TypeFlags.Object) !== 0 && !library(fileOf(type.getSymbol()))) {
			const props = this.checker
				.getPropertiesOfType(type)
				.filter((p) => (p.flags & SymbolFlags.Method) === 0 && !library(fileOf(p)))
				.slice(0, 40);
			if (props.length === 0) return false;
			const types = this.checker.getTypeOfSymbol(props);
			return types.some((t) => this.carries(t, depth + 1));
		}
		return false;
	}
}

/** A target no host value may go into anywhere: `any`, `unknown`, `object`, `{}`. */
const untypedTarget = (type: Type, checker: Checker): boolean =>
	(type.flags & (TypeFlags.Any | TypeFlags.Unknown | TypeFlags.NonPrimitive)) !== 0 ||
	((type.flags & TypeFlags.Object) !== 0 && ["", "__type", "__object", "Object"].includes(type.getSymbol()?.name ?? "") && checker.getPropertiesOfType(type).length === 0 && checker.getSignaturesOfType(type, SignatureKind.Call).length === 0);

/** The candidates for a flow: a value used whole (not as a member's object or a callee). */
function wholeValues(sf: SourceFile): AnyNode[] {
	const out: AnyNode[] = [];
	walk(sf, (n) => {
		const kinds = [SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression, SyntaxKind.CallExpression, SyntaxKind.NewExpression, SyntaxKind.ThisKeyword, SyntaxKind.ObjectLiteralExpression, SyntaxKind.ArrayLiteralExpression];
		if (!kinds.includes(n.kind)) return;
		const parent = n.parent as AnyNode;
		if (!parent) return;
		if ((parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === n) return;
		if ((parent.kind === SyntaxKind.CallExpression || parent.kind === SyntaxKind.NewExpression) && parent.expression === n) return;
		if (n.kind === SyntaxKind.Identifier) {
			if (parent.kind === SyntaxKind.PropertyAccessExpression && parent.name === n) return;
			if (DECLARING.has(parent.kind) && parent.name === n) return;
			if ([SyntaxKind.TypeReference, SyntaxKind.QualifiedName, SyntaxKind.ExpressionWithTypeArguments, SyntaxKind.TypeQuery, SyntaxKind.ImportSpecifier, SyntaxKind.ExportSpecifier, SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxClosingElement, SyntaxKind.BindingElement].includes(parent.kind)) return;
			if (parent.kind === SyntaxKind.BinaryExpression && (parent.operatorToken as Node).kind === SyntaxKind.InstanceOfKeyword) return;
		}
		if (parent.kind === SyntaxKind.ExpressionStatement || parent.kind === SyntaxKind.VoidExpression || parent.kind === SyntaxKind.TypeOfExpression) return;
		out.push(n);
	});
	return out;
}

/** A host value goes only into the host's types: outside the drivers into nothing else, in a driver never into `any`, `unknown` or `object`. */
function flowRules(path: string, sf: SourceFile, checker: Checker): Violation[] {
	const place = placeOf(path);
	if (place.part === null) return [];
	const inDriver = place.part === "drivers";
	const host = new HostTypes(checker);
	const nodes = wholeValues(sf);
	if (nodes.length === 0) return [];
	const types = checker.getTypeAtLocation(nodes);
	const out: Violation[] = [];
	nodes.forEach((n, i) => {
		if (!host.carries(types[i])) return;
		let into: Type | undefined;
		try {
			into = checker.getContextualType(n as unknown as Parameters<Checker["getContextualType"]>[0]);
		} catch {
			into = undefined;
		}
		const parent = n.parent as AnyNode;
		const isArgument = (parent.kind === SyntaxKind.CallExpression || parent.kind === SyntaxKind.NewExpression) && (parent.arguments as unknown as Node[] | undefined)?.includes(n);
		if (isArgument && !inDriver) {
			const declared = declaredParameter(checker, parent, (parent.arguments as unknown as Node[]).indexOf(n));
			if (declared && !host.carries(declared.type) && !declared.library) into = declared.type;
		}
		if (!into) return;
		const leaves = inDriver ? untypedTarget(into, checker) : untypedTarget(into, checker) || !host.carries(into);
		if (leaves) out.push({ path, rule: "a host value leaving the host's types", what: `«${text(sf, n)}» (${typeName(types[i])[0] ?? "a host type"}) goes into ${typeName(into)[0] ?? (into.flags & TypeFlags.Unknown ? "unknown" : into.flags & TypeFlags.Any ? "any" : "a type of its own")}${inDriver ? "" : ": outside the drivers a host value stays in the host's types"}` });
	});
	return out;
}

/** The parameter a call's argument meets as its function declares it (before inference): a generic `T` stays `T`. */
function declaredParameter(checker: Checker, call: AnyNode, index: number): { type: Type | undefined; library: boolean } | null {
	let signature: Signature | undefined;
	try {
		signature = checker.getResolvedSignature(call);
	} catch {
		return null;
	}
	if (!signature) return null;
	const declared = signature.getTarget() ?? signature;
	const params = declared.getParameters();
	if (params.length === 0) return null;
	const param = params[Math.min(index, params.length - 1)];
	const file = fileOf(param);
	const library = STD_LIB.test(file) || HOST_FILE.test(file) || PREACT_FILE.test(file) || file.startsWith(`${NEXT}/drivers/`);
	const type = checker.getTypeOfSymbol(param);
	if (type && index >= params.length - 1 && declared.hasRestParameter && checker.isArrayType(type)) {
		const element = type.isTypeReference() ? checker.getTypeArguments(type)[0] : undefined;
		return { type: element ?? type, library };
	}
	return { type, library };
}

// Views: no style, states as literal is- classes --------------------------------------------------------------------

const tokens = (s: string) => s.split(/\s+/).filter((t) => t !== "");

/**
 * What a class expression may be: each a set of the classes it gives, or null when a name is made at run time. Read from
 * the text (literals, conditions, templates, a list joined), and where the text says no more, from the type: a value
 * typed as string literals (`cls: "tc-n-icon" | "tc-n-icon is-on"`) gives exactly those.
 */
function classAlternatives(n: AnyNode | undefined, checker: Checker, depth = 0): string[][] | null {
	if (!n || depth > 8) return null;
	const byType = (): string[][] | null => {
		const values = literalsOf(checker.getTypeAtLocation(n));
		return values && values.every((v) => typeof v === "string") ? values.map((v) => tokens(String(v))) : null;
	};
	switch (n.kind) {
		case SyntaxKind.StringLiteral:
		case SyntaxKind.NoSubstitutionTemplateLiteral:
			return [tokens(String(n.text))];
		case SyntaxKind.ParenthesizedExpression:
		case SyntaxKind.JsxExpression:
			return classAlternatives(n.expression as AnyNode, checker, depth + 1);
		case SyntaxKind.ConditionalExpression: {
			const a = classAlternatives(n.whenTrue as AnyNode, checker, depth + 1);
			const b = classAlternatives(n.whenFalse as AnyNode, checker, depth + 1);
			return a && b ? [...a, ...b] : null;
		}
		case SyntaxKind.FalseKeyword:
		case SyntaxKind.NullKeyword:
		case SyntaxKind.UndefinedKeyword:
			return [[]];
		case SyntaxKind.Identifier:
			return n.text === "undefined" ? [[]] : byType();
		case SyntaxKind.BinaryExpression: {
			const op = (n.operatorToken as Node).kind;
			if (op === SyntaxKind.AmpersandAmpersandToken) {
				const right = classAlternatives(n.right as AnyNode, checker, depth + 1);
				return right ? [...right, []] : null;
			}
			if (op === SyntaxKind.BarBarToken || op === SyntaxKind.QuestionQuestionToken) {
				const a = classAlternatives(n.left as AnyNode, checker, depth + 1);
				const b = classAlternatives(n.right as AnyNode, checker, depth + 1);
				return a && b ? [...a, ...b] : null;
			}
			if (op === SyntaxKind.PlusToken) return joined([n.left as AnyNode, n.right as AnyNode], checker, depth, false);
			return byType();
		}
		case SyntaxKind.TemplateExpression: {
			const parts: (string | AnyNode)[] = [String((n.head as AnyNode).text)];
			for (const span of n.templateSpans as unknown as AnyNode[]) parts.push(span.expression as AnyNode, String((span.literal as AnyNode).text));
			for (let i = 1; i < parts.length; i += 2) {
				const before = parts[i - 1] as string;
				const after = parts[i + 1] as string;
				if ((before !== "" && !/\s$/.test(before)) || (after !== "" && !/^\s/.test(after))) return null;
			}
			let out: string[][] = [[]];
			for (const p of parts) {
				const alts = typeof p === "string" ? [tokens(p)] : classAlternatives(p, checker, depth + 1);
				if (!alts) return null;
				out = out.flatMap((o) => alts.map((a) => [...o, ...a])).slice(0, 256);
			}
			return out;
		}
		case SyntaxKind.CallExpression: {
			const callee = n.expression as AnyNode;
			if (callee.kind !== SyntaxKind.PropertyAccessExpression || String((callee.name as AnyNode).text) !== "join") return byType();
			const sep = literal((n.arguments as unknown as Node[])[0]);
			if (sep === null || sep.trim() !== "" || sep === "") return null;
			let list = callee.expression as AnyNode;
			if (list.kind === SyntaxKind.CallExpression && (list.expression as AnyNode).kind === SyntaxKind.PropertyAccessExpression && String(((list.expression as AnyNode).name as AnyNode).text) === "filter") list = (list.expression as AnyNode).expression as AnyNode;
			if (list.kind !== SyntaxKind.ArrayLiteralExpression) return null;
			return joined(list.elements as unknown as AnyNode[], checker, depth, true);
		}
		default:
			return byType();
	}
}

function joined(parts: readonly AnyNode[], checker: Checker, depth: number, spaced: boolean): string[][] | null {
	let out: string[][] = [[]];
	for (const p of parts) {
		const alts = classAlternatives(p, checker, depth + 1);
		if (!alts) return null;
		if (!spaced && p.kind !== SyntaxKind.StringLiteral) return null;
		out = out.flatMap((o) => alts.map((a) => [...o, ...a])).slice(0, 256);
	}
	return out;
}

/** The classes a class expression gives only sometimes must be is- states; a name made at run time is refused. */
function classProblem(n: AnyNode, checker: Checker): string | null {
	const alts = classAlternatives(n, checker);
	if (!alts) return "a class named at run time (a view gives its component's classes as literals and its states as literal is-… classes)";
	const all = new Set(alts.flat());
	const always = [...all].filter((t) => alts.every((a) => a.includes(t)));
	const sometimes = [...all].filter((t) => !always.includes(t));
	const bad = sometimes.filter((t) => !/^is-[\w-]+$/.test(t));
	return bad.length ? `a class given only sometimes that is not an is- state: ${bad.join(", ")} (a state is an is-… class)` : null;
}

const FORBIDDEN_PROPS = ["style", "dangerouslySetInnerHTML"];
const CLASS_PROPS = ["class", "className"];

/** A view's JSX and `h()`: no `style`, no inner HTML, a spread carrying neither; classes by `classProblem`. */
function viewRules(path: string, sf: SourceFile, checker: Checker): Violation[] {
	const out: Violation[] = [];
	const spreads: AnyNode[] = [];
	const calls: AnyNode[] = [];
	const isView = placeOf(path).part === "view";
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.JsxAttribute) {
			const name = String((n.name as AnyNode).text);
			if (FORBIDDEN_PROPS.includes(name)) out.push({ path, rule: "JSX style", what: `«${text(sf, n)}»` });
			if (isView && CLASS_PROPS.includes(name) && n.initializer) {
				const problem = classProblem(n.initializer as AnyNode, checker);
				if (problem) out.push({ path, rule: "view classes", what: `${problem} «${text(sf, n)}»` });
			}
		}
		if (n.kind === SyntaxKind.JsxSpreadAttribute) spreads.push(n);
		if (n.kind === SyntaxKind.CallExpression) calls.push(n);
	});
	if (spreads.length) {
		const types = checker.getTypeAtLocation(spreads.map((s) => s.expression as Node));
		spreads.forEach((s, i) => {
			const type = types[i];
			if (type && ((type.flags & ANY) !== 0 || FORBIDDEN_PROPS.some((p) => checker.getPropertyOfType(type, p)))) out.push({ path, rule: "JSX style", what: `a spread carrying style «${text(sf, s)}»` });
		});
	}
	if (calls.length) {
		const callees = checker.getTypeAtLocation(calls.map((c) => c.expression as Node));
		calls.forEach((c, i) => {
			const symbol = callees[i]?.getSymbol();
			if (!symbol || !PREACT_FILE.test(fileOf(symbol)) || !["h", "createElement", "cloneElement"].includes(symbol.name)) return;
			const props = (c.arguments as unknown as AnyNode[])[1];
			if (!props) return;
			const type = checker.getTypeAtLocation(props);
			if (type && ((type.flags & ANY) !== 0 || FORBIDDEN_PROPS.some((p) => checker.getPropertyOfType(type, p)))) out.push({ path, rule: "JSX style", what: `${symbol.name}() given style «${text(sf, c)}»` });
			if (isView && props.kind === SyntaxKind.ObjectLiteralExpression)
				for (const p of props.properties as unknown as AnyNode[]) {
					const key = p.name as AnyNode | undefined;
					const name = key ? String(key.text ?? literal(key as Node) ?? "") : "";
					if (p.kind === SyntaxKind.PropertyAssignment && CLASS_PROPS.includes(name)) {
						const problem = classProblem(p.initializer as AnyNode, checker);
						if (problem) out.push({ path, rule: "view classes", what: `${problem} «${text(sf, p)}»` });
					}
				}
		});
	}
	return out;
}

// Messages ----------------------------------------------------------------------------------------------------------

const endsInAssertNever = (sw: AnyNode): boolean => {
	const clauses = ((sw.caseBlock as AnyNode).clauses as unknown as AnyNode[]) ?? [];
	const def = clauses.find((c) => c.kind === SyntaxKind.DefaultClause);
	if (!def) return false;
	let found = false;
	walk(def, (n) => {
		if (n.kind === SyntaxKind.CallExpression && (n.expression as AnyNode).kind === SyntaxKind.Identifier && (n.expression as AnyNode).text === "assertNever") found = true;
	});
	return found;
};

const isMsgName = (name: string) => /Msg$/.test(name);

/** The literal values a type stands for (`"a" | "b"`), or null when it is not made of literals. */
function literalsOf(type: Type | undefined): (string | number)[] | null {
	if (!type) return null;
	const parts = type.isUnionType() ? (type.getTypes() ?? []) : [type];
	const out: (string | number)[] = [];
	for (const p of parts) {
		if ((p.flags & (TypeFlags.StringLiteral | TypeFlags.NumberLiteral)) !== 0) out.push((p as unknown as { value: string | number }).value);
		else return null;
	}
	return out.length ? out : null;
}

/** Every message union's discriminants: for each `…Msg` type, the literal values of each field every member has as a literal. */
function discriminants(sfs: readonly SourceFile[], checker: Checker): { msg: string; values: Set<string | number> }[] {
	const names: AnyNode[] = [];
	for (const sf of sfs)
		walk(sf, (n) => {
			if ((n.kind === SyntaxKind.TypeAliasDeclaration || n.kind === SyntaxKind.InterfaceDeclaration) && isMsgName(String((n.name as AnyNode).text))) names.push(n.name as AnyNode);
		});
	if (names.length === 0) return [];
	const symbols = checker.getSymbolAtLocation(names);
	const out: { msg: string; values: Set<string | number> }[] = [];
	symbols.forEach((symbol, i) => {
		if (!symbol) return;
		const type = checker.getDeclaredTypeOfSymbol(symbol);
		const members = type.isUnionType() ? (type.getTypes() ?? []) : [type];
		const fields = new Map<string, (string | number)[][]>();
		for (const m of members) {
			const props = checker.getPropertiesOfType(m);
			const types = props.length ? checker.getTypeOfSymbol(props) : [];
			props.forEach((p, j) => {
				const values = literalsOf(types[j]);
				if (values) fields.set(p.name, [...(fields.get(p.name) ?? []), values]);
			});
		}
		for (const [, lists] of fields) if (lists.length === members.length) out.push({ msg: String(names[i].text), values: new Set(lists.flat()) });
	});
	return out;
}

/** Every switch over a message's discriminant ends in `assertNever`: found by the subject's type, through any variable. */
function messageRules(path: string, sf: SourceFile, checker: Checker, unions: readonly { msg: string; values: Set<string | number> }[]): { violations: Violation[]; proven: number } {
	const switches: AnyNode[] = [];
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.SwitchStatement) switches.push(n);
	});
	if (switches.length === 0) return { violations: [], proven: 0 };
	const subjects = switches.map((s) => s.expression as AnyNode);
	const types = checker.getTypeAtLocation(subjects);
	const members = subjects.filter((e) => e.kind === SyntaxKind.PropertyAccessExpression || e.kind === SyntaxKind.ElementAccessExpression);
	const objectTypes = members.length ? checker.getTypeAtLocation(members.map((e) => e.expression as Node)) : [];
	const out: Violation[] = [];
	let proven = 0;
	switches.forEach((sw, i) => {
		const subject = subjects[i];
		const m = members.indexOf(subject);
		const viaObject = m >= 0 ? typeName(objectTypes[m]).find(isMsgName) : undefined;
		const values = literalsOf(types[i]);
		const viaType = values ? unions.find((u) => values.every((v) => u.values.has(v)))?.msg : undefined;
		const msg = viaObject ?? viaType;
		if (!msg) return;
		if (endsInAssertNever(sw)) proven++;
		else out.push({ path, rule: "messages", what: `a switch over ${msg} without default: assertNever(…) «${text(sf, sw).slice(0, 40)}»` });
	});
	return { violations: out, proven };
}

function declaresMsg(sf: SourceFile): boolean {
	let found = false;
	walk(sf, (n) => {
		if ((n.kind === SyntaxKind.TypeAliasDeclaration || n.kind === SyntaxKind.InterfaceDeclaration) && isMsgName(String((n.name as AnyNode).text))) found = true;
	});
	return found;
}

// The analysis ------------------------------------------------------------------------------------------------------

export interface Analysis {
	readonly violations: readonly Violation[];
	/** Files declaring a `…Msg` type, and how many switches over one `update/` proves exhaustive. */
	readonly declaresMsg: readonly string[];
	readonly provenInUpdate: number;
	readonly files: readonly string[];
}

export interface AnalyseOptions {
	/** Modules outside `next/` the samples may import (the self-tests' givens); never used for the real tree. */
	readonly given?: readonly string[];
}

/** Every file under `next/`, from the disk and from `extra` (the self-tests' samples): every kind, so a `.js` is seen. */
function nextFiles(extra: readonly Source[]): Source[] {
	const dir = join(ROOT, NEXT);
	const real = existsSync(dir)
		? readdirSync(dir, { recursive: true, withFileTypes: true })
				.filter((e) => e.isFile() || e.isSymbolicLink())
				.map((e) => `${relative(ROOT, join(e.parentPath, e.name)).split("\\").join("/")}`)
				.map((path) => ({ path, text: /\.(ts|tsx)$/.test(path) ? readFileSync(join(ROOT, path), "utf8") : "" }))
		: [];
	return [...real.filter((r) => !extra.some((e) => e.path === r.path)), ...extra];
}

/** Reads every file of `next/` (and the samples given) with the compiler and answers every rule it breaks. */
export function analyse(extra: readonly Source[] = [], options: AnalyseOptions = {}): Analysis {
	const files = nextFiles(extra);
	const given = options.given ?? [];
	const program = new TsProgram(ROOT, [MAIN_CONFIG, PURE_CONFIG], new Map(extra.filter((s) => /\.tsx?$/.test(s.path)).map((s) => [join(ROOT, s.path), s.text])));
	try {
		const main = program.project(MAIN_CONFIG);
		const pure = program.project(PURE_CONFIG);
		const violations: Violation[] = [];
		const msgs: string[] = [];
		let provenInUpdate = 0;
		const sources: { file: Source; sf: SourceFile }[] = [];
		for (const file of files) {
			const abs = join(ROOT, file.path);
			const place = placeOf(file.path);
			if (place.part === null) violations.push({ path: file.path, rule: "places", what: "in no part of next/ (model, update, recognizers, view, drivers/<driver>, host)" });
			else if (place.part === "drivers" && place.driver === null) violations.push({ path: file.path, rule: "places", what: `in no driver the spec names (${DRIVERS.join(", ")})` });
			if (!/\.tsx?$/.test(file.path) || /\.d\.[cm]?tsx?$/.test(file.path)) {
				violations.push({ path: file.path, rule: "places", what: "next/ holds only .ts and .tsx: any other file (a .js, a .d.ts) escapes the compiler's reading" });
				continue;
			}
			const sf = main.program.getSourceFile(abs);
			if (!sf) {
				violations.push({ path: file.path, rule: "places", what: "not in the project tsconfig.json compiles" });
				continue;
			}
			sources.push({ file, sf });
		}
		const unions = discriminants(
			sources.map((s) => s.sf),
			main.checker,
		);
		for (const { file, sf } of sources) {
			const abs = join(ROOT, file.path);
			const place = placeOf(file.path);
			violations.push(...importRules(file.path, sf, given), ...hostRules(file.path, sf, main.checker), ...flowRules(file.path, sf, main.checker), ...viewRules(file.path, sf, main.checker));
			const m = messageRules(file.path, sf, main.checker, unions);
			violations.push(...m.violations);
			if (place.part === "update") provenInUpdate += m.proven;
			if (declaresMsg(sf)) msgs.push(file.path);
			if (isPure(file.path)) {
				if (!pure.program.getSourceFile(abs)) violations.push({ path: file.path, rule: "purity", what: "not in the pure project (tsconfig.next-pure.json)" });
				else
					for (const d of [...pure.program.getSyntacticDiagnostics(abs), ...pure.program.getSemanticDiagnostics(abs)])
						violations.push({ path: file.path, rule: "purity", what: `does not compile without the DOM and the host: ${d.text}` });
			}
		}
		return { violations, declaresMsg: msgs, provenInUpdate, files: files.map((f) => f.path) };
	} finally {
		program.close();
	}
}
