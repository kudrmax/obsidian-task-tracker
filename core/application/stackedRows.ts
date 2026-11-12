/**
 * The heights of the lists the rows view stacks one under another (Inbox, Backlog, Soon, the day), `wanted` each list's
 * title and rows, `room` the height they share: each as tall as it wants while they all fit; when they don't, a list
 * shorter than an even share keeps its own height and the others share the rest evenly, each scrolling within it. No
 * list is ever shorter than `least` (its title and one card), so a long list never hides the ones under it.
 */
export function stackedRows(wanted: readonly number[], room: number, least: number): number[] {
	if (wanted.length === 0) return [];
	const asked = wanted.map((height) => Math.max(height, least));
	if (asked.reduce((sum, height) => sum + height, 0) <= room) return asked;
	const heights = [...asked];
	let left = Math.max(room, least * asked.length);
	const open = asked.map((_, i) => i).sort((a, b) => asked[a] - asked[b]);
	while (open.length > 0) {
		const share = left / open.length;
		const first = open[0];
		if (asked[first] > share) {
			for (const i of open) heights[i] = share;
			return heights;
		}
		heights[first] = asked[first];
		left -= asked[first];
		open.shift();
	}
	return heights;
}

/** One list of the rows view as the frontend measured it: its whole height (title, cards, plate), and where each card ends, from its top. */
export interface StackedList {
	readonly wanted: number;
	/** The bottom of each card, ascending, the title in: where a list that scrolls may end, above its fade. */
	readonly stops: readonly number[];
}

/**
 * The heights of the rows view's lists, measured (`StackedList`), sharing `room`: each as tall as it is while all fit;
 * when they don't, `stackedRows`' even shares, then each list that has to scroll ends under a whole card and the scroll's
 * `fade`, so the fade never lies on a card. What that frees goes, a card at a time, to the list it lets show one more
 * (the smallest step first, the upper list of two alike), or its whole height. None is shorter than its first card and
 * the fade, or its whole height when that is less (an empty list's plate).
 */
export function stackedLists(lists: readonly StackedList[], room: number, fade: number): number[] {
	const wanted = lists.map((list) => list.wanted);
	if (wanted.reduce((sum, height) => sum + height, 0) <= room) return wanted;
	const least = lists.map((list) => Math.min(list.wanted, (list.stops[0] ?? list.wanted) + fade));
	const heights = stackedRows(wanted, room, 0).map((height, i) => Math.max(least[i], snapped(lists[i], height, fade)));
	let left = room - heights.reduce((sum, height) => sum + height, 0);
	for (;;) {
		const steps = lists.map((list, i) => grown(list, heights[i], fade) - heights[i]);
		const next = steps.reduce((best, step, i) => (step > 0 && step <= left && (best < 0 || step < steps[best]) ? i : best), -1);
		if (next < 0) return heights;
		heights[next] += steps[next];
		left -= steps[next];
	}
}

/** A list given `height`: its whole height when that fits, else down to its last whole card and the fade. */
function snapped(list: StackedList, height: number, fade: number): number {
	if (height >= list.wanted) return list.wanted;
	return list.stops.map((stop) => stop + fade).filter((end) => end <= height && end < list.wanted).pop() ?? 0;
}

/** The height a list stands at one card more: its next card and the fade, or its whole height when that comes first. */
function grown(list: StackedList, height: number, fade: number): number {
	const end = list.stops.map((stop) => stop + fade).find((at) => at > height) ?? list.wanted;
	return Math.min(end, list.wanted);
}
