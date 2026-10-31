// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GroupNameField } from "../../src/ui/GroupNameField";

function open(value = "", select = false) {
	const parent = document.createElement("div");
	document.body.appendChild(parent);
	const got: (string | null)[] = [];
	const field = GroupNameField.open(parent, { value, select, onDone: (name) => got.push(name) });
	const input = parent.querySelector("input")!;
	return { field, input, got };
}

const key = (input: HTMLInputElement, k: string) => input.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));

describe("GroupNameField", () => {
	it("Enter gives the trimmed name", () => {
		const { input, got } = open();
		input.value = "  Вечером дома ";
		key(input, "Enter");
		expect(got).toEqual(["Вечером дома"]);
	});

	it("empty, Escape and blur give null, once", () => {
		const empty = open();
		key(empty.input, "Enter");
		empty.input.dispatchEvent(new FocusEvent("blur"));
		expect(empty.got).toEqual([null]);
		const escape = open("Экскурсия");
		key(escape.input, "Escape");
		expect(escape.got).toEqual([null]);
		const blur = open("Экскурсия");
		blur.input.dispatchEvent(new FocusEvent("blur"));
		expect(blur.got).toEqual([null]);
	});

	it("select puts the whole value in the selection", () => {
		const { input } = open("Экскурсия", true);
		expect(input.value).toBe("Экскурсия");
		expect([input.selectionStart, input.selectionEnd]).toEqual([0, "Экскурсия".length]);
		expect(input.placeholder).toBe("Section name");
	});
});
