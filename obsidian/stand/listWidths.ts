import type { DividerStop, ListWidths } from "../ui/engine/port";

/**
 * The core's divider rule (`core/application/listWidth.ts`: `LIST_WIDTHS`, `listWidths`, `listShareOf`, `DIVIDER_SNAP`,
 * `dividerAt`) served by the stand, which may not import the core, by the same values; `CorePort` serves the core's own in
 * the plan's step 5 and this file goes. `tests/ui/engine/divider.test.ts` holds it to the core's.
 */
export const LIST_BOUNDS = { min: 110, max: 280 } as const;
const SNAP = { distance: 8, slowSpeed: 0.08 } as const;

export function listWidths(share: number, viewWidth: number, dividerWidth: number): ListWidths {
	const columns = viewWidth - dividerWidth;
	const max = Math.max(LIST_BOUNDS.max, columns - LIST_BOUNDS.min);
	return { width: Math.min(max, Math.max(LIST_BOUNDS.min, share * columns)), min: LIST_BOUNDS.min, max, center: columns / 2 };
}

export const listShareOf = (width: number, viewWidth: number, dividerWidth: number): number => width / (viewWidth - dividerWidth);

export function dividerAt(wanted: number, widths: ListWidths, speed: number): DividerStop {
	const reachable = widths.center >= widths.min && widths.center <= widths.max;
	const snapped = reachable && speed < SNAP.slowSpeed && Math.abs(wanted - widths.center) <= SNAP.distance;
	const width = snapped ? widths.center : Math.round(wanted);
	return { width: Math.min(widths.max, Math.max(widths.min, width)), snapped };
}
