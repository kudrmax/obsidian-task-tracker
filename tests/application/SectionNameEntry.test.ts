import { describe, expect, it } from "vitest";
import { SectionNameEntry } from "../../src/application/SectionNameEntry";

function entry() {
	const ends: (string | null)[] = [];
	return { ends, name: new SectionNameEntry((name) => ends.push(name)) };
}

describe("SectionNameEntry", () => {
	it("Enter gives the name as typed, for the service to trim and read", () => {
		const { ends, name } = entry();
		name.enter("  Вечером ");
		expect(ends).toEqual(["  Вечером "]);
	});

	it("Escape and a tap elsewhere keep the old name, unlike a task's field", () => {
		for (const end of ["escape", "blur"] as const) {
			const { ends, name } = entry();
			name[end]();
			expect(ends).toEqual([null]);
		}
	});

	it("ends once: the blur that follows Enter means nothing", () => {
		const { ends, name } = entry();
		name.enter("Утро");
		name.blur();
		name.escape();
		expect(ends).toEqual(["Утро"]);
	});
});
