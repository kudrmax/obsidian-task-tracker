import { describe, expect, it } from "vitest";
import { markColors, MOST_CARD_COLORS } from "../../core/application/marks";
import type { LabelLevel } from "../../core/domain/Label";

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
});
