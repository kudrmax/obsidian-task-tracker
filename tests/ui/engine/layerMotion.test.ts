import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssEase, EASE_OUT, FLY, LAYER_MS } from "../../../obsidian/ui/engine/layers/motion";

const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const token = (name: string): string => {
	const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
	if (!m) throw new Error(`no ${name}`);
	return m[1].trim();
};

describe("the engine's motion in the code agrees with the design's tokens", () => {
	it("a layer opens in --tc-duration-menu and closes in --tc-duration-collapse", () => {
		expect(token("--tc-duration-menu")).toBe(`${LAYER_MS.open}ms`);
		expect(token("--tc-duration-collapse")).toBe(`${LAYER_MS.close}ms`);
	});
	it("rows and layers move on --tc-ease-out", () => {
		expect(token("--tc-ease-out")).toBe(cssEase(EASE_OUT));
	});
	it("a card let go flies in --tc-duration-fly on --tc-ease-fly (Decision 121's flight)", () => {
		expect(token("--tc-duration-fly")).toBe(`${FLY.ms}ms`);
		expect(token("--tc-ease-fly")).toBe(cssEase(FLY.ease));
	});
});
