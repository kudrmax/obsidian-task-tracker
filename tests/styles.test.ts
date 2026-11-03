import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/settings";
import { DESIGN, DESIGN_TOKENS, DesignMeasure } from "../src/ui/design";
import { STATUS_BAR_SHOWN } from "../src/ui/StatusBarRoom";

interface Declaration {
	readonly selector: string;
	readonly property: string;
	readonly value: string;
	readonly isToken: boolean;
}

const LIGHT = "body.theme-light";

/** styles.css as rules and declarations; the tokens are the declarations of the top-level `body` rule, and `body.theme-light` overrides some of them. */
class Stylesheet {
	readonly declarations: Declaration[] = [];

	constructor(css: string) {
		const stack: string[] = [];
		let buffer = "";
		for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
			if (char === "{") {
				stack.push(buffer.trim());
				buffer = "";
			} else if (char === "}") {
				this.read(stack, buffer);
				stack.pop();
				buffer = "";
			} else buffer += char;
		}
	}

	get tokens(): Map<string, string> {
		return new Map(this.declarations.filter((d) => d.isToken && d.selector === "body").map((d) => [d.property, d.value]));
	}

	get lightTokens(): Map<string, string> {
		return new Map(this.declarations.filter((d) => d.isToken && d.selector === LIGHT).map((d) => [d.property, d.value]));
	}

	get rules(): Declaration[] {
		return this.declarations.filter((d) => !d.isToken);
	}

	/** Every custom property this sheet reads with var(). */
	get used(): Set<string> {
		const names = new Set<string>();
		for (const d of this.declarations) for (const [, name] of d.value.matchAll(/var\((--[\w-]+)/g)) names.add(name);
		return names;
	}

	private read(stack: readonly string[], body: string): void {
		const selector = stack[stack.length - 1] ?? "";
		const isToken = stack.length === 1 && (selector === "body" || selector === LIGHT);
		for (const part of body.split(";")) {
			const colon = part.indexOf(":");
			if (colon < 0 || !part.trim()) continue;
			this.declarations.push({ selector, property: part.slice(0, colon).trim(), value: part.slice(colon + 1).trim(), isToken });
		}
	}
}

/** The plugin's own TypeScript. */
class Code {
	readonly files: { readonly path: string; readonly text: string }[];

	constructor(root: string) {
		this.files = readdirSync(root, { recursive: true, encoding: "utf8" })
			.filter((path) => path.endsWith(".ts"))
			.map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
	}

