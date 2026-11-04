// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../../src/application/contracts";
import { renderAllDayRows } from "../../src/ui/AllDayRow";

const day = (date: number): CalendarEvent => ({ id: String(date), title: "Trip", start: new Date(2026, 9, date), end: new Date(2026, 9, date + 1), allDay: true, calendar: "Home", color: "#FF9F0A", source: "google" });

describe("all-day rows", () => {
	it("grey an all-day event that is over and keep one still going in its colour", () => {
		const rows = document.createElement("div");
		renderAllDayRows(rows, document.createElement("div"), [day(30), day(31)], "dark", new Date(2026, 9, 31, 12));
		expect([...rows.querySelectorAll(".tc-allday")].map((row) => row.classList.contains("is-past"))).toEqual([true, false]);
	});
});
