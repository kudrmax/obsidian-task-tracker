import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type Node, type SourceFile, SyntaxKind } from "typescript/unstable/ast";
import { type Checker, type Symbol as TsSymbol, type Type, TypeFlags } from "typescript/unstable/sync";
import { TsProgram } from "./guards/TsProgram";

/**
 * The rules of the new screens (`obsidian/ui/next`, spec §Guards), read the way the compiler reads the code rather than
 * as text:
 *
 * - The pure parts (model, update, recognizers) compile in a project of their own with no DOM and no host
 *   (`obsidian/ui/next/tsconfig.pure.json`): a window, a document, a timer or an element cannot be named there at all.
 * - Everywhere in `next/`, every name and member is resolved to its declaration by TypeScript: an alias
 *   (`const s = el.style`), a string key (`win["requestAnimationFrame"]`), a destructuring (`const { replica } = runtime`)
 *   or a template literal all end at the same declaration (`CSSStyleProperties.height`, `Window.requestAnimationFrame`…),
 *   and the table below says which part may reach it.
 * - A switch over a message (a type named `…Msg`) ends in `assertNever`, found by the subject's type, not its name.
 */

export const ROOT = resolve(__dirname, "..");
export const NEXT = "obsidian/ui/next";
export const MAIN_CONFIG = join(ROOT, "tsconfig.json");
export const PURE_CONFIG = join(ROOT, NEXT, "tsconfig.pure.json");

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
	const name = rest[1].replace(/\.[cm]?tsx?$/, "");
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

/** A reach of the code into something declared outside it: a member of a declared type, or a global. */
export interface Reach {
	/** The interface or class declaring it (`CSSStyleProperties`, `Element`, `Window`…); null for a global. */
	readonly owner: string | null;
	readonly name: string;
	/** The file declaring it, from the repository's root or as `node_modules/…`. */
	readonly file: string;
	/** The reach is written to (an assignment's target, `++`). */
	readonly write: boolean;
	/** The first argument when the reach is called with a string literal; `dynamic` when called with anything else. */
	readonly firstArg: string | null | "dynamic";
	readonly called: boolean;
	readonly at: string;
}

const HOST_FILE = /(^|\/)(lib\.[\w.]*d\.ts|node_modules\/@types\/node\/.*|node_modules\/obsidian\/obsidian\.d\.ts)$/;
const isHost = (r: Reach): boolean => HOST_FILE.test(r.file);
const member = (owners: readonly string[], names: readonly string[] | "*") => (r: Reach) =>
	isHost(r) && r.owner !== null && owners.includes(r.owner) && (names === "*" || names.includes(r.name));
const globalNamed = (names: readonly string[]) => (r: Reach) => isHost(r) && (r.owner === null || ["Window", "WindowOrWorkerGlobalScope", "AnimationFrameProvider", "globalThis"].includes(r.owner)) && names.includes(r.name);

/** A piece of host work and the drivers that own it; `nowhere` for what no part of `next/` may do. */
export interface HostWork {
	readonly what: string;
	readonly owners: readonly Driver[] | "nowhere" | "impure";
	readonly matches: (r: Reach) => boolean;
}

const TIMERS = ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "queueMicrotask", "setImmediate", "clearImmediate"];
const attribute = (names: RegExp) => (r: Reach) =>
	member(["Element"], ["setAttribute", "removeAttribute", "toggleAttribute", "setAttributeNS", "removeAttributeNS", "getAttribute", "getAttributeNS", "hasAttribute"])(r) && typeof r.firstArg === "string" && r.firstArg !== "dynamic" && names.test(r.firstArg);

