import { describe, expect, it } from "vitest";
import { draftMarksOf, markColors, MOST_CARD_COLORS } from "../../core/application/marks";
import { CLEAR_COLOR, type LabelLevel } from "../../core/domain/Label";

const label = (name: string, color: string): LabelLevel => ({ name, color: color as LabelLevel["color"] });

describe("markColors", () => {
	it("paints a card in its priority's colour alone", () => {
		expect(markColors({ prefix: "p1", color: "red" }, [label("home", "blue")])).toEqual(["red"]);
	});

	it("paints a card of several labels in its first four labels' colours, in the settings' order", () => {
		const labels = ["red", "orange", "yellow", "green", "blue"].map((color, i) => label(`l${i}`, color));
		expect(MOST_CARD_COLORS).toBe(4);
		expect(markColors(null, labels)).toEqual(["red", "orange", "yellow", "green"]);
	});

	it("leaves a clear label out: Focus and a clear label paint Focus alone, only clear labels none", () => {
		const focus = label("Focus", "blue");
		const skip = label("Skip", CLEAR_COLOR);
		expect(markColors(null, [skip, focus])).toEqual(["blue"]);
		expect(markColors(null, [skip])).toEqual([]);
	});

	it("counts only coloured labels towards MOST_CARD_COLORS", () => {
		const labels = [label("c", CLEAR_COLOR), ...["red", "orange", "yellow", "green", "blue"].map((color, i) => label(`l${i}`, color))];
		expect(markColors(null, labels)).toEqual(["red", "orange", "yellow", "green"]);
	});
});

describe("markColors over colours that can't be drawn", () => {
	it("hands only colours usableColor accepts: a priority saved clear or as a broken code paints nothing", () => {
		const level = (color: string) => ({ prefix: "p1", color: color as LabelLevel["color"] }) as Parameters<typeof markColors>[0];
		expect(markColors(level("clear"), [label("home", "blue")])).toEqual([]);
		expect(markColors(level("#12345"), [])).toEqual([]);
		expect(markColors(level("purple"), [])).toEqual([]);
	});

	it("leaves out a label of a broken code as it does a clear one", () => {
		expect(markColors(null, [label("a", "#12345"), label("b", "purple"), label("c", "green")])).toEqual(["green"]);
	});
});

describe("draftMarksOf with a clear label", () => {
	it("tints nothing for a clear label alone, and its tile carries clear", () => {
		const skip = label("Skip", CLEAR_COLOR);
		const draft = draftMarksOf({ priority: null, labels: ["Skip"] }, [], [skip]);
		expect(draft.tint).toBeNull();
		expect(draft.tiles.labels).toEqual([{ mark: skip, on: true, enabled: true }]);
	});
});
