import { describe, expect, it } from "vitest";
import { oneLine } from "../../src/ui/quick/TitleField";

describe("oneLine", () => {
	it("reads a pasted line break as a space and trims the ends", () => {
		expect(oneLine("  Позвонить [[Петя]]\n  про договор \n")).toBe("Позвонить [[Петя]] про договор");
	});
});
