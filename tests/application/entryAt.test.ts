import { describe, expect, it } from "vitest";
import { entryAt } from "../../src/application/QuickEntry";
import type { GroupName } from "../../src/application/contracts";

const key = (raw: string) => ({ section: "now" as const, index: 0, path: [], raw });
const card = (raw: string, group: GroupName) => ({ key: key(raw), level: 0, group });
const gap = (index: number, group: GroupName) => ({ kind: "gap" as const, index, level: 0, group });

describe("entryAt: where a list draws the field", () => {
	it("without headers: at its card, or after everything for a place past the last", () => {
		const drawing = { cards: [card("A", null), card("B", null)], sections: [null] };
		expect(entryAt(drawing, gap(1, null), false)).toEqual({ kind: "in", section: 0, card: 1, keepsPlate: true });
		expect(entryAt(drawing, gap(2, null), false)).toEqual({ kind: "in", section: 0, card: 2, keepsPlate: true });
		expect(entryAt(drawing, gap(5, null), false)).toEqual({ kind: "end" });
	});

	it("with headers: in its section at its card, at the section's end for a place outside its cards", () => {
		const drawing = { cards: [card("A", "Home"), card("B", "Home"), card("C", "Work")], sections: ["Home", "Work"] };
		expect(entryAt(drawing, gap(1, "Home"), false)).toEqual({ kind: "in", section: 0, card: 1, keepsPlate: false });
		expect(entryAt(drawing, gap(2, "Home"), false)).toEqual({ kind: "in", section: 0, card: 2, keepsPlate: false });
		expect(entryAt(drawing, gap(3, "Home"), false)).toEqual({ kind: "in", section: 0, card: 2, keepsPlate: false });
		expect(entryAt(drawing, gap(0, "Work"), false)).toEqual({ kind: "in", section: 1, card: 3, keepsPlate: false });
		expect(entryAt(drawing, gap(2, "Work"), true)).toEqual({ kind: "in", section: 1, card: 2, keepsPlate: true });
	});

	it("in an empty section where it stands among the sections; outside every section before the headers; in a section not drawn after everything", () => {
		const drawing = { cards: [card("A", null), card("C", "Work")], sections: [null, "Evening", "Work"] };
		expect(entryAt(drawing, gap(1, "Evening"), false)).toEqual({ kind: "in", section: 1, card: 1, keepsPlate: false });
		expect(entryAt(drawing, gap(0, "Evening"), false)).toEqual({ kind: "in", section: 1, card: 1, keepsPlate: false });
		expect(entryAt({ cards: [card("C", "Work")], sections: ["Work"] }, gap(0, null), false)).toEqual({ kind: "top" });
		expect(entryAt(drawing, gap(0, "Gone"), false)).toEqual({ kind: "end" });
	});
});
