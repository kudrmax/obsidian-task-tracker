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
