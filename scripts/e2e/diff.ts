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
	/**
	 * The most differing pixels that may touch one another (8 ways): a share of a whole shot hides a short label one pixel
	 * off, whose differing pixels lie together along its strokes, while the GPU's rounding scatters single pixels. Scale
	 * it with the shot's pixel ratio (`clusterFor`). Unset: no cluster rule.
	 */
	readonly cluster?: number;
}

/** The cluster bound of a shot: a few CSS pixels' worth at its pixel ratio, so a stroke one pixel off is always more. */
export const CLUSTER_CSS_PX = 4;
export const clusterFor = (dpr: number): number => Math.max(4, Math.ceil(CLUSTER_CSS_PX * dpr * dpr));

export interface RegionResult {
	readonly name: string;
	readonly differing: number;
	readonly pixels: number;
	readonly failed: boolean;
}

export interface DiffResult {
	readonly sizeDiffers: boolean;
	readonly regions: readonly RegionResult[];
	/** The largest group of differing pixels touching one another, where it starts and how many; null when none differs. */
	readonly largestCluster: { readonly x: number; readonly y: number; readonly pixels: number } | null;
	readonly failed: boolean;
	/** The new image dimmed, its differing pixels in red, the masks blue. */
	readonly picture: Image | null;
}

const inside = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export function diffImages(baseline: Image, actual: Image, options: DiffOptions): DiffResult {
	if (baseline.width !== actual.width || baseline.height !== actual.height) return { sizeDiffers: true, regions: [], largestCluster: null, failed: true, picture: null };
	const { width, height } = actual;
	const tallies = [...options.regions, { name: "rest", rect: { x: 0, y: 0, w: width, h: height }, ...options.rest }].map((region) => ({ region, differing: 0, pixels: 0 }));
	const picture = new Uint8Array(actual.data.length);
	const differs = new Uint8Array(width * height);
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
				differs[y * width + x] = 1;
				picture.set([255, 0, 0, 255], i);
			} else picture.set([actual.data[i] >> 2, actual.data[i + 1] >> 2, actual.data[i + 2] >> 2, 255], i);
		}
	const regions = tallies.map((t) => ({ name: t.region.name, differing: t.differing, pixels: t.pixels, failed: t.pixels > 0 && t.differing / t.pixels > t.region.share }));
	const largestCluster = largest(differs, width, height);
	const clustered = options.cluster !== undefined && largestCluster !== null && largestCluster.pixels > options.cluster;
	return { sizeDiffers: false, regions, largestCluster, failed: regions.some((r) => r.failed) || clustered, picture: { width, height, data: picture } };
}

/** The largest 8-connected group of set pixels. */
function largest(set: Uint8Array, width: number, height: number): { x: number; y: number; pixels: number } | null {
	const seen = new Uint8Array(set.length);
	let best: { x: number; y: number; pixels: number } | null = null;
	const stack: number[] = [];
	for (let start = 0; start < set.length; start++) {
		if (!set[start] || seen[start]) continue;
		let pixels = 0;
		seen[start] = 1;
		stack.push(start);
		while (stack.length) {
			const i = stack.pop()!;
			pixels++;
			const x = i % width;
			const y = (i - x) / width;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
					const j = ny * width + nx;
					if (set[j] && !seen[j]) {
						seen[j] = 1;
						stack.push(j);
					}
				}
		}
		if (!best || pixels > best.pixels) best = { x: start % width, y: Math.floor(start / width), pixels };
	}
	return best;
}
