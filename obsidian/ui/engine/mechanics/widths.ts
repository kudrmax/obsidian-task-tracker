/** The list column's least width beside the timeline, and its most on a phone. */
export const LIST_BOUNDS = { min: 110, max: 280 } as const;

/** A divider brought within this of the middle slower than `slowSpeed` (px per ms) holds to the middle. */
export const MIDDLE_HOLD = { distance: 8, slowSpeed: 0.08 } as const;

/** The list's width beside the timeline: drawn, its bounds, and the width that puts the divider in the window's middle. */
export interface ListWidths {
	readonly width: number;
	readonly min: number;
	readonly max: number;
	readonly middle: number;
}

/**
 * The list beside the timeline as `share` of the width the two split (the window less the divider): on a phone within the
 * design's bounds; a wider window lets it grow until the timeline is as narrow as the list may be.
 */
export function listWidths(share: number, width: number, divider: number): ListWidths {
	const room = width - divider;
	const max = Math.max(LIST_BOUNDS.max, room - LIST_BOUNDS.min);
	return { width: clamp(share * room, LIST_BOUNDS.min, max), min: LIST_BOUNDS.min, max, middle: room / 2 };
}

/** The share a list `list` wide takes: what a divider let go there keeps. */
export function shareOf(list: number, width: number, divider: number): number {
	return list / (width - divider);
}

/** Where a dragged divider stands: the width it asks for, held to the middle when brought there slowly, within the bounds. */
export function dividerStop(wanted: number, widths: ListWidths, speed: number): { readonly width: number; readonly held: boolean } {
	const reachable = widths.middle >= widths.min && widths.middle <= widths.max;
	const held = reachable && Math.abs(speed) < MIDDLE_HOLD.slowSpeed && Math.abs(wanted - widths.middle) <= MIDDLE_HOLD.distance;
	return { width: clamp(held ? widths.middle : Math.round(wanted), widths.min, widths.max), held };
}

/**
 * All columns: Inbox, Soon and the day's list each `list` wide, then the timeline, a divider between each two. The share
 * kept is one list's against the timeline, so at the middle the four are equal; the timeline keeps at least a list's least.
 */
export function allColumns(share: number, width: number, divider: number): { readonly list: number; readonly timeline: number; readonly bounds: ListWidths } {
	const room = width - 3 * divider;
	const max = Math.max(LIST_BOUNDS.min, (room - LIST_BOUNDS.min) / 3);
	const list = clamp((share * room) / (1 + 2 * share), LIST_BOUNDS.min, max);
	return { list, timeline: room - 3 * list, bounds: { width: list, min: LIST_BOUNDS.min, max, middle: room / 4 } };
}

/** The share all columns' lists `list` wide keep: one list's against the timeline. */
export function allColumnsShare(list: number, width: number, divider: number): number {
	const timeline = width - 3 * divider - 3 * list;
	return list + timeline > 0 ? list / (list + timeline) : 0.5;
}

/** One list of the rows as drawn: its whole height and where each card ends, from its top. */
export interface RowList {
	readonly wanted: number;
	readonly stops: readonly number[];
}

/**
 * The rows' heights sharing `room`: each as tall as it wants while all fit; else a list shorter than an even share keeps
 * its height and the rest share evenly; a list that scrolls ends under a whole card and the fade (never a card cut by the
 * fade), what that frees going a card at a time to the list it lets show one more. None shorter than its first card and fade.
 */
export function rowHeights(lists: readonly RowList[], room: number, fade: number): number[] {
	const wanted = lists.map((list) => list.wanted);
	if (sum(wanted) <= room) return wanted;
	const shares = evenShares(wanted, room);
	const least = lists.map((list) => Math.min(list.wanted, (list.stops[0] ?? list.wanted) + fade));
	const heights = lists.map((list, i) => Math.max(least[i], wholeCards(list, shares[i], fade)));
	let left = room - sum(heights);
	for (;;) {
		const steps = lists.map((list, i) => nextCard(list, heights[i], fade) - heights[i]);
		const next = steps.reduce((best, step, i) => (step > 0 && step <= left && (best < 0 || step < steps[best]) ? i : best), -1);
		if (next < 0) return heights;
		heights[next] += steps[next];
		left -= steps[next];
	}
}

/** Even shares of `room`: a list wanting less than its share keeps what it wants, the others share the rest. */
function evenShares(wanted: readonly number[], room: number): number[] {
	const heights = [...wanted];
	let left = room;
	const open = wanted.map((_, i) => i).sort((a, b) => wanted[a] - wanted[b]);
	while (open.length > 0) {
		const share = left / open.length;
		if (wanted[open[0]] > share) {
			for (const i of open) heights[i] = share;
			return heights;
		}
		left -= wanted[open[0]];
		open.shift();
	}
	return heights;
}

/** A list given `height`: its whole height when that fits, else down to its last whole card and the fade. */
function wholeCards(list: RowList, height: number, fade: number): number {
	if (height >= list.wanted) return list.wanted;
	return list.stops.map((stop) => stop + fade).filter((end) => end <= height && end < list.wanted).pop() ?? 0;
}

/** The height a list stands at with one card more: its next card and the fade, or its whole height. */
function nextCard(list: RowList, height: number, fade: number): number {
	return Math.min(list.stops.map((stop) => stop + fade).find((end) => end > height) ?? list.wanted, list.wanted);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sum = (xs: readonly number[]) => xs.reduce((total, x) => total + x, 0);
