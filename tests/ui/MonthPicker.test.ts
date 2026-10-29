// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { MonthPicker } from "../../src/ui/menu/MonthPicker";

describe("MonthPicker", () => {
	it("draws six weeks from the Monday before the month, marking today and the chosen day", () => {
		const el = document.createElement("div");
		const picked: string[] = [];
		new MonthPicker(el, { month: "2026-11-01", today: "2026-10-30", selected: "2026-11-03", onPick: (d) => picked.push(d), variant: "menu" });
		const days = [...el.querySelectorAll<HTMLButtonElement>(".tc-day")];
		expect(days).toHaveLength(42);
		expect(days[0].textContent).toBe("26");
		expect(days[0].classList.contains("is-other")).toBe(true);
		expect(days[4].classList.contains("is-today")).toBe(true);
		expect(days[8].textContent).toBe("3");
		expect(days[8].classList.contains("is-selected")).toBe(true);
		expect(el.querySelector(".tc-picker-title")?.textContent).toBe("November 2026");
		expect([...el.querySelectorAll(".tc-weekday")].map((w) => w.textContent)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
		days[8].click();
		expect(picked).toEqual(["2026-11-03"]);
	});

	it("walks months with its arrows", () => {
		const el = document.createElement("div");
		const picker = new MonthPicker(el, { month: "2026-11-01", today: "2026-10-30", selected: null, onPick: () => {}, variant: "sheet" });
		el.querySelector<HTMLButtonElement>(".tc-picker-next")!.click();
		expect(el.querySelector(".tc-picker-title")?.textContent).toBe("December 2026");
		expect(picker.month).toBe("2026-12-01");
		el.querySelector<HTMLButtonElement>(".tc-picker-prev")!.click();
		el.querySelector<HTMLButtonElement>(".tc-picker-prev")!.click();
		expect(el.querySelector(".tc-picker-title")?.textContent).toBe("October 2026");
		expect(el.querySelector(".tc-day")?.textContent).toBe("28");
	});
});
