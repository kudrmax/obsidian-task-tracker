import type { App, Modifier, Scope } from "obsidian";

/**
 * Obsidian's editor commands that change what a line is (a checkbox, a list, a heading, a quote, a block) or move lines.
 * A task's title is one line of the tasks file and its description lines sit under it: run there, they would turn the
 * title into a second checkbox or a description line into a subtask.
 */
export const LINE_COMMANDS: readonly string[] = [
	"editor:toggle-checklist-status",
	"editor:cycle-list-checklist",
	"editor:toggle-bullet-list",
	"editor:toggle-numbered-list",
	"editor:toggle-blockquote",
	"editor:set-heading",
	"editor:set-heading-0",
	"editor:set-heading-1",
	"editor:set-heading-2",
	"editor:set-heading-3",
	"editor:set-heading-4",
	"editor:set-heading-5",
	"editor:set-heading-6",
	"editor:insert-callout",
	"editor:insert-codeblock",
	"editor:insert-mathblock",
	"editor:insert-table",
	"editor:insert-horizontal-rule",
	"editor:swap-line-up",
	"editor:swap-line-down",
	"editor:indent-list",
	"editor:unindent-list",
];

interface Hotkey {
	readonly modifiers: readonly Modifier[];
	readonly key: string;
}

/** The hotkeys Obsidian runs a command on: the ones set in its settings, else its own. Obsidian doesn't publish them. */
interface Hotkeys {
	getHotkeys(id: string): readonly Hotkey[] | undefined;
	getDefaultHotkeys(id: string): readonly Hotkey[] | undefined;
}

function lineHotkeys(app: App): readonly Hotkey[] {
	const hotkeys = (app as unknown as { hotkeyManager?: Hotkeys }).hotkeyManager;
	if (!hotkeys) return [];
	return LINE_COMMANDS.flatMap((id) => hotkeys.getHotkeys(id) ?? hotkeys.getDefaultHotkeys(id) ?? []);
}

/** The hotkeys of `LINE_COMMANDS` taken in `scope`, doing nothing: while the field's scope is on top, none reaches the command. */
export function holdLineCommands(app: App, scope: Scope): void {
	for (const { modifiers, key } of lineHotkeys(app)) scope.register([...modifiers], key, () => false);
}

/**
 * The same hotkeys as CodeMirror names them (`Mod-l`, `Mod-Shift-8`): Obsidian's editor runs its editor commands from its
 * own keymap, before any scope hears the key, so the field's editor takes them first.
 */
export function lineCommandKeys(app: App): readonly string[] {
	return lineHotkeys(app).map(({ modifiers, key }) => [...modifiers, key.length === 1 ? key.toLowerCase() : key].join("-"));
}
