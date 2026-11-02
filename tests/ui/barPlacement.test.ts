import { describe, expect, it } from "vitest";
import { barBesideField, panelSide } from "../../src/ui/quick/barPlacement";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const ROOM = box(0, 100, 400, 700);
const BAR = { width: 180, height: 32 };

describe("the desktop bar beside its field", () => {
	it("stands right under the field, its right edge on the field's, the gap apart", () => {
		expect(barBesideField(box(10, 300, 370, 335), ROOM, BAR, 8)).toEqual({ left: 190, top: 343, side: "below" });
	});

	it("follows the field: a field lower, wider or grown takes the bar with it", () => {
		expect(barBesideField(box(30, 400, 370, 471), ROOM, BAR, 8)).toEqual({ left: 190, top: 479, side: "below" });
		expect(barBesideField(box(10, 300, 330, 335), ROOM, { width: 105, height: 32 }, 8)).toEqual({ left: 225, top: 343, side: "below" });
	});

	it("still fits under a field whose bar would end on the room's bottom", () => {
		expect(barBesideField(box(10, 625, 370, 660), ROOM, BAR, 8)).toEqual({ left: 190, top: 668, side: "below" });
	});

	it("goes over the field where the room has no place for it below", () => {
		expect(barBesideField(box(10, 626, 370, 661), ROOM, BAR, 8)).toEqual({ left: 190, top: 586, side: "above" });
		expect(barBesideField(box(10, 660, 370, 695), ROOM, BAR, 8)).toEqual({ left: 190, top: 620, side: "above" });
	});

	it("stays under a field in a room too short for it on either side", () => {
		expect(barBesideField(box(10, 110, 370, 145), box(0, 100, 400, 170), BAR, 8)).toEqual({ left: 190, top: 153, side: "below" });
	});

	it("goes over the field, with its open panel over it, where the two do not fit under the field together", () => {
		expect(barBesideField(box(10, 500, 370, 535), ROOM, BAR, 8, 82)).toEqual({ left: 190, top: 543, side: "below" });
		expect(barBesideField(box(10, 560, 370, 595), ROOM, BAR, 8, 82)).toEqual({ left: 190, top: 520, side: "above" });
	});

	it("keeps its own side where the panel fits with it on neither", () => {
		expect(barBesideField(box(10, 300, 370, 335), ROOM, BAR, 8, 400)).toEqual({ left: 190, top: 343, side: "below" });
	});

	it("has no place while no part of the field shows", () => {
		expect(barBesideField(box(10, 60, 370, 95), ROOM, BAR, 8)).toBeNull();
		expect(barBesideField(box(10, 700, 370, 735), ROOM, BAR, 8)).toBeNull();
		expect(barBesideField(box(10, 90, 370, 125), ROOM, BAR, 8)).not.toBeNull();
	});
});

describe("the side a desktop bar's panel opens on", () => {
	const barBelow = box(190, 343, 370, 375);
	const barAbove = box(190, 586, 370, 618);

	it("is away from the field: below a bar under the field, above a bar over it", () => {
		expect(panelSide(barBelow, "below", 82, ROOM, 8)).toBe("below");
		expect(panelSide(barAbove, "above", 82, ROOM, 8)).toBe("above");
	});

	it("is the other side when the panel fits only there", () => {
		expect(panelSide(box(190, 600, 370, 632), "below", 150, ROOM, 8)).toBe("above");
		expect(panelSide(box(190, 140, 370, 172), "above", 82, ROOM, 8)).toBe("below");
	});

	it("stays away from the field when it fits on neither side", () => {
		expect(panelSide(barBelow, "below", 600, ROOM, 8)).toBe("below");
		expect(panelSide(barAbove, "above", 600, ROOM, 8)).toBe("above");
	});
});
