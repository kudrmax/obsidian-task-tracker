/** A box on the screen, as getBoundingClientRect gives it. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
}

export type Side = "below" | "above";

/** Where the desktop bar stands, in the screen's coordinates: its top left corner, and the side of the field it took. */
export interface BarSpot {
	readonly left: number;
	readonly top: number;
	readonly side: Side;
}

/**
 * The desktop bar next to its field: right under it, its right edge on the field's right edge, `gap` apart; where `room`
 * (what shows of the column) has no place for it below the field, over the field. An open panel of `panel` px hangs
 * from the bar away from the field, so the side is chosen for the two together while they fit on one; else for the bar
 * alone. Null while no part of the field shows.
 */
export function barBesideField(field: Box, room: Box, bar: { readonly width: number; readonly height: number }, gap: number, panel = 0): BarSpot | null {
	if (field.bottom <= room.top || field.top >= room.bottom) return null;
	const left = field.right - bar.width;
	const below = field.bottom + gap;
	const above = field.top - gap - bar.height;
	const fitsBelow = (extra: number) => below + bar.height + extra <= room.bottom;
	const fitsAbove = (extra: number) => above - extra >= room.top;
	const withPanel = panel > 0 ? panel + gap : 0;
	for (const extra of withPanel > 0 ? [withPanel, 0] : [0]) {
		if (fitsBelow(extra)) return { left, top: below, side: "below" };
		if (fitsAbove(extra)) return { left, top: above, side: "above" };
	}
	return { left, top: below, side: "below" };
}

/**
 * Which side of the desktop bar its panel opens on: away from the field, the side the bar took; the other side when the
 * panel has no place there in `room` and has it there.
 */
export function panelSide(bar: Box, barSide: Side, panelHeight: number, room: Box, gap: number): Side {
	const fitsBelow = bar.bottom + gap + panelHeight <= room.bottom;
	const fitsAbove = bar.top - gap - panelHeight >= room.top;
	if (barSide === "below") return fitsBelow || !fitsAbove ? "below" : "above";
	return fitsAbove || !fitsBelow ? "above" : "below";
}
