// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Grips, type GripEdge } from "../../../src/ui/kit/Grips";

afterEach(() => document.body.replaceChildren());

const press = (target: Element, init: PointerEventInit = {}) => {
	const e = new PointerEvent("pointerdown", { bubbles: true, cancelable: true, isPrimary: true, button: 0, ...init });
	target.dispatchEvent(e);
	return e;
};

describe("Grips", () => {
	it("two grips, the start's first", () => {
		const parent = document.body.appendChild(document.createElement("div"));
		Grips.attach(parent, { takes: () => true, onGrip: () => undefined });
		expect([...parent.children].map((g) => `${g.tagName} ${g.className}`)).toEqual(["SPAN tc-grip is-start", "SPAN tc-grip is-end"]);
	});

	it("a press taken goes no further, its default kept from it", () => {
		const parent = document.body.appendChild(document.createElement("div"));
		const edges: GripEdge[] = [];
		let reached = 0;
		document.body.addEventListener("pointerdown", () => reached++);
		let stoppedFirst = false;
		Grips.attach(parent, { takes: () => true, onGrip: (edge, e) => { edges.push(edge); stoppedFirst = e.defaultPrevented; } });
		const e = press(parent.children[1]);
		expect([edges, reached, e.defaultPrevented, stoppedFirst]).toEqual([["end"], 0, true, true]);
	});

	it("a press not taken goes on", () => {
		const parent = document.body.appendChild(document.createElement("div"));
		let reached = 0;
		document.body.addEventListener("pointerdown", () => reached++);
		Grips.attach(parent, { takes: () => false, onGrip: () => undefined });
		const e = press(parent.children[0]);
		expect([reached, e.defaultPrevented]).toEqual([1, false]);
	});

	it("only a primary left press is a grip's", () => {
		const parent = document.body.appendChild(document.createElement("div"));
		let gripped = 0;
		Grips.attach(parent, { takes: () => true, onGrip: () => gripped++ });
		press(parent.children[0], { button: 2 });
		press(parent.children[0], { isPrimary: false });
		expect(gripped).toBe(0);
	});
});
