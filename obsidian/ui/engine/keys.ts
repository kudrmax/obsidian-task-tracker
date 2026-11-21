import { placeOf, standAt } from "./layout/columns";
import type { Screen } from "./store";

/**
 * The screen's keys (spec, «Keys»): one table, registered once by the host as Obsidian's commands and on the view's
 * `Scope`. A key does what the same gesture does. While a layer or a field is open the key is theirs (`useDismiss`
 * takes Escape, the editor its own keys), and the table's key does nothing.
 */
export interface ScreenKey {
	readonly id: string;
	readonly name: string;
	/** Obsidian's hotkey: its modifiers and key. */
	readonly modifiers: readonly ("Mod" | "Shift" | "Alt")[];
	readonly key: string;
	readonly run: (screen: Screen) => void;
}

/** The ribbon one place on or back, as a swipe lets it go one: a stop, and past the calendar a day; the ribbon lands there as from any place set from outside. */
const turn = (s: Screen, shift: -1 | 1) => standAt(s, placeOf(s.stop, s.dayOffset) + shift);

export const KEYS: readonly ScreenKey[] = [
	{ id: "step-on", name: "Ribbon: one stop on", modifiers: [], key: "ArrowRight", run: (s) => turn(s, 1) },
	{ id: "step-back", name: "Ribbon: one stop back", modifiers: [], key: "ArrowLeft", run: (s) => turn(s, -1) },
];

/** Whether the screen takes keys now: no layer, no field, no gesture holding the pointer. */
export const takesKeys = (s: Screen): boolean => s.layer === null && s.entry === null && s.gesture === null;
