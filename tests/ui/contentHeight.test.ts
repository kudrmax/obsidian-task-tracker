// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { contentHeight } from "../../obsidian/ui/contentHeight";

function at(el: HTMLElement, top: number, height: number): HTMLElement {
	el.getBoundingClientRect = () => new DOMRect(0, top, 300, height);
	el.getClientRects = () => [new DOMRect(0, top, 300, height)] as unknown as DOMRectList;
	return el;
}

describe("what a list's cards take", () => {
	it("leaves out the column's gap a card folded away gives back: a row stays as tall as its cards after a card dropped on a subproject leaves it (Subprojects off)", () => {
		const list = at(document.body.appendChild(document.createElement("div")), 100, 39);
		list.style.paddingBottom = "0px";
		const card = at(list.appendChild(document.createElement("div")), 102, 35);
		card.style.marginBottom = "0px";
		const gone = at(list.appendChild(document.createElement("div")), 139, 0);
		gone.style.marginBottom = "-2px";
		Object.defineProperty(list, "scrollHeight", { value: 39 });
		expect(contentHeight(list)).toBe(37);
	});

	it("counts a last card's own margin under it", () => {
		const list = at(document.body.appendChild(document.createElement("div")), 0, 50);
		const card = at(list.appendChild(document.createElement("div")), 2, 44);
		card.style.marginBottom = "6px";
		expect(contentHeight(list)).toBe(52);
	});
});
