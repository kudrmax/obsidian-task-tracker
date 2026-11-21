import { describe, expect, it } from "vitest";
import type { App, Scope } from "obsidian";
import { FieldScope, typesInField } from "../../obsidian/ui/markdown/fieldScope";

interface Taken {
	readonly modifiers: string[] | null;
	readonly key: string | null;
	readonly run: (event?: KeyboardEvent) => unknown;
}

function app() {
	const stack: { keys: Taken[] }[] = [];
	const fake = {
		scope: {},
		hotkeyManager: { getHotkeys: () => undefined, getDefaultHotkeys: (id: string) => (id === "editor:toggle-checklist-status" ? [{ modifiers: ["Mod"], key: "L" }] : undefined) },
		keymap: { pushScope: (scope: { keys: Taken[] }) => stack.push(scope), popScope: (scope: { keys: Taken[] }) => stack.splice(stack.indexOf(scope), 1) },
	};
	return { stack, app: fake as unknown as App };
}

const key = (key: string, more: Partial<KeyboardEventInit> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...more }) as KeyboardEvent;

describe("a task's field keeps Obsidian's hotkeys off what is typed (F194, Decision 133)", () => {
	it("stands over Obsidian's keymap while the field has the focus, once, and leaves with it", () => {
		const { stack, app: a } = app();
		const scope = new FieldScope(a, a.scope, []);
		scope.hold(true);
		scope.hold(true);
		expect(stack).toHaveLength(1);
		scope.hold(false);
		expect(stack).toHaveLength(0);
	});

	it("stands over the scope it is given, so a key it leaves goes on there (a note's block's)", () => {
		const { stack, app: a } = app();
		const block = { keys: [] } as unknown as Scope;
		new FieldScope(a, block, []).hold(true);
		expect((stack[0] as unknown as { parent: unknown }).parent).toBe(block);
	});

	it("runs the field's own hotkey first and keeps it from the page: ⌥Tab, the new section", () => {
		const { stack, app: a } = app();
		let runs = 0;
		new FieldScope(a, a.scope, [{ modifiers: ["Alt"], key: "Tab", run: () => runs++ }]).hold(true);
		const own = stack[0].keys[0];
		expect([own.modifiers, own.key]).toEqual([["Alt"], "Tab"]);
		expect(own.run()).toBe(false);
		expect(runs).toBe(1);
	});

	it("holds the line commands' hotkeys, doing nothing with them", () => {
		const { stack, app: a } = app();
		new FieldScope(a, a.scope, []).hold(true);
		const line = stack[0].keys.find((k) => k.key === "L");
		expect(line?.modifiers).toEqual(["Mod"]);
		expect(line?.run()).toBe(false);
	});

	it("lets no hotkey run on a key that types, the key going on to the field; ⌘ and Ctrl hotkeys stay Obsidian's", () => {
		const { stack, app: a } = app();
		new FieldScope(a, a.scope, []).hold(true);
		const any = stack[0].keys[stack[0].keys.length - 1];
		expect([any.modifiers, any.key]).toEqual([null, null]);
		expect(any.run(key("a"))).toBe(true);
		expect(any.run(key("å", { altKey: true }))).toBe(true);
		expect(any.run(key("A", { shiftKey: true }))).toBe(true);
		expect(any.run(key("Enter"))).toBe(true);
		expect(any.run(key("p", { metaKey: true }))).toBeUndefined();
		expect(any.run(key("b", { ctrlKey: true }))).toBeUndefined();
		expect(any.run(key("F5"))).toBeUndefined();
	});

	it("counts as typing every key but ⌘, Ctrl and the function keys", () => {
		expect(typesInField(key("x", { altKey: true, shiftKey: true }))).toBe(true);
		expect(typesInField(key("F12"))).toBe(false);
		expect(typesInField(key("l", { metaKey: true }))).toBe(false);
	});
});
