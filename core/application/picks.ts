import { canPick } from "./menus";
import type { MenuFrom } from "./contracts";

/** Select tasks as a screen holds it: on or off, the picked tasks' ids in the order picked, the one a Shift-click runs from. */
export interface Picks {
	readonly picking: boolean;
	readonly picked: readonly string[];
	readonly anchor: string | null;
}

/** The keys held on a tap or click: ⌘ (Ctrl off the Mac) and Shift. */
export interface PickKeys {
	readonly mod: boolean;
	readonly shift: boolean;
}

/**
 * What a tap on a list card did (`tapPick`): the picks after it; whether the selection took it; and what opens: the menu
 * for every picked task (`"bulk"`), the card's own menu (`"own"`, the selection let it go) or nothing.
 */
export interface PickTap {
	readonly took: boolean;
	readonly picks: Picks;
	readonly opens: "bulk" | "own" | null;
}

/** Nothing picked, Select tasks off: a screen's picks as it opens. */
export const NO_PICKS: Picks = { picking: false, picked: [], anchor: null };

/** A card picked, or let go if it was: a card let go leaves no card a run is picked from. */
export function togglePick(picks: Picks, id: string): Picks {
	if (picks.picked.includes(id)) return { ...picks, picked: picks.picked.filter((other) => other !== id), anchor: null };
	return { ...picks, picked: [...picks.picked, id], anchor: id };
}

/** Shift-click: the cards of the list (`cards`, in its order) from the one picked last to this one join; without one there, only this one. */
export function pickRun(picks: Picks, id: string, cards: readonly string[]): Picks {
	const from = picks.anchor === null ? -1 : cards.indexOf(picks.anchor);
	const to = cards.indexOf(id);
	if (from < 0 || to < 0) return togglePick(picks, id);
	const run = cards.slice(Math.min(from, to), Math.max(from, to) + 1).filter((other) => other !== id && !picks.picked.includes(other));
	return { ...picks, picked: [...picks.picked, ...run, ...(picks.picked.includes(id) ? [] : [id])], anchor: id };
}

/**
 * A list card drawn at `from` tapped or clicked with `keys`; `cards` are its list's cards in order. In Select tasks a tap
 * picks it or lets it go; ⌘ does that, Shift picks a run while something is picked; a click on one of several picked opens
 * their menu; otherwise the picks go and the card's own menu opens.
 */
export function tapPick(picks: Picks, id: string, from: MenuFrom, cards: readonly string[], keys: PickKeys): PickTap {
	const pickable = canPick(from);
	if (picks.picking) return { took: true, picks: pickable ? togglePick(picks, id) : picks, opens: null };
	if (pickable && keys.mod) return { took: true, picks: togglePick(picks, id), opens: null };
	if (pickable && keys.shift && picks.picked.length > 0) return { took: true, picks: pickRun(picks, id, cards), opens: null };
	if (picks.picked.includes(id) && picks.picked.length > 1) return { took: true, picks, opens: "bulk" };
	return { took: false, picks: NO_PICKS, opens: "own" };
}

/** Select tasks turned on, keeping the cards picked with ⌘; or off, every picked card let go. */
export function setPicking(picks: Picks, on: boolean): Picks {
	return on ? { ...picks, picking: true } : NO_PICKS;
}

/** A press beside the cards: the ⌘-picks go; Select tasks keeps its picks. */
export function pressedBeside(picks: Picks): Picks {
	return picks.picking ? picks : NO_PICKS;
}

/** Whether a card may be lifted: any card, picked or not, in Select tasks or not. */
export function canLift(_picks: Picks, _id: string): boolean {
	return true;
}

/** The picks once card `id` is lifted: a card not picked lifted alone lets the ⌘-picks go; Select tasks keeps its picks. */
export function liftedPicks(picks: Picks, id: string): Picks {
	return picks.picking || picks.picked.includes(id) ? picks : NO_PICKS;
}
