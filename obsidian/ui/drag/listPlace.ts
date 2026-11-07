import { type GapPlace, type Header, type ListCard, type PlacedCard as LevelPlacedCard, sameGap } from "../../../core/application/contracts";
export { type PlacedHead, placeAt } from "../../../core/application/contracts";

/** A card of the list as the drop sees it: the whole list card, and where it stands. */
export type PlacedCard = ListCard & LevelPlacedCard;

/** The same header: the same section, of the same project's part in a grouped list. */
export function sameHeader(a: Header, b: Header): boolean {
	return sameGap(gapUnder(a), gapUnder(b));
}

/** A gap under a header, which `sameGap` weighs by its section and project's part alone. */
function gapUnder(header: Header): GapPlace {
	return { kind: "gap", index: 0, level: 0, ...(header !== null && typeof header === "object" ? header : { group: header }) };
}

/** The header a place's section and project's part are drawn under. */
export function headerOfPlace(place: GapPlace): Header {
	return place.project === undefined ? place.group : { group: place.group, project: place.project };
}
