import type { CalendarSource } from "../application/contracts";

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

function channels(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

const toHex = (c: readonly number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** A calendar's colour as a block draws it: a translucent ground, the bar in the colour itself, the title in a light tone of it. */
export function eventColors(hex: string, bgAlpha = EVENT_BG_ALPHA): EventColors {
	const [r, g, b] = channels(hex);
	return {
		bg: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
		bar: toHex([r, g, b]),
		text: toHex([r, g, b].map((v) => v + (WHITE - v) * TEXT_MIX)),
	};
}

export function bgAlphaFor(source: CalendarSource): number {
	return source === "work" ? WORK_BG_ALPHA : EVENT_BG_ALPHA;
}
