import { describe, expect, it } from "vitest";
import { markChoices, marksOf, typedMarks } from "../../src/domain/Marks";

describe("marks", () => {
	it("gives a task a priority or labels, never both: the priority wins", () => {
		expect(marksOf("p1", ["Важное"])).toEqual({ priority: "p1", labels: [] });
		expect(marksOf(null, ["Важное"])).toEqual({ priority: null, labels: ["Важное"] });
		expect(marksOf("p1", [])).toEqual({ priority: "p1", labels: [] });
	});

	it("lets a task take a priority while it has no labels, labels while it has no priority", () => {
		expect(markChoices({ priority: null, labels: [] })).toEqual({ priority: true, labels: true });
		expect(markChoices({ priority: "p1", labels: [] })).toEqual({ priority: true, labels: false });
		expect(markChoices({ priority: null, labels: ["Важное"] })).toEqual({ priority: false, labels: true });
	});

	it("reads a typed title's first word as its priority unless one is chosen, and then drops the labels chosen", () => {
		const prefixes = ["p1", "p2"];
		expect(typedMarks("p1 Buy milk", null, ["Важное"], prefixes)).toEqual({ text: "Buy milk", priority: "p1", labels: [] });
		expect(typedMarks("Buy milk", null, ["Важное"], prefixes)).toEqual({ text: "Buy milk", priority: null, labels: ["Важное"] });
		expect(typedMarks("p2 Buy milk", "p1", [], prefixes)).toEqual({ text: "p2 Buy milk", priority: "p1", labels: [] });
		expect(typedMarks("p3 Buy milk", null, [], prefixes)).toEqual({ text: "p3 Buy milk", priority: null, labels: [] });
	});
});
