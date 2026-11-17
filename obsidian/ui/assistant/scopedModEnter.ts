import { type App, Scope } from "obsidian";
import type { ModEnterHold } from "./modEnter";

/**
 * In Obsidian its hotkeys hear a key before the page does, and ⌘Enter is one of them (open a link in a new tab): a scope of
 * the field's own, pushed while it has the focus, takes the key first. Its other keys go on to the field as typed.
 */
export function scopedModEnter(app: App): ModEnterHold {
	return (field, run) => {
		const scope = new Scope();
		scope.register(["Mod"], "Enter", () => {
			run();
			return false;
		});
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