export const HOST_WORK: readonly HostWork[] = [
	{ what: "a bare window or document (a popout has its own: reach it from the element)", owners: "nowhere", matches: globalNamed(["window", "document", "globalThis", "self", "activeDocument", "activeWindow", "top", "parent", "frames", "location", "history", "navigator", "screen"]) },
	{ what: "a timer or a frame", owners: [...DRIVERS], matches: (r) => globalNamed(TIMERS)(r) },
	{ what: "the door or the replica (the runtime's)", owners: "nowhere", matches: (r) => /^(core\/application\/(PhoneCalls|PhoneDoor)\.ts|obsidian\/runtime\/replica\/)/.test(r.file) || (r.owner === "Runtime" && r.name === "replica") },
	{ what: "an inline style", owners: ["motion"], matches: (r) => member(["CSSStyleDeclaration", "CSSStyleProperties", "CSS2Properties"], "*")(r) || member(["ElementCSSInlineStyle"], ["style"])(r) || member(["HTMLElement", "SVGElement", "Element"], ["setCssStyles", "setCssProps"])(r) || attribute(/^style$/)(r) || member(["Element"], ["attributeStyleMap"])(r) },
	{ what: "an animation", owners: ["motion"], matches: (r) => member(["Animatable", "Element", "Document", "DocumentOrShadowRoot"], ["animate", "getAnimations"])(r) || member(["Animation", "KeyframeEffect", "AnimationEffect", "AnimationTimeline", "DocumentTimeline"], "*")(r) || globalNamed(["Animation", "KeyframeEffect"])(r) },
	{
		what: "a geometry read",
		owners: ["motion", "measure"],
		matches: (r) =>
			member(["Element"], ["getBoundingClientRect", "getClientRects", "clientWidth", "clientHeight", "clientTop", "clientLeft", "scrollWidth", "scrollHeight", "checkVisibility"])(r) ||
			(member(["Element"], ["scrollTop", "scrollLeft"])(r) && !r.write) ||
			member(["HTMLElement"], ["offsetWidth", "offsetHeight", "offsetTop", "offsetLeft", "offsetParent"])(r) ||
			member(["Range"], ["getBoundingClientRect", "getClientRects"])(r) ||
			member(["VisualViewport", "Screen"], "*")(r) ||
			member(["Document", "DocumentOrShadowRoot"], ["elementFromPoint", "elementsFromPoint", "caretRangeFromPoint", "caretPositionFromPoint"])(r) ||
			globalNamed(["getComputedStyle", "innerWidth", "innerHeight", "outerWidth", "outerHeight", "devicePixelRatio", "visualViewport", "scrollX", "scrollY", "pageXOffset", "pageYOffset", "screenX", "screenY", "screenLeft", "screenTop"])(r),
	},
	{ what: "a scroll", owners: ["scroll"], matches: (r) => (member(["Element"], ["scrollTop", "scrollLeft"])(r) && r.write) || member(["Element", "Window", "HTMLElement"], ["scroll", "scrollTo", "scrollBy", "scrollIntoView", "scrollIntoViewIfNeeded"])(r) || globalNamed(["scroll", "scrollTo", "scrollBy"])(r) },
	{ what: "a focus", owners: ["focus"], matches: (r) => member(["HTMLOrSVGElement", "HTMLElement", "SVGElement", "Window", "Element"], ["focus", "blur"])(r) || globalNamed(["focus", "blur"])(r) },
	{ what: "an observer", owners: ["measure"], matches: (r) => globalNamed(["ResizeObserver", "IntersectionObserver", "MutationObserver", "PerformanceObserver"])(r) || member(["ResizeObserver", "IntersectionObserver", "MutationObserver"], "*")(r) },
	{ what: "the platform, the theme or the viewport's media", owners: ["chrome"], matches: (r) => globalNamed(["matchMedia"])(r) || member(["MediaQueryList"], "*")(r) },
	{
		what: "a class or dataset write",
		owners: ["chrome"],
		matches: (r) =>
			member(["DOMTokenList"], ["add", "remove", "toggle", "replace"])(r) ||
			(member(["Element"], ["className"])(r) && r.write) ||
			(r.owner === "DOMStringMap" && r.write) ||
			member(["HTMLElement", "Element", "SVGElement"], ["addClass", "addClasses", "removeClass", "removeClasses", "toggleClass", "setCls"])(r) ||
			attribute(/^(class|data-[\w-]+)$/)(r),
	},
	{
		what: "a class that is not a literal is-… state (the CSS reads every class chrome writes as a state)",
		owners: "nowhere",
		matches: (r) =>
			(member(["DOMTokenList"], ["add", "remove", "toggle", "replace"])(r) || member(["HTMLElement", "Element", "SVGElement"], ["addClass", "removeClass", "toggleClass"])(r)) &&
			r.called &&
			!(typeof r.firstArg === "string" && r.firstArg !== "dynamic" && /^is-[\w-]+$/.test(r.firstArg)),
	},
	{
		what: "a class read (no code reads a class to decide: the model holds the fact)",
		owners: "nowhere",
		matches: (r) =>
			member(["DOMTokenList"], ["contains", "value", "item", "length", "forEach", "entries", "keys", "values", "supports"])(r) ||
			(member(["Element"], ["className"])(r) && !r.write) ||
			member(["HTMLElement", "Element", "SVGElement"], ["hasClass"])(r) ||
			(member(["Element"], ["getAttribute", "hasAttribute", "getAttributeNS"])(r) && r.firstArg === "class") ||
			member(["Element", "Document", "ParentNode"], ["getElementsByClassName"])(r),
	},
	{ what: "the class list taken whole (spread, iterated, passed on)", owners: "nowhere", matches: (r) => member(["Element"], ["classList"])(r) && r.firstArg === null && !r.called && r.at === "whole" },
	{ what: "an attribute named at run time", owners: "nowhere", matches: (r) => member(["Element"], ["setAttribute", "removeAttribute", "toggleAttribute", "getAttribute", "hasAttribute", "setAttributeNS"])(r) && r.called && r.firstArg === "dynamic" },
	{ what: "a selector that is not a literal, or that names a class", owners: "nowhere", matches: (r) => member(["Element", "ParentNode", "Document", "DocumentFragment", "DocumentOrShadowRoot"], ["matches", "closest", "querySelector", "querySelectorAll", "webkitMatchesSelector"])(r) && r.called && (r.firstArg === "dynamic" || (typeof r.firstArg === "string" && /\.[A-Za-z_-]/.test(r.firstArg.replace(/\[[^\]]*\]|"[^"]*"|'[^']*'/g, "")))) },
	{ what: "a key scope", owners: ["keys"], matches: (r) => (r.name === "Scope" && /obsidian\.d\.ts$/.test(r.file)) || member(["Keymap"], ["pushScope", "popScope"])(r) || member(["App"], ["scope"])(r) || member(["Scope"], "*")(r) },
	{ what: "a listener on the DOM (a view takes events through JSX)", owners: [...DRIVERS], matches: (r) => member(["EventTarget"], ["addEventListener", "removeEventListener"])(r) || (member(["GlobalEventHandlers", "WindowEventHandlers", "DocumentAndElementEventHandlers", "HTMLElement", "Element", "Window", "Document"], "*")(r) && /^on[a-z]+$/.test(r.name) && r.write) || member(["HTMLElement", "Element", "Document", "Window"], ["registerDomEvent", "onClickEvent", "on", "off"])(r) },
	{ what: "the clock or chance in a pure part", owners: "impure", matches: (r) => member(["DateConstructor"], ["now"])(r) || member(["Math"], ["random"])(r) || member(["Performance"], ["now"])(r) || (r.name === "Date" && r.owner === null && r.called && r.firstArg === null && r.at === "new") },
];

/** Whether `part`/`driver` may do `work`. */
function allowed(work: HostWork, place: Place): boolean {
	if (work.owners === "nowhere") return false;
	if (work.owners === "impure") return !isPure(`${NEXT}/${place.part}/x.ts`);
	return place.part === "drivers" && place.driver !== null && work.owners.includes(place.driver);
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
	if (parent.kind === SyntaxKind.ShorthandPropertyAssignment || parent.kind === SyntaxKind.PropertyAssignment) {
		// `Object.assign(el.style, …)` writes into its first argument: its target is written.
		return false;
	}
	return false;
};

/** How a reach is used: called (and with what first argument), or taken whole. */
function useOf(n: AnyNode): { called: boolean; firstArg: string | null | "dynamic"; at: string } {
	const parent = n.parent as AnyNode;
	if (parent.kind === SyntaxKind.CallExpression && parent.expression === n) {
		const args = parent.arguments as unknown as Node[];
		return { called: true, firstArg: args.length === 0 ? null : (literal(args[0]) ?? "dynamic"), at: "call" };
	}
	if (parent.kind === SyntaxKind.NewExpression && parent.expression === n) {
		const args = (parent.arguments as unknown as Node[] | undefined) ?? [];
		return { called: true, firstArg: args.length === 0 ? null : (literal(args[0]) ?? "dynamic"), at: "new" };
	}
	const isMemberObject = (parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === n;
	return { called: false, firstArg: null, at: isMemberObject ? "member" : "whole" };
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
	readonly binding?: boolean;
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
			found.push({ node: n, at: null, through: { object: n.parent as Node, name: String(key.text ?? literal(key as Node) ?? "") }, binding: true });
		} else if (n.kind === SyntaxKind.Identifier) {
			const parent = n.parent as AnyNode;
			const isName =
				(parent.kind === SyntaxKind.PropertyAccessExpression && parent.name === n) ||
				([SyntaxKind.PropertyAssignment, SyntaxKind.PropertyDeclaration, SyntaxKind.PropertySignature, SyntaxKind.MethodDeclaration, SyntaxKind.MethodSignature, SyntaxKind.BindingElement, SyntaxKind.VariableDeclaration, SyntaxKind.Parameter, SyntaxKind.FunctionDeclaration, SyntaxKind.ClassDeclaration, SyntaxKind.InterfaceDeclaration, SyntaxKind.TypeAliasDeclaration, SyntaxKind.ImportSpecifier, SyntaxKind.ImportClause, SyntaxKind.NamespaceImport, SyntaxKind.ExportSpecifier, SyntaxKind.JsxAttribute, SyntaxKind.EnumMember, SyntaxKind.LabeledStatement].includes(parent.kind) &&
					parent.name === n) ||
				parent.kind === SyntaxKind.QualifiedName ||
				parent.kind === SyntaxKind.TypeReference;
			if (!isName) found.push({ node: n, at: n });
		}
	});
	const direct = found.filter((f) => f.at !== null);
	const symbols = direct.length ? checker.getSymbolAtLocation(direct.map((f) => f.at as Node)) : [];
	const bySymbol = new Map(direct.map((f, i) => [f, symbols[i]]));
	const throughs = found.filter((f) => f.through);
	const objectTypes = throughs.length ? checker.getTypeAtLocation(throughs.map((f) => f.through!.object)) : [];
	const accessObjects = found.filter((f) => f.node.kind === SyntaxKind.PropertyAccessExpression || f.node.kind === SyntaxKind.ElementAccessExpression).map((f) => f.node.expression as Node);
	const accessTypes = accessObjects.length ? checker.getTypeAtLocation(accessObjects) : [];
	const out: (Reach & { node: AnyNode })[] = [];
	let access = 0;
	found.forEach((f) => {
		let symbol: TsSymbol | undefined;
		let objectType: Type | undefined;
		if (f.node.kind === SyntaxKind.PropertyAccessExpression || f.node.kind === SyntaxKind.ElementAccessExpression) objectType = accessTypes[access++];
		if (f.through) {
			const type = objectTypes[throughs.indexOf(f)];
			if (type && f.through.name) symbol = checker.getPropertyOfType(type, f.through.name);
			if (!symbol && f.node.kind === SyntaxKind.ElementAccessExpression && type) {
				const host = typeName(type).some(() => HOST_FILE.test(fileOf(type.getSymbol())));
				if (host || (type.flags & ANY) !== 0)
					out.push({ owner: typeName(type)[0] ?? "any", name: `[${text(sf, f.node.argumentExpression as Node)}]`, file: "computed", write: false, firstArg: null, called: false, at: "member", node: f.node });
			}
		} else symbol = bySymbol.get(f);
		if (objectType && (objectType.flags & ANY) !== 0) out.push({ owner: "any", name: text(sf, f.node), file: "untyped", write: false, firstArg: null, called: false, at: "member", node: f.node });
		if (!symbol) return;
		const owner = symbol.getParent()?.name ?? null;
		const use = useOf(f.node);
		const write = isAssignmentTarget(f.node) || writesInto(f.node);
		out.push({ owner: owner === undefined ? null : owner, name: symbol.name, file: fileOf(symbol), write, ...use, node: f.node });
		// A member read and then written through (`el.style.height = …`, `el.dataset.x = …`): the object's type is written.
		if (!write && f.node.kind !== SyntaxKind.Identifier) {
			const parent = f.node.parent as AnyNode;
			if ((parent.kind === SyntaxKind.PropertyAccessExpression || parent.kind === SyntaxKind.ElementAccessExpression) && parent.expression === f.node && isAssignmentTarget(parent)) {
				const objectNames = typeName(checker.getTypeAtLocation(f.node as Node));
				if (objectNames.includes("DOMStringMap")) out.push({ owner: "DOMStringMap", name: "*", file: "lib.dom.d.ts", write: true, firstArg: null, called: false, at: "member", node: parent });
			}
		}
	});
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
		} else if (n.kind === SyntaxKind.CallExpression) {
			const callee = n.expression as AnyNode;
			const isImport = callee.kind === SyntaxKind.ImportKeyword || (callee.kind === SyntaxKind.Identifier && callee.text === "require");
			if (isImport) {
				const spec = literal((n.arguments as unknown as Node[])[0]);
				out.push({ target: spec === null ? "<a module named at run time>" : resolveTarget(spec), values: ["*"], typeOnly: false });
			}
		}
	});
	return out;
}

