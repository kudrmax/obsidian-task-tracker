import { describe, expect, it } from "vitest";
import { moveTiles } from "../../src/ui/menu/quickMoves";

describe("moveTiles", () => {
	it("names and draws the moves the menu's model offers, in its order, with their days", () => {
		expect(moveTiles([{ id: "today", date: "2026-11-03" }, { id: "tomorrow", date: "2026-11-04" }, { id: "pick", date: null }]).map((tile) => [tile.label, tile.icon, tile.date])).toEqual([
			["Today", "now", "2026-11-03"],
			["Tomorrow", "tomorrow", "2026-11-04"],
			["Pick a date", "calendar", null],
		]);
		expect(moveTiles([{ id: "pick", date: null }]).map((tile) => tile.id)).toEqual(["pick"]);
		expect(moveTiles([])).toEqual([]);
	});
});
