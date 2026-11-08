import { describe, expect, it } from "vitest";
import { wholeHeight } from "../../obsidian/ui/wholeCard";

describe("a pressed event shows its title inside itself first", () => {
	it("keeps its height when the wrapped lines fit", () => {
		expect(wholeHeight(150, 45, 8)).toBe(150);
	});

	it("grows down by what the lines and padding need beyond it", () => {
		expect(wholeHeight(26, 45, 8)).toBe(53);
	});
});
