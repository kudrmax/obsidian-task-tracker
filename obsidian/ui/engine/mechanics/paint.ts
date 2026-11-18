/** A card's colour shaded for the theme: the ink (its own), the card's ground (the ink laid over the plain card), the date's and dot's tone on it. */
export interface Shades {
	readonly ink: string;
	readonly fill: string;
	readonly meta: string;
}

type Rgb = readonly [number, number, number];

/** Each theme's plain card, how much of the colour lies over it, the grey of a date on a plain card, and where the date's tone moves to stay legible. */
const THEMES = {
	dark: { card: [0x1c, 0x1c, 0x1e], share: 0.26, grey: [0x8e, 0x8e, 0x93], pole: [255, 255, 255], lift: 0.35 },
	light: { card: [0xf2, 0xf2, 0xf7], share: 0.16, grey: [0x8e, 0x8e, 0x93], pole: [0, 0, 0], lift: 0.3 },
} as const;

const rgb = (hex: string): Rgb => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as unknown as Rgb;
const hex = (c: Rgb): string => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
const mix = (a: Rgb, b: Rgb, share: number): Rgb => a.map((v, i) => v + (b[i] - v) * share) as unknown as Rgb;

/** The shades of `color` (`#RRGGBB`) in `theme`. */
export function shadesOf(color: string, theme: "dark" | "light"): Shades {
	const t = THEMES[theme];
	const ink = rgb(color);
	return { ink: hex(ink), fill: hex(mix(t.card, ink, t.share)), meta: hex(mix(mix(ink, t.grey, 0.5), t.pole, t.lift)) };
}