function importRules(path: string, sf: SourceFile): Violation[] {
	const v = (what: string): Violation => ({ path, rule: "imports", what });
	const { part } = placeOf(path);
	const out: Violation[] = [];
	for (const imp of importsOf(sf, path)) {
		const t = imp.target;
		if (t.startsWith("<")) out.push(v(`imports ${t}`));
		if (t.startsWith("core/") && t !== CONTRACTS && !imp.typeOnly) out.push(v(`imports the core's ${t}`));
		if (t === CONTRACTS) for (const name of imp.values) if (!PURE_RULES.includes(name)) out.push(v(`imports ${name} of the core, not a pure rule`));
		if (t.startsWith("obsidian/runtime/") && !(part === "host" && t === "obsidian/runtime/Runtime.ts")) out.push(v(`imports the runtime's ${t}`));
		if (t.startsWith("obsidian/") && !t.startsWith(`${NEXT}/`) && !t.startsWith("obsidian/runtime/")) out.push(v(`imports the old screen or the plugin's ${t}`));
		if (part && isPure(`${NEXT}/${part}/x.ts`)) {
			if (t === "obsidian" || t.startsWith("@codemirror/") || t === "electron" || t.startsWith("preact")) out.push(v(`a pure part imports ${t}`));
			if (t.startsWith(`${NEXT}/drivers/`) || t.startsWith(`${NEXT}/host/`) || t.startsWith(`${NEXT}/view/`)) out.push(v(`a pure part imports ${t}`));
		}
		if (part === "view" && !imp.typeOnly && imp.values.length > 0 && !(t.startsWith("preact") || t.startsWith(`${NEXT}/view/`) || t.startsWith(`${NEXT}/model/`)))
			out.push(v(`a view imports ${imp.values.join(", ")} of ${t}: only selectors and dispatch`));
		if (part === "view" && (t === "obsidian" || t.startsWith(`${NEXT}/drivers/`) || t.startsWith(`${NEXT}/host/`))) out.push(v(`a view imports ${t}`));
	}
	return out;
}

