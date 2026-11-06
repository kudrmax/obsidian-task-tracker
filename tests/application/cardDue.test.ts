import { describe, expect, it } from "vitest";
import { cardDue, type RepeatRule } from "../../src/application/contracts";

const weekly = { unit: "week", every: 1 } as unknown as RepeatRule;

describe("the corner of a card", () => {
	it("shows the due date on a list of no day", () => {
		expect(cardDue({ dueDate: "2026-11-03", repeat: null }, null)).toEqual({ date: "2026-11-03", repeats: false });
	});

	it("leaves out a due date on the column's own day", () => {
		expect(cardDue({ dueDate: "2026-11-03", repeat: null }, "2026-11-03")).toBeNull();
	});

	it("shows a due date of another day", () => {
		expect(cardDue({ dueDate: "2026-11-03", repeat: null }, "2026-10-31")).toEqual({ date: "2026-11-03", repeats: false });
	});

	it("a task that repeats keeps its icon, alone when the date goes without saying", () => {
		expect(cardDue({ dueDate: "2026-11-05", repeat: weekly }, "2026-11-05")).toEqual({ date: null, repeats: true });
		expect(cardDue({ dueDate: "2026-11-05", repeat: weekly }, "2026-11-03")).toEqual({ date: "2026-11-05", repeats: true });
	});

	it("nothing without a due date or a rule", () => {
		expect(cardDue({ dueDate: null, repeat: null }, "2026-11-03")).toBeNull();
	});
});
