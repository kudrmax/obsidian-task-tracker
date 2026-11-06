// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { FreeRoomDoubleClick } from "../../obsidian/ui/FreeRoomDoubleClick";

function setUp() {
	const column = document.createElement("div");
	const list = column.appendChild(document.createElement("div"));
	const card = list.appendChild(document.createElement("div"));
	const name = card.appendChild(document.createElement("span"));
	let opened = 0;
	new FreeRoomDoubleClick([column, list], () => opened++);
	const doubleClick = (target: HTMLElement, pointerType = "mouse") => {
		target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType }));
		target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
	};
	return { column, list, card, name, doubleClick, opened: () => opened };
}

describe("FreeRoomDoubleClick", () => {
	it("runs on a mouse's double click on the list's free room, under or between the cards", () => {
		const { column, list, doubleClick, opened } = setUp();
		doubleClick(list);
		doubleClick(column);
		expect(opened()).toBe(2);
	});

	it("leaves a double click on a card to it", () => {
		const { card, name, doubleClick, opened } = setUp();
		doubleClick(card);
		doubleClick(name);
		expect(opened()).toBe(0);
	});

	it("leaves a finger's double tap alone: the phone has no double click", () => {
		const { list, doubleClick, opened } = setUp();
		doubleClick(list, "touch");
		expect(opened()).toBe(0);
	});
});
