import type { Placement, TaskDraft } from "../../application/contracts";
import { dayMonth } from "../dates";
import type { LocalDate } from "../types";

export type Tile = "soon" | "now" | "date";

export interface SheetState {
	readonly tile: Tile;
	readonly date: LocalDate | null;
	readonly pickerOpen: boolean;
	/** The prefix of the chosen level, or none. */
	readonly priority: string | null;
}

export function tileLabel(placement: Placement, _today: LocalDate): string {
	if (placement.kind === "soon") return "Soon";
	if (placement.kind === "now") return "Now";
	return dayMonth(placement.date);
}

export function initialState(placement: Placement, priority: string | null = null): SheetState {
	return { tile: placement.kind, date: placement.kind === "date" ? placement.date : null, pickerOpen: false, priority };
}

/** A tap on a tile: Soon and Now take it; Date takes it and opens the calendar, again when a day is already chosen. */
export function togglePlacement(state: SheetState, tile: Tile): SheetState {
	return { ...state, tile, pickerOpen: tile === "date" };
}

export function pickDate(state: SheetState, date: LocalDate): SheetState {
	return { ...state, tile: "date", date, pickerOpen: false };
}

export function pickPriority(state: SheetState, priority: string | null): SheetState {
	return { ...state, priority };
}

export function placementOf(state: SheetState, today: LocalDate): Placement {
	if (state.tile === "date") return { kind: "date", date: state.date ?? today };
	return { kind: state.tile };
}

export function draftOf(text: string, state: SheetState, today: LocalDate): TaskDraft {
	return { text: text.trim(), placement: placementOf(state, today), priority: state.priority };
}
