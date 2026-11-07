import type { ListCard, PlacedCard as LevelPlacedCard } from "../../../core/application/contracts";
export { type PlacedHead, placeAt } from "../../../core/application/contracts";

/** A card of the list as the drop sees it: the whole list card, and where it stands. */
export type PlacedCard = ListCard & LevelPlacedCard;
