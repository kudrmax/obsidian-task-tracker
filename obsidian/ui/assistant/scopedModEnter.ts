import { type Keymap, Scope } from "obsidian";
import type { ModEnterHold } from "./modEnter";

/** What of Obsidian the field's keys need: its keymap, and the app's own scope, whose hotkeys (⌘P…) keep working. */
export interface KeyHost {
	readonly keymap: Pick<Keymap, "pushScope" | "popScope">;
	readonly scope: Scope;
}

/**
 * In Obsidian its hotkeys hear a key before the page does, and ⌘Enter is one of them (open a link in a new tab): a scope of
 * the field's own over the app's, pushed while it has the focus, takes the key first. ⌘Z and ⌘⇧Z go on to the field, which
 * undoes its own typing; every other hotkey stays the app's.
 */
export function scopedModEnter(app: KeyHost): ModEnterHold {
	return (field, run) => {
		const scope = new Scope(app.scope);
		scope.register(["Mod"], "Enter", () => {
			run();
			return false;
		});
		scope.register(["Mod"], "z", () => true);
		scope.register(["Mod", "Shift"], "z", () => true);
		let held = false;
		const hold = (on: boolean) => {
			if (on === held) return;
			held = on;
			if (on) app.keymap.pushScope(scope);
			else app.keymap.popScope(scope);
		};
		const onFocus = () => hold(true);
		const onBlur = () => hold(false);
		field.addEventListener("focus", onFocus);
		field.addEventListener("blur", onBlur);
		return () => {
			field.removeEventListener("focus", onFocus);
			field.removeEventListener("blur", onBlur);
			hold(false);
		};
	};
}
