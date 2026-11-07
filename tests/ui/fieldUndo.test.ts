// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ownUndo } from "../../obsidian/ui/fieldUndo";

function field() {
	const input = document.createElement("input");
	document.body.appendChild(input);
	ownUndo(input);
	const heard = vi.fn();
	document.addEventListener("keydown", heard);
	const exec = vi.fn(() => true);
	(document as unknown as { execCommand: typeof exec }).execCommand = exec;
	return { input, heard, exec };
}

const press = (input: HTMLElement, init: KeyboardEventInit) => {
	const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
	input.dispatchEvent(e);
	return e;
};

describe("Cmd+Z in a plain field of the plugin", () => {
	it("undoes and redoes the field's own typing and goes no further: the app's Undo menu never hears it", () => {
		const { input, heard, exec } = field();
		expect(press(input, { key: "z", metaKey: true }).defaultPrevented).toBe(true);
		expect(press(input, { key: "Z", metaKey: true, shiftKey: true }).defaultPrevented).toBe(true);
		expect(exec.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["undo", "redo"]);
		expect(heard).not.toHaveBeenCalled();
	});

	it("leaves every other key to the field", () => {
		const { input, exec } = field();
		expect(press(input, { key: "z" }).defaultPrevented).toBe(false);
		expect(press(input, { key: "a", metaKey: true }).defaultPrevented).toBe(false);
		expect(exec).not.toHaveBeenCalled();
	});
});
