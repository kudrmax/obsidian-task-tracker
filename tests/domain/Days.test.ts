import { describe, expect, it } from "vitest";
import { canPostpone, canRemoveDue, dayColumn, dayOfPlacement, dayOfTask, dayRelation, placementOfDay, taskScreen } from "../../src/domain/Days";

const TODAY = "2026-11-01";

describe("dayColumn", () => {
	it("today: Now, with its sections", () => {
		expect(dayColumn(TODAY, TODAY)).toEqual({ list: "now", date: null, sections: true });
	});

	it("a later day: Soon with that day, with Soon's sections", () => {
		expect(dayColumn("2026-11-05", TODAY)).toEqual({ list: "soon", date: "2026-11-05", sections: true });
	});

	it("a past day: Now with that day, no sections", () => {
		expect(dayColumn("2026-10-28", TODAY)).toEqual({ list: "now", date: "2026-10-28", sections: false });
	});
});

describe("placementOfDay", () => {
	it("Now for today, the day itself for a later or a past one", () => {
		expect(placementOfDay(TODAY, TODAY)).toEqual({ kind: "now" });
		expect(placementOfDay("2026-11-05", TODAY)).toEqual({ kind: "date", date: "2026-11-05" });
		expect(placementOfDay("2026-10-28", TODAY)).toEqual({ kind: "date", date: "2026-10-28" });
	});
});

describe("dayOfPlacement", () => {
	it("today for Now, the date for a date, none for a list without days", () => {
		expect(dayOfPlacement({ kind: "now" }, TODAY)).toBe(TODAY);
		expect(dayOfPlacement({ kind: "date", date: "2026-11-05" }, TODAY)).toBe("2026-11-05");
		for (const kind of ["soon", "inbox", "backlog"] as const) expect(dayOfPlacement({ kind }, TODAY)).toBeNull();
	});
});

describe("dayOfTask", () => {
	it("a slot's day first, then today for Now, then the due date", () => {
		expect(dayOfTask("soon", { slot: { date: "2026-11-04", start: 600, end: 660 }, dueDate: "2026-11-09" }, TODAY)).toBe("2026-11-04");
		expect(dayOfTask("now", { slot: null, dueDate: null }, TODAY)).toBe(TODAY);
		expect(dayOfTask("soon", { slot: null, dueDate: "2026-11-09" }, TODAY)).toBe("2026-11-09");
		expect(dayOfTask("soon", { slot: null, dueDate: null }, TODAY)).toBeNull();
	});
});

describe("canPostpone", () => {
	it("puts a done task off nowhere", () => {
		expect(canPostpone("done")).toBe(false);
		for (const section of ["inbox", "now", "soon", "backlog"] as const) expect(canPostpone(section)).toBe(true);
	});
});

describe("canRemoveDue", () => {
	it("lets a date be taken off, except today's: a task for today is in Now by that date", () => {
		expect(canRemoveDue("2026-11-05", TODAY)).toBe(true);
		expect(canRemoveDue(TODAY, TODAY)).toBe(false);
		expect(canRemoveDue(null, TODAY)).toBe(false);
	});
});

describe("taskScreen", () => {
	it("shows Done, Inbox and Backlog in their lists, whatever day", () => {
		expect(taskScreen("done", "2026-11-06")).toEqual({ kind: "list", list: "done" });
		expect(taskScreen("inbox", null)).toEqual({ kind: "list", list: "inbox" });
		expect(taskScreen("backlog", null)).toEqual({ kind: "list", list: "backlog" });
	});

	it("shows a task of Now or Soon on its day, Soon without one", () => {
		expect(taskScreen("now", "2026-11-06")).toEqual({ kind: "day", date: "2026-11-06" });
		expect(taskScreen("soon", "2026-11-09")).toEqual({ kind: "day", date: "2026-11-09" });
		expect(taskScreen("soon", null)).toEqual({ kind: "list", list: "soon" });
	});
});

describe("dayRelation", () => {
	it("tells today, tomorrow, yesterday and any other day, across a month", () => {
		expect(dayRelation("2026-11-30", "2026-11-30")).toBe("today");
		expect(dayRelation("2026-12-01", "2026-11-30")).toBe("tomorrow");
		expect(dayRelation("2026-11-29", "2026-11-30")).toBe("yesterday");
		expect(dayRelation("2026-12-02", "2026-11-30")).toBe("other");
		expect(dayRelation("2025-11-30", "2026-11-30")).toBe("other");
	});
});
