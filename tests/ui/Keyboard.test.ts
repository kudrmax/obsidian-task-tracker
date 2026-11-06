// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KEYBOARD_UP, Keyboard } from "../../obsidian/ui/Keyboard";

const slide = (type: "keyboardWillShow" | "keyboardWillHide", keyboardHeight: number) =>
	window.dispatchEvent(Object.assign(new Event(type), { keyboardHeight }));

let root: HTMLElement;
let keyboard: Keyboard;
let rises: number[];

beforeEach(() => {
	root = document.createElement("div");
	document.body.appendChild(root);
	rises = [];
	keyboard = new Keyboard(root, (glide) => rises.push(glide.rise));
});

afterEach(() => {
	keyboard.destroy();
	root.remove();
});

describe("Keyboard", () => {
	it("marks the view while the keyboard is up, from the moment it starts to slide in until it starts to slide out", () => {
		expect(root.classList.contains(KEYBOARD_UP)).toBe(false);
		slide("keyboardWillShow", 335);
		expect(root.classList.contains(KEYBOARD_UP)).toBe(true);
		slide("keyboardWillHide", 0);
		expect(root.classList.contains(KEYBOARD_UP)).toBe(false);
		expect(rises).toEqual([335, 0]);
	});

	it("stops hearing the keyboard once destroyed", () => {
		keyboard.destroy();
		slide("keyboardWillShow", 335);
		expect(root.classList.contains(KEYBOARD_UP)).toBe(false);
		expect(rises).toEqual([]);
	});
});