	/** Custom properties the code sets on elements, which the stylesheet then reads. */
	get setProperties(): Set<string> {
		const names = new Set<string>();
		for (const { text } of this.files) for (const [, name] of text.matchAll(/["'`](--tc-[\w-]+)["'`]/g)) names.add(name);
		return names;
	}
}

const sheet = new Stylesheet(readFileSync(join(__dirname, "..", "styles.css"), "utf8"));
const code = new Code(join(__dirname, "..", "src"));

/** Numbers that say how a layout is built rather than how it looks: none, one, halves, the whole, a quarter turn. */
const STRUCTURAL = new Set(["0", "1", "-1", "2", "1fr", "50%", "-50%", "100%", "90deg", "-90deg"]);
const NAMED_COLORS = /\b(white|black|red|green|blue|gr[ae]y|yellow|orange|purple|pink|cyan|magenta|silver|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i;

const unnamed = (value: string) =>
	value
		.replace(/--[\w-]+/g, "--x")
		.replace(/repeat\(\d+,/g, "repeat(N,")
		.replace(/"[^"]*"/g, '""');

const literalsIn = (value: string): string[] =>
	[...unnamed(value).matchAll(/(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)(?:[a-z]+|%)?/gi)]
		.map(([number]) => number)
		.filter((number) => !STRUCTURAL.has(number) && !/^-?0+(\.0+)?([a-z]+|%)?$/i.test(number));

const where = (d: Declaration) => `${d.selector} { ${d.property}: ${d.value} }`;

describe("styles.css keeps to its design system", () => {
	it("writes no number into a rule: sizes, spacing, opacity, layers and timing are tokens", () => {
		const offenders = sheet.rules.filter((d) => literalsIn(d.value).length > 0).map(where);
		expect(offenders).toEqual([]);
	});

	it("writes no colour, curve or font into a rule", () => {
		const offenders = sheet.rules
			.filter((d) => {
				const value = unnamed(d.value);
				return (
					/#[0-9a-f]{3,8}\b/i.test(value) ||
					/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(\s*[\d.]/i.test(value) ||
					NAMED_COLORS.test(value) ||
					/cubic-bezier|steps\(/.test(value) ||
					(d.property === "font-weight" && !/^var\(--tc-weight-[\w-]+\)$/.test(d.value)) ||
					(d.property === "font-family" && !/^var\(--tc-font-[\w-]+\)$/.test(d.value))
				);
			})
			.map(where);
		expect(offenders).toEqual([]);
	});

	it("rounds every corner with a radius token", () => {
		const runtime = code.setProperties;
		const offenders = sheet.rules
			.filter((d) => d.property === "border-radius")
			.filter((d) => {
				const rest = d.value
					.replace(/var\(--tc-radius-[\w-]+\)/g, "")
					.replace(/var\((--tc-[\w-]+)\)/g, (match, name: string) => (runtime.has(name) ? "" : match))
					.replace(/max\(|calc\(|\)|,|-|0px|\b0\b|\s/g, "");
				return rest !== "";
			})
			.map(where);
		expect(offenders).toEqual([]);
	});

	it("reads Obsidian's theme only through tokens", () => {
		const offenders = sheet.rules
			.filter((d) => !d.property.startsWith("--"))
			.filter((d) => [...d.value.matchAll(/var\((--[\w-]+)/g)].some(([, name]) => !name.startsWith("--tc-")))
			.map(where);
		expect(offenders).toEqual([]);
	});

	it("marks nothing important", () => {
		expect(sheet.declarations.filter((d) => d.value.includes("!important")).map(where)).toEqual([]);
	});

	it("defines every token once per theme", () => {
		for (const selector of ["body", LIGHT]) {
			const names = sheet.declarations.filter((d) => d.isToken && d.selector === selector).map((d) => d.property);
			expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
			expect(names.filter((name) => !name.startsWith("--tc-"))).toEqual([]);
		}
	});

	it("lets the light theme change only colours the dark theme defines", () => {
		const dark = sheet.tokens;
		const light = sheet.lightTokens;
		expect([...light.keys()].filter((name) => !dark.has(name))).toEqual([]);
		const colour = /#[0-9a-f]{6}|rgba?[(]|color-mix[(]|var[(]--interactive-accent[)]/i;
		expect([...light.entries()].filter(([, value]) => !colour.test(value))).toEqual([]);
		expect(light.size).toBeGreaterThan(0);
	});

	it("reads only properties that are defined, in the stylesheet or by the code", () => {
		const defined = new Set([...sheet.declarations.map((d) => d.property), ...code.setProperties]);
		const missing = [...sheet.used].filter((name) => name.startsWith("--tc-") && !defined.has(name));
		expect(missing).toEqual([]);
	});

	it("uses every token it defines, and every property the code sets", () => {
		const used = sheet.used;
		expect([...sheet.tokens.keys()].filter((name) => !used.has(name))).toEqual([]);
		expect([...code.setProperties].filter((name) => !used.has(name))).toEqual([]);
	});

	it("agrees with the measures the code lays the calendar out with", () => {
		const tokens = sheet.tokens;
		const differences = (Object.keys(DESIGN) as DesignMeasure[])
			.map((measure) => ({ measure, token: DESIGN_TOKENS[measure], css: tokens.get(DESIGN_TOKENS[measure]), code: DESIGN[measure] }))
			.filter(({ css, code }) => css === undefined || !/^\d+(\.\d+)?(px)?$/.test(css) || parseFloat(css) !== code);
		expect(differences).toEqual([]);
	});

	it("takes icon sizes, type sizes and stroke widths from their scales", () => {
		const tokens = sheet.tokens;
		const ref = (name: string, scale: RegExp) => expect(tokens.get(name), name).toMatch(scale);
		for (const name of tokens.keys()) {
			if (/^--tc-[\w-]*-(icon|flag)$/.test(name) && !/^--tc-icon-/.test(name)) ref(name, /^var\(--tc-icon-(xs|s|m|l|xl)\)$/);
			if (/^--tc-font-/.test(name) && !["--tc-font-ui", "--tc-font-inherit"].includes(name) && !/var\(--font-/.test(tokens.get(name)!)) ref(name, /^var\(--tc-(text-\d+|font-[\w-]+)\)$/);
			if (/^--tc-stroke-/.test(name) && !/^--tc-stroke-\d/.test(name)) ref(name, /^var\(--tc-stroke-\d[\d-]*\)$/);
		}
	});

	it("resets a button in one rule", () => {
		expect(sheet.rules.filter((d) => d.property === "appearance").map((d) => d.selector)).toHaveLength(1);
	});

	it("quiets Obsidian's hover on our buttons without touching their own ground", () => {
		const quiet = sheet.rules.filter((d) => d.property === "background" && /:hover|:active/.test(d.selector) && d.value === "transparent");
		expect(quiet.length).toBeGreaterThan(0);
		const selectors = (list: string) => list.split(/,(?![^(]*\))/).map((s) => s.trim());
		for (const d of quiet) expect(selectors(d.selector).every((s) => s.startsWith(":where(")), d.selector).toBe(true);
	});

	it("answers Obsidian's phone tap (button:not(.clickable-icon).mobile-tap, weight 0,2,1) at its weight, and the divider's handle keeps its ground above it", () => {
		const tap = sheet.rules.filter((d) => d.selector === ":is(.task-calendar, .tc-panel, .tc-picker, .tc-popover, .tc-quick-bar) button.mobile-tap");
		expect(tap.map((d) => `${d.property}: ${d.value}`)).toEqual(["background-color: transparent", "box-shadow: none"]);
		expect(sheet.rules.some((d) => d.selector === ".task-calendar button.tc-divider-handle" && d.property === "background")).toBe(true);
	});

	it("casts every shadow from a shadow token, or rings an element with token measures", () => {
		const parts = (value: string) => value.split(/,(?![^(]*\))/).map((part) => part.trim());
		const allowed = [/^none$/, /^var\(--tc-(shadow|level|ring)-[\w-]+\)$/, /^(inset )?0 0 0 (var\(--tc-[\w-]+\)|calc\([^)]*var\(--tc-[\w-]+\)\)) var\(--tc-[\w-]+\)$/];
		const offenders = sheet.rules
			.filter((d) => d.property === "box-shadow" || d.property === "filter")
			.filter((d) => !parts(d.value).every((part) => allowed.some((pattern) => pattern.test(part))))
			.map(where);
		expect(offenders).toEqual([]);
	});

	it("gives the bottom row one shadow: the wheel, the plus, the plus under the finger, Undo and the desktop capsule", () => {
		const shadowOf = (element: string) =>
			sheet.rules.filter((d) => d.property === "box-shadow" && d.selector.split(/,(?![^(]*\))/).some((s) => s.trim() === element)).map((d) => d.value);
		for (const element of [".tc-seg", ".task-calendar > button.tc-plus", ".tc-float-plus", ".task-calendar > button.tc-undo", ".tc-quick-bar.is-desk::before"])
			expect(shadowOf(element), element).toEqual(["var(--tc-shadow-control)"]);
	});

	it("draws the menus, the description's peek and the sources window as one window", () => {
		const of = (element: string, property: string) =>
			sheet.rules.filter((d) => d.property === property && d.selector.split(/,(?![^(]*\))/).some((s) => s.trim() === element)).map((d) => d.value);
		for (const element of [".tc-panel", ".tc-desc-peek", ".tc-popover"]) {
			expect(of(element, "background"), element).toEqual(["var(--tc-panel-bg)"]);
			expect(of(element, "box-shadow"), element).toEqual(["var(--tc-shadow-panel)"]);
		}
		const numbers = (value: string) => value.match(/\d+(\.\d+)?/g)!.slice(0, 7);
		for (const tokens of [sheet.tokens, sheet.lightTokens]) expect(numbers(tokens.get("--tc-level-shadow")!)).toEqual(numbers(tokens.get("--tc-shadow-panel")!));
	});

	it("draws the cards at the settings' default size until the settings set theirs", () => {
		expect(sheet.tokens.get("--tc-card-h")).toBe(`${DEFAULT_SETTINGS.cardHeight}px`);
		expect(sheet.tokens.get("--tc-card-gap")).toBe(`${DEFAULT_SETTINGS.cardGap}px`);
	});

	it("runs a list to the bottom under its foot and the fade, its end room a row rather than padding, the lists fading as the day does", () => {
		const of = (selector: string) => new Map(sheet.rules.filter((d) => d.selector === selector).map((d) => [d.property, d.value]));
		expect(of(".tc-left, .tc-soon, .tc-inbox")).toEqual(new Map([["display", "flex"], ["flex-direction", "column"]]));
		const list = of(".tc-list");
		expect([list.get("flex"), list.get("min-height")]).toEqual(["1 1 0", "0"]);
		expect([...list.keys()].filter((property) => property.startsWith("padding"))).toEqual([]);
		expect(of(".tc-list > *").get("flex-shrink")).toBe("0");
		expect([of(".tc-list::after").get("flex-shrink"), of(".tc-list::after").get("height")]).toEqual(["0", "var(--tc-foot-fade-day)"]);
		expect(of(".task-calendar > .tc-fade").get("height")).toBe("var(--tc-foot-fade-day)");
		expect(of(".task-calendar:is(.is-lists, .is-inbox) > .tc-fade").size).toBe(0);
		expect(sheet.tokens.get("--tc-nav-room")).toBe("max(0px, var(--view-bottom-spacing, 0px))");
	});

	it("lets the foot fade give way while a task is typed, so a field at the end of a column shows whole: down to the status bar on the desktop, behind the bar on the phone", () => {
		const of = (selector: string) => new Map(sheet.rules.filter((d) => d.selector === selector).map((d) => [d.property, d.value]));
		expect(of("body:not(.is-mobile) .task-calendar.is-entering > .tc-fade").get("height")).toBe("var(--tc-chrome-room)");
		expect(of("body.is-mobile .task-calendar.is-entering > .tc-fade").get("height")).toBe("calc(var(--tc-bar-h) + var(--tc-bar-bottom))");
	});

	it("marks a task in progress with a dot in the middle of the card's left padding, level with the title, in the card's meta tint", () => {
		const of = (selector: string) => new Map(sheet.rules.filter((d) => d.selector === selector).map((d) => [d.property, d.value]));
		const dot = of(".tc-progress-dot");
		expect([dot.get("left"), dot.get("top")]).toEqual(["calc((var(--tc-card-pad-start) - var(--tc-progress-dot)) / 2)", "calc((var(--tc-card-h) - var(--tc-progress-dot)) / 2)"]);
		expect([dot.get("width"), dot.get("height"), dot.get("border-radius")]).toEqual(["var(--tc-progress-dot)", "var(--tc-progress-dot)", "var(--tc-radius-circle)"]);
		expect(dot.get("background")).toBe("var(--tc-muted)");
		expect(of("[data-priority] .tc-progress-dot, .tc-quick-row:has(> [data-priority]) > .tc-progress-dot").get("background")).toBe("var(--tc-priority-meta)");
		expect(sheet.tokens.get("--tc-progress-dot")).toBe("4px");
	});

	it("stands the switch and the plus in one row over Obsidian's chrome: the phone's navigation, or the desktop's status bar while it is shown", () => {
		const of = (selector: string) => new Map(sheet.rules.filter((d) => d.selector === selector).map((d) => [d.property, d.value]));
		expect(sheet.tokens.get("--tc-status-room")).toBe("0px");
		expect(sheet.tokens.get("--tc-chrome-room")).toBe("calc(var(--tc-nav-room) + var(--tc-status-room))");
		expect(of("body:not(.is-mobile).tc-status-bar-shown").get("--tc-status-room")).toBe("var(--tc-status-bar)");
		const seg = of(".task-calendar > .tc-seg");
		const row = of(".task-calendar > button.tc-plus, .task-calendar > .tc-plus-ring, .task-calendar > button.tc-undo");
		const plus = of(".task-calendar > button.tc-plus, .task-calendar > .tc-plus-ring");
		expect(seg.get("bottom")).toBe("calc(var(--tc-chrome-room) + var(--tc-foot-gap) - var(--tc-keyboard-room))");
		expect(row.get("bottom")).toBe("calc(var(--tc-chrome-room) + var(--tc-foot-gap) + (var(--tc-seg) - var(--tc-plus-size)) / 2 - var(--tc-keyboard-room))");
		expect(plus.get("right")).toBe("var(--tc-space-16)");
		expect(of(".tc-quick-bar").get("bottom")).toBe("var(--tc-bar-bottom)");
	});

	it("lifts each shift button over the bar's ground, as the desktop dissolves their group into the bar", () => {
		const lifted = sheet.rules
			.filter((d) => d.property === "z-index" && d.value === "var(--tc-layer-bar-button)")
			.flatMap((d) => d.selector.split(",").map((part) => part.trim()));
		expect(sheet.rules.some((d) => d.selector.includes(".tc-quick-bar.is-desk .tc-bar-shifts") && d.property === "display" && d.value === "contents")).toBe(true);
		expect(lifted).toContain(".tc-bar-shift");
	});

	it("no rule reads an element's inline style", () => {
		const offenders = sheet.rules.filter((d) => /\[style\s*[~|^$*]?=/.test(d.selector)).map(where);
		expect(offenders).toEqual([]);
	});

	it("the status bar's class is the one the view sets", () => {
		const room = sheet.rules.filter((d) => d.property === "--tc-status-room").map((d) => d.selector);
		expect(room).toHaveLength(1);
		expect(room[0]).toContain(`.${STATUS_BAR_SHOWN}`);
	});

	it("stands the switch, the plus and Undo as on the screen without the phone keyboard, so it uncovers them in place", () => {
		const of = (selector: string) => new Map(sheet.rules.filter((d) => d.selector === selector).map((d) => [d.property, d.value]));
		expect(sheet.tokens.get("--tc-keyboard-room")).toBe("var(--keyboard-height, 0px)");
		expect(of(".task-calendar > button.tc-plus, .task-calendar > .tc-plus-ring, .task-calendar > button.tc-undo").get("bottom")).toMatch(/- var\(--tc-keyboard-room\)\)$/);
	});

	it("reads the hour only on the canvas", () => {
		const reading = sheet.rules.filter((d) => d.value.includes("var(--tc-hour)"));
		expect(reading.length).toBeGreaterThan(0);
		expect(reading.every((d) => d.selector === ".tc-canvas")).toBe(true);
	});

	it("moves no card of a list while a task is dragged: the drop line shows the place", () => {
		expect(sheet.rules.filter((d) => d.value.includes("var(--tc-room)"))).toEqual([]);
	});
});

describe("the code keeps to the design system", () => {
	it("writes no size, time or share into a style except as a named constant", () => {
		const offenders: string[] = [];
		for (const { path, text } of code.files) {
			text.split("\n").forEach((line, index) => {
				if (/^\s*(export )?const [A-Z][A-Z0-9_]* =/.test(line) || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
				const literal = /["'`][^"'`]*?(?<![\w.$}])(?:[1-9]\d*(?:\.\d+)?|0?\.\d+)(?:(?:px|ms|s|deg|em|rem)\b|%)/;
				if (literal.test(line)) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
			});
		}
		expect(offenders).toEqual([]);
	});
});

describe("the time on a card with a priority", () => {
	const LEVELS = ["red", "orange", "yellow", "green", "teal", "blue"];
	const luminance = (hex: string): number => {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const contrast = (a: string, b: string): number => {
		const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
		return (high + 0.05) / (low + 0.05);
	};
	const resolve = (t: Map<string, string>, value: string): string => {
		const reference = /^var\((--[\w-]+)\)$/.exec(value);
		if (reference) return resolve(t, t.get(reference[1])!);
		const mix = /^color-mix\(in srgb, (var\(--[\w-]+\)), (var\(--[\w-]+\)) (var\(--[\w-]+\))\)$/.exec(value);
		if (!mix) return value;
		const [from, to] = [mix[1], mix[2]].map((part) => resolve(t, part));
		const share = parseFloat(resolve(t, mix[3])) / 100;
		const channel = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16);
		return `#${[1, 3, 5].map((i) => Math.round(channel(from, i) * (1 - share) + channel(to, i) * share).toString(16).padStart(2, "0")).join("")}`;
	};
	/** Obsidian's own grounds (black on the phone, grey on the desktop, white in the light theme), each with the board's card on its board's ground. */
	const GROUNDS = [
		["dark, phone", () => new Map([...sheet.tokens, ["--background-primary", "#000000"]]), ["#1C1C1E", "#000000"]],
		["dark, desktop", () => new Map([...sheet.tokens, ["--background-primary", "#1C1C1C"]]), ["#1C1C1E", "#000000"]],
		["light", () => new Map([...sheet.tokens, ...sheet.lightTokens, ["--background-primary", "#FFFFFF"]]), ["#F2F2F7", "#FFFFFF"]],
	] as const;

	it.each(GROUNDS)("leaves a plain card standing out from the ground as much as the board's, %s", (_, tokens, [boardCard, boardGround]) => {
		const t = tokens();
		expect(contrast(resolve(t, "var(--tc-card-bg)"), resolve(t, "var(--tc-bg)"))).toBeGreaterThanOrEqual(contrast(boardCard, boardGround) - 0.01);
	});

	it.each(GROUNDS)("takes the level's hue and reads as well as the grey on a plain card, %s", (_, tokens) => {
		const t = tokens();
		const grey = contrast(t.get("--tc-muted")!, resolve(t, "var(--tc-card-bg)"));
		for (const level of LEVELS) {
			const meta = t.get(`--tc-priority-${level}-meta`)!;
			expect(contrast(meta, t.get(`--tc-priority-${level}-card`)!), level).toBeGreaterThanOrEqual(grey - 0.01);
			expect(meta).not.toBe(t.get("--tc-muted"));
		}
	});
});
