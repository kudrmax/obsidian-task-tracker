import { describe, expect, it } from "vitest";
import type { App, Scope } from "obsidian";
import { holdLineCommands, LINE_COMMANDS, lineCommandKeys } from "../../obsidian/ui/markdown/lineCommands";

function app(custom: Record<string, { modifiers: string[]; key: string }[]>, defaults: Record<string, { modifiers: string[]; key: string }[]>) {
	return { hotkeyManager: { getHotkeys: (id: string) => custom[id], getDefaultHotkeys: (id: string) => defaults[id] } } as unknown as App;
}

function scope() {
	const taken: { modifiers: string[]; key: string; run: () => unknown }[] = [];
	return { taken, scope: { register: (modifiers: string[], key: string, run: () => unknown) => taken.push({ modifiers, key, run }) } as unknown as Scope };
}

describe("a task's field keeps Obsidian's line commands out", () => {
	it("takes Cmd+L (Toggle checkbox) and the hotkeys set for lists, headings and quotes, doing nothing with them", () => {
		const { taken, scope: s } = scope();
		holdLineCommands(app({ "editor:toggle-bullet-list": [{ modifiers: ["Mod", "Shift"], key: "8" }] }, { "editor:toggle-checklist-status": [{ modifiers: ["Mod"], key: "L" }] }), s);
		expect(taken.map(({ modifiers, key }) => `${modifiers.join("+")}+${key}`).sort()).toEqual(["Mod+L", "Mod+Shift+8"]);
		expect(taken.every(({ run }) => run() === false)).toBe(true);
	});

	it("a hotkey set in the settings stands in place of the command's own", () => {
		const { taken, scope: s } = scope();
		holdLineCommands(app({ "editor:toggle-checklist-status": [{ modifiers: ["Mod", "Alt"], key: "C" }] }, { "editor:toggle-checklist-status": [{ modifiers: ["Mod"], key: "L" }] }), s);
		expect(taken.map(({ key }) => key)).toEqual(["C"]);
	});

	it("names the same hotkeys for the field's editor, which runs editor commands from its own keymap", () => {
		expect(lineCommandKeys(app({ "editor:toggle-bullet-list": [{ modifiers: ["Mod", "Shift"], key: "8" }] }, { "editor:toggle-checklist-status": [{ modifiers: ["Mod"], key: "L" }] })).slice().sort()).toEqual(["Mod-Shift-8", "Mod-l"]);
	});

	it("leaves inline marks alone: bold, italic and links stay the field's", () => {
		expect(LINE_COMMANDS).not.toContain("editor:toggle-bold");
		expect(LINE_COMMANDS).not.toContain("editor:toggle-italics");
		expect(LINE_COMMANDS).not.toContain("editor:insert-link");
		expect(LINE_COMMANDS).toContain("editor:toggle-checklist-status");
	});
});
