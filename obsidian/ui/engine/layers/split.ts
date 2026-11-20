/**
 * How many of a panel's groups stand over the copy of the pressed card (the plugin's rule, `obsidian/ui/menu/MenuPanel.ts`
 * `groupsAbove`, carried into the engine): none (the panel under it), all (over it), or the first few, the rest under it,
 * when the whole fits on neither side. `cuts` are the heights of the panel down to each border between groups, `total`
 * its whole height. The first way that fits wins, in that order and with the fewest groups over the copy. When none fits,
 * a panel that splits keeps over the copy only the groups that fit there whole, and the rest scrolls under it: one part
 * scrolls, never the one over the card, whose cut would halve its tiles (F313), unless the room under the copy holds
 * not one row (`least`): then the whole panel goes over it and scrolls there. A panel that can't split goes whole to the
 * side that leaves the least to scroll.
 */
export function groupsAbove(cuts: readonly number[], total: number, above: number, below: number, canSplit: boolean, least = 0): number {
	const groups = cuts.length + 1;
	const over = (height: number, space: number) => Math.max(0, height - space);
	const ways = [
		{ count: 0, overflow: over(total, below) },
		{ count: groups, overflow: over(total, above) },
		...(canSplit ? cuts.map((cut, i) => ({ count: i + 1, overflow: over(cut, above) + over(total - cut, below) })) : []),
	];
	const fits = ways.find((way) => way.overflow === 0);
	if (fits) return fits.count;
	if (canSplit) {
		const count = cuts.filter((cut) => cut <= above).length;
		/** The part under the copy would have no room for one row (`least`; a copy at the window's bottom): the whole panel goes over it and scrolls there, so no group is out of reach. */
		const firstUnder = (count < cuts.length ? cuts[count] : total) - (count > 0 ? cuts[count - 1] : 0);
		return below < Math.min(firstUnder, least) ? groups : count;
	}
	return ways.reduce((best, way) => (way.overflow < best.overflow ? way : best)).count;
}
