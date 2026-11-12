/**
 * What a column's rows take, from its top to its last row's foot and its padding. Not its box, which may be stretched
 * taller than they need, and not its `scrollHeight`, which leaves out a last row's negative margin: a row folding away
 * gives the column's gap back that way, so the column would read a gap taller than it rests at.
 */
export function contentHeight(column: HTMLElement): number {
	const rows = flowRows(column);
	const last = rows[rows.length - 1];
	if (!last) return column.scrollHeight;
	const foot = last.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(last).marginBottom) || 0);
	return foot - column.getBoundingClientRect().top + column.scrollTop + (parseFloat(getComputedStyle(column).paddingBottom) || 0);
}

/** The rows in a column's flow: drawn, and not laid over it (a drop line). */
function flowRows(column: HTMLElement): HTMLElement[] {
	return [...column.children].filter((row): row is HTMLElement => {
		if (!(row instanceof HTMLElement) || row.getClientRects().length === 0) return false;
		const position = getComputedStyle(row).position;
		return position !== "absolute" && position !== "fixed";
	});
}
