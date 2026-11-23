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
	/** Only while this holds: a key that does nothing now is left to Obsidian. */
	readonly when?: (screen: Screen) => boolean;
}

/** The ribbon one place on or back, as a swipe lets it go one: a stop, and past the calendar a day; the ribbon lands there as from any place set from outside. */
const turn = (s: Screen, shift: -1 | 1) => standAt(s, placeOf(s.stop, s.dayOffset) + shift);

export const KEYS: readonly ScreenKey[] = [
	{ id: "step-on", name: "Ribbon: one stop on", modifiers: [], key: "ArrowRight", run: (s) => turn(s, 1) },
	{ id: "step-back", name: "Ribbon: one stop back", modifiers: [], key: "ArrowLeft", run: (s) => turn(s, -1) },
	/** ⌘Z does what the Undo button does, ⌘⇧Z does the step again (F268); in a field the field keeps them (the table takes no key while one is open). */
	{ id: "undo", name: "Undo", modifiers: ["Mod"], key: "z", run: (s) => s.undo() },
	{ id: "redo", name: "Redo", modifiers: ["Mod", "Shift"], key: "z", run: (s) => s.redo() },
	/** ⌘F opens the search, as «⋯» → Search does (F250). */
	{ id: "search", name: "Search tasks", modifiers: ["Mod"], key: "f", run: (s) => s.openSheet("search") },
	/** Escape lets the picked tasks go and ends Select tasks (F137, F145); a menu or a drag over them takes its own Escape first. */
	{ id: "stop-picking", name: "Let the picked tasks go", modifiers: [], key: "Escape", run: (s) => s.clearPicks(), when: (s) => s.picking || s.picked.length > 0 },
];

/** Whether the screen takes `key` now: no layer, no field, no gesture holding the pointer, and the key's own condition. */
export const takesKeys = (s: Screen, key?: ScreenKey): boolean => s.layer === null && s.sheet === null && s.entry === null && s.gesture === null && (key?.when?.(s) ?? true);
