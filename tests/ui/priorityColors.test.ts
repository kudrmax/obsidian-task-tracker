import { describe, expect, it } from "vitest";
import { MOST_CARD_COLORS, PRIORITY_COLORS, type PriorityColor } from "../../core/application/contracts";
import { contrast, inkOf, LABEL_SLOTS, priorityRules, shadesOf } from "../../obsidian/ui/priorityColors";

const THEMES = ["dark", "light"] as const;
const BOARD_CARD = { dark: "#1C1C1E", light: "#F2F2F7" };
const GREY = "#8E8E93";

/** The shades the board «Палитра» drew for the presets, before any colour could be chosen. */
const BOARD = {
	dark: { red: ["#572725", "#D89A97"], orange: ["#573E19", "#D8B785"], yellow: ["#574C19", "#D8CB86"], green: ["#214B2D", "#91C9A0"], teal: ["#254950", "#97C5D0"], blue: ["#173759", "#83AEDA"] },
	light: { red: ["#F4D5D7", "#C36261"], orange: ["#F4E3CF", "#AA7D40"], yellow: ["#F4ECCF", "#9D893A"], green: ["#D4EBDE", "#549266"], teal: ["#D3E7EF", "#548C99"], blue: ["#CBDFF8", "#4682C7"] },
} as const;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (a: string, b: string) => channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= 2);

describe("a priority colour's shades", () => {
	it.each(THEMES)("draw the presets as the board did, %s", (theme) => {
		for (const color of PRIORITY_COLORS) {
			const [fill, meta] = BOARD[theme][color];
			const s = shadesOf(color, theme);
			expect(near(s.fill, fill), `${color} fill ${s.fill}`).toBe(true);
			expect(near(s.meta, meta), `${color} meta ${s.meta}`).toBe(true);
		}
	});

	const ANY: readonly PriorityColor[] = [...PRIORITY_COLORS, "#FF6A00", "#C2185B", "#7B61FF", "#00C2A8", "#222222", "#F5F5F5"];

	it.each(THEMES)("keep the date and the dot as legible on any tint as the grey on a plain card, %s", (theme) => {
		const grey = contrast(GREY, BOARD_CARD[theme]);
		for (const color of ANY) {
			const s = shadesOf(color, theme);
			expect(contrast(s.meta, s.fill), color).toBeGreaterThanOrEqual(grey - 0.01);
			expect(s.meta).not.toBe(GREY);
		}
	});

	it("take a preset's own shade in each theme, and any other colour as it is in both", () => {
		expect(inkOf("red", "dark")).toBe("#FF453A");
		expect(inkOf("red", "light")).toBe("#FF3B30");
		expect(inkOf("#FF6A00", "dark")).toBe("#FF6A00");
		expect(inkOf("#FF6A00", "light")).toBe("#FF6A00");
	});
});

describe("the priority stylesheet", () => {
	it("gives every preset and each level's own colour its shades in both themes", () => {
		const css = priorityRules([{ prefix: "p1", color: "#FF6A00" }]);
		for (const color of [...PRIORITY_COLORS, "#FF6A00"]) {
			expect(css).toContain(`[data-priority="${color}"], .tc-quick-row:has(> [data-priority="${color}"]) {`);
			expect(css).toContain(`body.theme-light [data-priority="${color}"], body.theme-light .tc-quick-row:has(> [data-priority="${color}"]) {`);
		}
		expect(css).toContain(`--tc-priority-fill: ${shadesOf("#FF6A00", "dark").fill};`);
	});

	it("leaves out a colour it can't read", () => {
		expect(priorityRules([{ prefix: "p1", color: "#oops" as PriorityColor }])).not.toContain("oops");
	});
});

describe("the labels' fills", () => {
	it("has a slot for each colour the core paints a card in, and the stylesheet a rule for each count", () => {
		expect(LABEL_SLOTS).toHaveLength(MOST_CARD_COLORS);
	});

	it("give a card of several labels each colour's fill in its place, in both themes", () => {
		const rules = priorityRules([{ name: "Свой", color: "#123456" }]);
		expect(rules).toContain(`[data-label1="orange"] { --tc-label-fill-1: ${shadesOf("orange", "dark").fill}; }`);
		expect(rules).toContain(`body.theme-light [data-label0="#123456"] { --tc-label-fill-0: ${shadesOf("#123456", "light").fill}; }`);
	});
});
