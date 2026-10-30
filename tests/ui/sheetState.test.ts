import { describe, expect, it } from "vitest";
import { draftOf, initialState, pickPriority, tileLabel, togglePlacement, pickDate } from "../../src/ui/sheet/sheetState";

describe("sheet state", () => {
	it("labels the tiles, the date tile by its day until none is chosen", () => {
		expect(tileLabel({ kind: "inbox" }, "2026-10-30")).toBe("Inbox");
		expect(tileLabel({ kind: "soon" }, "2026-10-30")).toBe("Soon");
		expect(tileLabel({ kind: "now" }, "2026-10-30")).toBe("Now");
		expect(tileLabel({ kind: "date", date: "2026-11-02" }, "2026-10-30")).toBe("2 Nov");
	});

	it("starts from the placement given, with the picker closed", () => {
		expect(initialState({ kind: "date", date: "2026-11-03" })).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: false, priority: null });
		expect(initialState({ kind: "now" })).toEqual({ tile: "now", date: null, pickerOpen: false, priority: null });
		expect(initialState({ kind: "inbox" })).toEqual({ tile: "inbox", date: null, pickerOpen: false, priority: null });
	});

	it("switches tiles; the date tile opens the picker, again when already chosen", () => {
		const now = initialState({ kind: "now" });
		expect(togglePlacement(now, "soon")).toEqual({ tile: "soon", date: null, pickerOpen: false, priority: null });
		const date = togglePlacement(now, "date");
		expect(date).toEqual({ tile: "date", date: null, pickerOpen: true, priority: null });
		const picked = pickDate(date, "2026-11-03");
		expect(picked).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: false, priority: null });
		expect(togglePlacement(picked, "date")).toEqual({ tile: "date", date: "2026-11-03", pickerOpen: true, priority: null });
		expect(togglePlacement(picked, "now")).toEqual({ tile: "now", date: "2026-11-03", pickerOpen: false, priority: null });
	});

	it("makes the draft: a date tile without a day means today", () => {
		expect(draftOf("  Call  ", { tile: "now", date: null, pickerOpen: false, priority: null }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "now" }, priority: null });
		expect(draftOf("Call", { tile: "inbox", date: null, pickerOpen: false, priority: null }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "inbox" }, priority: null });
		expect(draftOf("Call", { tile: "date", date: null, pickerOpen: true, priority: null }, "2026-10-30")).toEqual({ text: "Call", placement: { kind: "date", date: "2026-10-30" }, priority: null });
		expect(draftOf("Call", { tile: "date", date: "2026-11-03", pickerOpen: false, priority: null }, "2026-10-30").placement).toEqual({ kind: "date", date: "2026-11-03" });
	});

	it("keeps the priority given, picked, or none, through the tiles and the calendar", () => {
		expect(initialState({ kind: "now" }, "p2").priority).toBe("p2");
		const picked = pickPriority(initialState({ kind: "now" }), "p1");
		expect(picked.priority).toBe("p1");
		expect(pickDate(togglePlacement(picked, "date"), "2026-11-03").priority).toBe("p1");
		expect(draftOf("Call", picked, "2026-10-30").priority).toBe("p1");
		expect(pickPriority(picked, null).priority).toBeNull();
	});
});
