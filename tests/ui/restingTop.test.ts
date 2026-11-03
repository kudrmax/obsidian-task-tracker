// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { restingTop } from "../../src/ui/dom";

describe("restingTop", () => {
	it("takes off the shifts drawn on the element and on what holds it", () => {
		const outer = document.body.appendChild(document.createElement("div"));
		const inner = outer.appendChild(document.createElement("div"));
		outer.style.transform = "matrix(1, 0, 0, 1, 0, 336)";
		inner.style.transform = "matrix(1, 0, 0, 1, 0, -6)";
		inner.getBoundingClientRect = () => new DOMRect(0, 792, 390, 44);
		expect(restingTop(inner)).toBe(792 - 330);
	});

	it("is the box's top with no transform", () => {
		const el = document.body.appendChild(document.createElement("div"));
		el.getBoundingClientRect = () => new DOMRect(0, 120, 10, 10);
		expect(restingTop(el)).toBe(120);
	});
});