function hostRules(path: string, sf: SourceFile, checker: Checker): Violation[] {
	const place = placeOf(path);
	const out: Violation[] = [];
	for (const r of reaches(sf, checker)) {
		if (r.file === "untyped") {
			out.push({ path, rule: "untyped", what: `an access on an untyped value (${r.name}): a host member can hide behind any` });
			continue;
		}
		if (r.file === "computed") {
			out.push({ path, rule: "computed", what: `a host member named at run time (${r.owner}${r.name})` });
			continue;
		}
		for (const work of HOST_WORK) {
			if (!work.matches(r) || allowed(work, place)) continue;
			if (work.owners === "impure" && !isPure(path)) continue;
			const where = work.owners === "nowhere" || work.owners === "impure" ? "" : ` outside ${work.owners.length === DRIVERS.length ? "the drivers" : work.owners.join(" or ")}`;
			out.push({ path, rule: work.what, what: `${r.owner ? `${r.owner}.` : ""}${r.name} at «${text(sf, r.node)}»${where}` });
		}
	}
	return out;
}

/** JSX: no `style` attribute, and no spread that carries one. */
function jsxRules(path: string, sf: SourceFile, checker: Checker): Violation[] {
	const out: Violation[] = [];
	const spreads: AnyNode[] = [];
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.JsxAttribute && String((n.name as AnyNode).text) === "style") out.push({ path, rule: "JSX style", what: `«${text(sf, n)}»` });
		if (n.kind === SyntaxKind.JsxSpreadAttribute) spreads.push(n);
	});
	if (spreads.length) {
		const types = checker.getTypeAtLocation(spreads.map((s) => s.expression as Node));
		spreads.forEach((s, i) => {
			const type = types[i];
			if (type && ((type.flags & ANY) !== 0 || checker.getPropertyOfType(type, "style"))) out.push({ path, rule: "JSX style", what: `a spread carrying style «${text(sf, s)}»` });
		});
	}
	return out;
}

