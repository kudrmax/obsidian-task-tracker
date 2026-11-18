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

export const KEYS: readonly ScreenKey[] = [
	{ id: "step-on", name: "Ribbon: one stop on", modifiers: [], key: "ArrowRight", run: (s) => s.step(1) },
	{ id: "step-back", name: "Ribbon: one stop back", modifiers: [], key: "ArrowLeft", run: (s) => s.step(-1) },
];

/** Whether the screen takes keys now: no layer, no field, no gesture holding the pointer. */
export const takesKeys = (s: Screen): boolean => s.layer === null && s.entry === null && s.gesture === null;
