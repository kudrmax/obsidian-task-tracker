import { isPresetColor, type LabelLevel, PRIORITY_COLORS, type PresetColor, type PriorityColor, type PriorityLevel, usableColor } from "../application/contracts";
import type { LabelPaint } from "./viewSettings";
import type { Theme } from "./eventColors";

/** What a level's colour paints: the flag and the dot (ink), a card's ground (fill), a card's date, time and progress dot (meta). */
export interface PriorityShades {
	readonly ink: string;
	readonly fill: string;
	readonly meta: string;
}

type Rgb = readonly [number, number, number];

/** The presets' own shades, iOS's system colours, from the board «Палитра». */
const PRESET_INK: Readonly<Record<PresetColor, Readonly<Record<Theme, string>>>> = {
	red: { dark: "#FF453A", light: "#FF3B30" },
	orange: { dark: "#FF9F0A", light: "#FF9500" },
	yellow: { dark: "#FFD60A", light: "#FFCC00" },
	green: { dark: "#30D158", light: "#34C759" },
	teal: { dark: "#40C8E0", light: "#30B0C7" },
	blue: { dark: "#0A84FF", light: "#007AFF" },
};

/**
 * How a theme tints a card: the board's plain card, the share of the colour over it, and where the meta tone moves to
 * read as well on the tint as the grey reads on a plain card.
 */
const THEMES: Readonly<Record<Theme, { readonly card: Rgb; readonly share: number; readonly pole: Rgb }>> = {
	dark: { card: [0x1c, 0x1c, 0x1e], share: 0.26, pole: [255, 255, 255] },
	light: { card: [0xf2, 0xf2, 0xf7], share: 0.16, pole: [0, 0, 0] },
};
const GREY: Rgb = [0x8e, 0x8e, 0x93];
const META_GREY_SHARE = 0.5;
const SEARCH_STEPS = 24;

const rgbOf = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
const hexOf = (c: Rgb): string => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((v, i) => v + (b[i] - v) * share) as unknown as Rgb;
const linear = (v: number): number => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb): number => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

export function contrast(a: string, b: string): number {
	const [high, low] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
	return (high + 0.05) / (low + 0.05);
}

/** The colour itself in a theme: a preset's own shade there, any other colour as it is. */
export function inkOf(color: PriorityColor, theme: Theme): string {
	return isPresetColor(color) ? PRESET_INK[color][theme] : color;
}

/**
 * A colour's shades in a theme. The fill is the colour laid over the plain card; the meta tone is the colour half mixed
 * with the card's grey, then lightened (dark theme) or darkened (light) just until it reads on the fill as well as the
 * grey reads on a plain card, so a date or a dot stays as legible on any tint as on no tint.
 */
export function shadesOf(color: PriorityColor, theme: Theme): PriorityShades {
	const { card, share, pole } = THEMES[theme];
	const ink = rgbOf(inkOf(color, theme));
	const fill = hexOf(mix(card, ink, share));
	const target = contrast(hexOf(GREY), hexOf(card));
	const half = mix(ink, GREY, META_GREY_SHARE);
	let [low, high] = [0, 1];
	for (let step = 0; step < SEARCH_STEPS; step++) {
		const mid = (low + high) / 2;
		if (contrast(hexOf(mix(half, pole, mid)), fill) < target) low = mid;
		else high = mid;
	}
	return { ink: hexOf(ink), fill, meta: hexOf(mix(half, pole, high)) };
}

/** The properties each colour's rule sets, which the stylesheet's rules read. */
const PROPERTY = { ink: "--tc-priority-ink", fill: "--tc-priority-fill", meta: "--tc-priority-meta" } as const;

/** A card of several labels carries the n-th one's colour in `attribute`; the stylesheet reads its fill as `fill`. */
export const LABEL_SLOTS = [
	{ attribute: "data-label0", fill: "--tc-label-fill-0" },
	{ attribute: "data-label1", fill: "--tc-label-fill-1" },
	{ attribute: "data-label2", fill: "--tc-label-fill-2" },
	{ attribute: "data-label3", fill: "--tc-label-fill-3" },
] as const;

const themed = (marked: string, theme: "dark" | "light"): string => (theme === "light" ? marked.split(", ").map((s) => `body.theme-light ${s}`).join(", ") : marked);

/**
 * The rules that give every element marked with a colour (`data-priority`) that colour's shades, in both themes, and a
 * card of several labels each label's fill: the presets always (the settings offer them), and each other colour a level
 * or a label has.
 */
export function priorityRules(levels: readonly (PriorityLevel | LabelLevel)[]): string {
	const colors = new Set<PriorityColor>(PRIORITY_COLORS);
	for (const level of levels) if (usableColor(level.color)) colors.add(level.color);
	const rules: string[] = [];
	for (const color of colors) {
		const marked = `[data-priority="${color}"], .tc-quick-row:has(> [data-priority="${color}"])`;
		for (const theme of ["dark", "light"] as const) {
			const s = shadesOf(color, theme);
			rules.push(`${themed(marked, theme)} { ${PROPERTY.ink}: ${s.ink}; ${PROPERTY.fill}: ${s.fill}; ${PROPERTY.meta}: ${s.meta}; }`);
			for (const slot of LABEL_SLOTS) rules.push(`${themed(`[${slot.attribute}="${color}"]`, theme)} { ${slot.fill}: ${s.fill}; }`);
		}
	}
	return rules.join("\n");
}

let sheet: HTMLStyleElement | null = null;

/**
 * The levels' colours as a stylesheet in the document: cards, menus and the settings read the same shades from it. The
 * settings show a colour still being picked the same way, before it is saved.
 */
export function showPriorityColors(levels: readonly PriorityLevel[], labels: readonly LabelLevel[] = []): void {
	sheet ??= document.head.appendChild(document.createElement("style"));
	sheet.textContent = priorityRules([...levels, ...labels]);
}

const BLEND = "tc-labels-blend";

/** How cards of several labels are painted, for every card in the document: stripes, or with `blend` one colour flowing into the next. */
export function showLabelPaint(paint: LabelPaint): void {
	document.body.classList.toggle(BLEND, paint === "blend");
}

export function clearPriorityColors(): void {
	sheet?.remove();
	sheet = null;
	document.body.classList.remove(BLEND);
}