/** The type a switch is over: the object of `x.kind`, or the value a destructured name came from. */
function switchSubjects(sf: SourceFile): { node: AnyNode; subject: Node; via: "member" | "name" }[] {
	const out: { node: AnyNode; subject: Node; via: "member" | "name" }[] = [];
	walk(sf, (n) => {
		if (n.kind !== SyntaxKind.SwitchStatement) return;
		const e = n.expression as AnyNode;
		if (e.kind === SyntaxKind.PropertyAccessExpression || e.kind === SyntaxKind.ElementAccessExpression) out.push({ node: n, subject: e.expression as Node, via: "member" });
		else out.push({ node: n, subject: e, via: "name" });
	});
	return out;
}

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

/** Every switch over a message's discriminant ends in `assertNever`; the subject is found by its type, whatever its name. */
function messageRules(path: string, sf: SourceFile, checker: Checker): { violations: Violation[]; proven: number } {
	const subjects = switchSubjects(sf);
	if (subjects.length === 0) return { violations: [], proven: 0 };
	const types = checker.getTypeAtLocation(subjects.map((s) => s.subject));
	const symbols = checker.getSymbolAtLocation(subjects.map((s) => s.subject));
	const out: Violation[] = [];
	let proven = 0;
	subjects.forEach((s, i) => {
		let names = s.via === "member" ? typeName(types[i]) : [];
		if (s.via === "name") {
			const decl = symbols[i]?.declarations?.[0]?.resolve();
			let pattern: Node | undefined = decl;
			while (pattern && pattern.kind === SyntaxKind.BindingElement) pattern = pattern.parent;
			if (pattern && pattern.kind === SyntaxKind.ObjectBindingPattern) names = typeName(checker.getTypeAtLocation(pattern));
		}
		if (!names.some(isMsgName)) return;
		if (endsInAssertNever(s.node)) proven++;
		else out.push({ path, rule: "messages", what: `a switch over ${names.find(isMsgName)} without default: assertNever(…) «${text(sf, s.node).slice(0, 40)}»` });
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

export interface Analysis {
	readonly violations: readonly Violation[];
	/** Files declaring a `…Msg` type, and how many switches over one `update/` proves exhaustive. */
	readonly declaresMsg: readonly string[];
	readonly provenInUpdate: number;
	readonly files: readonly string[];
}

/** Every source file under `next/`, from the disk and from `extra` (the self-tests' samples). */
function nextFiles(extra: readonly Source[]): Source[] {
	const dir = join(ROOT, NEXT);
	const real = existsSync(dir)
		? readdirSync(dir, { recursive: true, encoding: "utf8" })
				.map((p) => `${NEXT}/${p.split("\\").join("/")}`)
				.filter((p) => /\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p))
				.map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }))
		: [];
	return [...real.filter((r) => !extra.some((e) => e.path === r.path)), ...extra];
}

