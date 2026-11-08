// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Motion, restingRect } from "../../obsidian/ui/motion/Motion";

/** A row 35 px tall whose computed style, as a browser's, is live: once it grows in, it reads the growth's first frame. */
function growingRow(): HTMLElement {
	const row = document.createElement("div");
	document.body.appendChild(row);
	let growing = false;
	row.getBoundingClientRect = () => new DOMRect(10, 100, 200, growing ? 0 : 35);
	row.animate = (() => {
		growing = true;
		return { playState: "running", addEventListener: () => undefined } as unknown as Animation;
	}) as HTMLElement["animate"];
	const real = window.getComputedStyle.bind(window);
	vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
		if (el !== row) return real(el, pseudo);
		const values: Record<string, string> = { "--tc-duration-collapse": "150", transform: "none", minHeight: "0px", marginTop: "0px", marginBottom: "0px" };
		return new Proxy({} as CSSStyleDeclaration, {
			get: (_, key) => (key === "height" ? (growing ? "0px" : "35px") : key === "getPropertyValue" ? (name: string) => values[name] ?? "" : values[key as string] ?? ""),
		});
	});
	return row;
}

afterEach(() => vi.restoreAllMocks());

describe("Motion", () => {
	it("a row growing in rests at its own height, not at the growth's first frame", () => {
		const row = growingRow();
		Motion.enter(row);
		expect(restingRect(row).height).toBe(35);
	});
});
