import type { CalendarSource } from "../application/contracts";

export interface EventColors {
	readonly bg: string;
	readonly bar: string;
	readonly text: string;
}

export type Theme = "dark" | "light";

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

const linear = (v: number) => Math.pow(v / WHITE, 2.2);
const luminance = ([r, g, b]: readonly number[]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

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
		const kind = luminance(rgb) < LIGHT_BRIGHT_LUMINANCE ? "deep" : "bright";
		return { bg: `rgba(${r}, ${g}, ${b}, ${LIGHT_BG_ALPHA[kind]})`, bar: toHex(rgb), text: toHex(rgb.map((v) => v * LIGHT_TEXT_SCALE[kind])) };
	}
	return {
		bg: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
		bar: toHex(rgb),
		text: toHex(rgb.map((v) => v + (WHITE - v) * TEXT_MIX)),
	};
}