/** Reads every file of `next/` (and the samples given) with the compiler and answers every rule it breaks. */
export function analyse(extra: readonly Source[] = []): Analysis {
	const files = nextFiles(extra);
	const program = new TsProgram(ROOT, [MAIN_CONFIG, PURE_CONFIG], new Map(extra.map((s) => [join(ROOT, s.path), s.text])));
	try {
		const main = program.project(MAIN_CONFIG);
		const pure = program.project(PURE_CONFIG);
		const violations: Violation[] = [];
		const msgs: string[] = [];
		let provenInUpdate = 0;
		for (const file of files) {
			const abs = join(ROOT, file.path);
			const place = placeOf(file.path);
			if (place.part === null) violations.push({ path: file.path, rule: "places", what: "in no part of next/ (model, update, recognizers, view, drivers/<driver>, host)" });
			else if (place.part === "drivers" && place.driver === null) violations.push({ path: file.path, rule: "places", what: `in no driver the spec names (${DRIVERS.join(", ")})` });
			if (!/\.tsx?$/.test(file.path)) continue;
			const sf = main.program.getSourceFile(abs);
			if (!sf) {
				violations.push({ path: file.path, rule: "places", what: "not in the project tsconfig.json compiles" });
				continue;
			}
			violations.push(...importRules(file.path, sf), ...hostRules(file.path, sf, main.checker), ...jsxRules(file.path, sf, main.checker));
			const m = messageRules(file.path, sf, main.checker);
			violations.push(...m.violations);
			if (place.part === "update") provenInUpdate += m.proven;
			if (declaresMsg(sf)) msgs.push(file.path);
			if (isPure(file.path)) {
				if (!pure.program.getSourceFile(abs)) violations.push({ path: file.path, rule: "purity", what: "not in the pure project (tsconfig.pure.json)" });
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
