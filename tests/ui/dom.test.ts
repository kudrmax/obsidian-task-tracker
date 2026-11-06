// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { pinTo } from "../../obsidian/ui/dom";

describe("pinTo", () => {
	const rect = new DOMRect(10, 20, 30, 40);
	const style = (node: HTMLElement) => [node.style.left, node.style.top, node.style.width, node.style.height];

	it("sets the place only, by default", () => {
		const node = document.createElement("div");
		pinTo(node, rect);
		expect(style(node)).toEqual(["10px", "20px", "", ""]);
	});

	it("sets the size too when asked", () => {
		const node = document.createElement("div");
		pinTo(node, rect, { width: true, height: true });
		expect(style(node)).toEqual(["10px", "20px", "30px", "40px"]);
	});

	it("sets the width alone", () => {
		const node = document.createElement("div");
		pinTo(node, rect, { width: true });
		expect(style(node)).toEqual(["10px", "20px", "30px", ""]);
	});
});
