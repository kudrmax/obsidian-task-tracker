import { describe, expect, it } from "vitest";
import { draftOf, initialState, tileLabel, togglePlacement, pickDate } from "../../src/ui/sheet/sheetState";

describe("sheet state", () => {
	it("labels the tiles, the date tile by its day until none is chosen", () => {
		expect(tileLabel({ kind: "inbox" }, "2026-10-30")).toBe("Inbox");
		expect(tileLabel({ kind: "soon" }, "2026-10-30")).toBe("Soon");
		expect(tileLabel({ kind: "now" }, "2026-10-30")).toBe("Now");
		expect(tileLabel({ kind: "date", date: "2026-11-02" }, "2026-10-30")).toBe("2 Nov");
	});

	it("starts from the placement given, with the picker closed", () => {
		expect(initialState({ kind: "date", date: "2026-11-03" })).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: false });
		expect(initialState({ kind: "now" })).toEqual({ tile: "now", date: null, pickerOpen: false });
		expect(initialState({ kind: "inbox" })).toEqual({ tile: "inbox", date: null, pickerOpen: false });
	});

	it("switches tiles; the date tile opens the picker, again when already chosen", () => {
		const now = initialState({ kind: "now" });
		expect(togglePlacement(now, "soon")).toEqual({ tile: "soon", date: null, pickerOpen: false });
		const date = togglePlacement(now, "date");
		expect(date).toEqual({ tile: "date", date: null, pickerOpen: true });
		const picked = pickDate(date, "2026-11-03");
		expect(picked).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: false });
		expect(togglePlacement(picked, "date")).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: true });
		expect(togglePlacement(picked, "now")).toEqual({ tile: "now", date: "2026-11-03", pickerOpen: false });
	});

	it("makes the draft: a date tile without a day means today", () => {
		expect(draftOf("  Call  ", { tile: "now", date: null, pickerOpen: false }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "now" } });
		expect(draftOf("Call", { tile: "inbox", date: null, pickerOpen: false }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "inbox" } });
		expect(draftOf("Call", { tile: "date", date: null, pickerOpen: true }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "date", date: "2026-10-30" } });
		expect(draftOf("Call", { tile: "date", date: "2026-11-03", pickerOpen: false }, "2026-10-30").placement).toEqual({ kind: "date", date: "2026-11-03" });
	});
});
