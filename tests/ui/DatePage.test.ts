// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { datePage } from "../../src/ui/menu/DatePage";

afterEach(() => document.body.replaceChildren());

describe("datePage", () => {
	it("the month of the chosen day, the panel a picker's", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		datePage(panel, { today: "2026-11-04", selected: "2026-12-10", onPick: () => undefined });
		expect(panel.classList.contains("is-picker")).toBe(true);
		expect(panel.querySelector(".tc-picker-title")?.textContent).toContain("December");
		expect(panel.querySelector(".tc-day.is-selected")?.textContent).toBe("10");
		expect(panel.querySelector(".tc-picker-remove")).toBeNull();
	});

	it("today's month with no day chosen", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		datePage(panel, { today: "2026-11-04", selected: null, onPick: () => undefined });
		expect(panel.querySelector(".tc-picker-title")?.textContent).toContain("November");
		expect(panel.querySelector(".tc-day.is-selected")).toBeNull();
	});

	it("a day picks it", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		const picked: string[] = [];
		datePage(panel, { today: "2026-11-04", selected: null, onPick: (date) => picked.push(date) });
		[...panel.querySelectorAll<HTMLElement>(".tc-day:not(.is-other)")].find((day) => day.textContent === "12")?.click();
		expect(picked).toEqual(["2026-11-12"]);
	});

	it("Remove due date under the month, when there is one to take off", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		let removed = 0;
		datePage(panel, { today: "2026-11-04", selected: "2026-11-09", onPick: () => undefined, onRemove: () => removed++ });
		const row = panel.lastElementChild as HTMLElement;
		expect([row.className, row.textContent, row.querySelector("svg") !== null]).toEqual(["tc-btn tc-menu-row tc-picker-remove", "Remove due date", true]);
		row.click();
		expect(removed).toBe(1);
	});
});
