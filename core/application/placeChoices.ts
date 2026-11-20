import type { GroupedList } from "../domain/Lists";
import type { Placement } from "../domain/Placement";
import type { LocalDate } from "../domain/Task";

/** The places a task may be sent to, before the date: the lists, in this order. The field's place panel and the menu's Pick a date page offer the same. */
export const ENTRY_PLACES: readonly GroupedList[] = ["inbox", "backlog", "soon", "now"];

/** A tile of the place button's panel: a list, or Date last, which opens the month picker on the field's day if it has one. */
export type PlaceChoice = { readonly kind: GroupedList; readonly on: boolean } | { readonly kind: "date"; readonly on: boolean; readonly date: LocalDate | null };

/** The list tiles for tasks going to `places`: each on while every one goes there. */
export function listChoices(places: readonly Placement[]): readonly Extract<PlaceChoice, { readonly kind: GroupedList }>[] {
	return ENTRY_PLACES.map((kind) => ({ kind, on: places.length > 0 && places.every((place) => place.kind === kind) }));
}

/** The place button's tiles for a task going to `place`: the lists, then Date, the one it goes to on. */
export function placeChoices(place: Placement | null): readonly PlaceChoice[] {
	const date = place?.kind === "date" ? place.date : null;
	return [...listChoices(place ? [place] : []), { kind: "date", on: date !== null, date }];
}

/** Whether tasks may be sent to a place: only tasks of the top level; a subtask stands under its task. */
export function placeable(tasks: readonly { readonly isSubtask: boolean }[]): boolean {
	return tasks.length > 0 && tasks.every((task) => !task.isSubtask);
}
