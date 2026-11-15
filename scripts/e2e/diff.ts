import type { Image } from "./png";

/** A rectangle in the image's pixels. */
export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * A region of a shot with its own tolerance: a pixel differs when a channel moves more than `channel`; the region fails
 * when more than `share` of its pixels differ. Regions are checked in order and a pixel counts for the first that holds
 * it; the rest of the image is the `rest` region.
 */
export interface Region {
	readonly name: string;
	readonly rect: Rect;
	readonly channel: number;
	readonly share: number;
}

export interface DiffOptions {
	readonly regions: readonly Region[];
	/** The tolerance of everything outside the regions. */
	readonly rest: { readonly channel: number; readonly share: number };
	/** Masked out on both images: what changes by itself (a caret, a clock outside the frozen one). */
	readonly masks: readonly Rect[];
}

export interface RegionResult {
	readonly name: string;
	readonly differing: number;
	readonly pixels: number;
	readonly failed: boolean;
}

export interface DiffResult {
	readonly sizeDiffers: boolean;
	readonly regions: readonly RegionResult[];
	readonly failed: boolean;
	/** The new image dimmed, its differing pixels in red, the masks blue. */
	readonly picture: Image | null;
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function diffImages(baseline: Image, actual: Image, options: DiffOptions): DiffResult {
	if (baseline.width !== actual.width || baseline.height !== actual.height) return { sizeDiffers: true, regions: [], failed: true, picture: null };
	const { width, height } = actual;
	const tallies = [...options.regions, { name: "rest", rect: { x: 0, y: 0, w: width, h: height }, ...options.rest }].map((region) => ({ region, differing: 0, pixels: 0 }));
	const picture = new Uint8Array(actual.data.length);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			if (options.masks.some((m) => inside(m, x, y))) {
				picture.set([0, 0, 160, 255], i);
				continue;
			}
			const tally = tallies.find((t) => inside(t.region.rect, x, y))!;
			tally.pixels++;
			const moved = Math.max(Math.abs(baseline.data[i] - actual.data[i]), Math.abs(baseline.data[i + 1] - actual.data[i + 1]), Math.abs(baseline.data[i + 2] - actual.data[i + 2]), Math.abs(baseline.data[i + 3] - actual.data[i + 3]));
			if (moved > tally.region.channel) {
				tally.differing++;
				picture.set([255, 0, 0, 255], i);
			} else picture.set([actual.data[i] >> 2, actual.data[i + 1] >> 2, actual.data[i + 2] >> 2, 255], i);
		}
	const regions = tallies.map((t) => ({ name: t.region.name, differing: t.differing, pixels: t.pixels, failed: t.pixels > 0 && t.differing / t.pixels > t.region.share }));
	return { sizeDiffers: false, regions, failed: regions.some((r) => r.failed), picture: { width, height, data: picture } };
}
