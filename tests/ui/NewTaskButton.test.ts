// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { NewTaskButton } from "../../src/ui/NewTaskButton";

function setUp() {
	const root = document.createElement("div");
	const column = root.appendChild(document.createElement("div"));
	const list = column.appendChild(document.createElement("div"));
	const card = list.appendChild(document.createElement("div"));
	const name = card.appendChild(document.createElement("span"));
	let pressed = 0;
	const button = new NewTaskButton(root, "now", () => pressed++);
	button.pressOnDoubleClick(column, list);
	const doubleClick = (target: HTMLElement, pointerType = "mouse") => {
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
		target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	};
	return { button, column, list, card, name, doubleClick, pressed: () => pressed };
}

describe("NewTaskButton", () => {
	it("opens the task screen when pressed", () => {
		const { button, pressed } = setUp();
		button.el.querySelector("button")!.click();
		expect(pressed()).toBe(1);
	});

	it("opens it on a mouse's double click on the list's free room, under or between the cards, and around the button", () => {
		const { button, column, list, doubleClick, pressed } = setUp();
		doubleClick(list);
		doubleClick(column);
		doubleClick(button.el);
		expect(pressed()).toBe(3);
	});

	it("leaves a double click on a card, or on the button itself, to them", () => {
		const { button, card, name, doubleClick, pressed } = setUp();
		doubleClick(card);
		doubleClick(name);
		button.el.querySelector("button")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		expect(pressed()).toBe(0);
	});

	it("leaves a finger's double tap alone: the phone has no double click", () => {
		const { list, doubleClick, pressed } = setUp();
		doubleClick(list, "touch");
		expect(pressed()).toBe(0);
	});
});
