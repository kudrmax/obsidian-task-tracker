import { type App, type Modifier, Scope } from "obsidian";
import { holdLineCommands } from "./lineCommands";

/** A hotkey the field takes itself, before any of Obsidian's: ⌥Tab, the new section's switch. */
export interface FieldHotkey {
	readonly modifiers: readonly Modifier[];
	readonly key: string;
	run(): void;
}

const FUNCTION_KEY = /^F\d{1,2}$/;

/** A key that types into a field or edits what is typed: any but ⌘ or Ctrl held, or a function key. */
export const typesInField = (event: KeyboardEvent): boolean => !event.metaKey && !event.ctrlKey && !FUNCTION_KEY.test(event.key);

/**
 * A text field's keys over Obsidian's (F194, Decision 133). Obsidian hears every key before the field does (its keymap
 * listens on the window, capturing), so while the field has the focus its scope stands on top of the keymap: the field's
 * own hotkeys run there; the hotkeys of the commands that change a line do nothing; and no hotkey runs on a key that
 * types (a plain key, Shift or Option held: Option types a character on the Mac), the key going on to the field. The
 * other ⌘ and Ctrl hotkeys stay Obsidian's: bold, italic, a link, the command palette.
 */
export class FieldScope {
	private readonly scope: Scope;
	private held = false;

	/** `parent`: the scope the field's stands over, Obsidian's own or a note's block's, so a key the field leaves goes on there. */
	constructor(
		private readonly app: App,
		parent: Scope,
		hotkeys: readonly FieldHotkey[],
	) {
		this.scope = new Scope(parent);
		for (const { modifiers, key, run } of hotkeys)
			this.scope.register([...modifiers], key, () => {
				run();
				return false;
			});
		holdLineCommands(app, this.scope);
		this.scope.register(null, null, (event) => (typesInField(event) ? true : undefined));
	}

	/** On top of Obsidian's keymap while the field has the focus. */
	hold(on: boolean): void {
		if (on === this.held) return;
		this.held = on;
		if (on) this.app.keymap.pushScope(this.scope);
		else this.app.keymap.popScope(this.scope);
	}
}
