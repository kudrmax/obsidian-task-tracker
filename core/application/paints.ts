import type { CalendarEvent, CalendarSource } from "./contracts";
import { isPresetColor, type PresetColor, type PriorityColor } from "../domain/Priority";

/** The two themes every frontend draws in: the colours below are given for each. */
export type Theme = "dark" | "light";

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


export interface EventColors {
	readonly bg: string;
	readonly bar: string;
	readonly text: string;
}

export const EVENT_BG_ALPHA = 0.22;
/** The board draws the work calendar's blue a touch stronger. */
const WORK_BG_ALPHA = 0.24;
const TEXT_MIX = 0.5;
const WHITE = 255;
/** On the light ground a bright colour (an orange, a green) takes a stronger tint and darker ink than a deep one (a blue, a pink). */
const LIGHT_BRIGHT_LUMINANCE = 0.33;
const LIGHT_BG_ALPHA = { deep: 0.13, bright: 0.16 };
const LIGHT_TEXT_SCALE = { deep: 0.72, bright: 0.6 };

function channels(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (c: readonly number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

const gammaLinear = (v: number) => Math.pow(v / WHITE, 2.2);
const gammaLuminance = ([r, g, b]: readonly number[]) => 0.2126 * gammaLinear(r) + 0.7152 * gammaLinear(g) + 0.0722 * gammaLinear(b);

/** The colour of an event whose calendar's file gives none: each source its own. */
const SOURCE_COLORS: Readonly<Record<CalendarSource, string>> = { google: "#4285F4", iphone: "#0A84FF", work: "#0A84FF" };

/** The event's calendar colour, or its source's when the file gives none. */
export function eventHex(event: Pick<CalendarEvent, "color" | "source">): string {
	return event.color ?? SOURCE_COLORS[event.source];
}

export function bgAlphaFor(source: CalendarSource): number {
	return source === "work" ? WORK_BG_ALPHA : EVENT_BG_ALPHA;
}

/**
 * A calendar's colour as a block draws it: a translucent ground, the bar in the colour itself, the title in a tone of it,
 * light on the dark theme and dark on the light one.
 */
export function eventColors(hex: string, bgAlpha = EVENT_BG_ALPHA, theme: Theme = "dark"): EventColors {
	const rgb = channels(hex);
	const [r, g, b] = rgb;
	if (theme === "light") {
		const kind = gammaLuminance(rgb) < LIGHT_BRIGHT_LUMINANCE ? "deep" : "bright";
		return { bg: `rgba(${r}, ${g}, ${b}, ${LIGHT_BG_ALPHA[kind]})`, bar: toHex(rgb), text: toHex(rgb.map((v) => v * LIGHT_TEXT_SCALE[kind])) };
	}
	return {
		bg: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
		bar: toHex(rgb),
		text: toHex(rgb.map((v) => v + (WHITE - v) * TEXT_MIX)),
	};
}
