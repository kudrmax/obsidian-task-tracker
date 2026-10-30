import { describe, expect, it } from "vitest";
import { dueOptions } from "../../src/ui/menu/dueOptions";

describe("dueOptions", () => {
	it("names today and tomorrow by weekday, next week by the coming Monday", () => {
		const o = dueOptions("2026-10-30", "2026-11-03");
		expect(o.today).toEqual({ label: "Fri", value: "2026-10-30" });
		expect(o.tomorrow).toEqual({ label: "Sat", value: "2026-10-31" });
		expect(o.nextWeek).toEqual({ label: "Mon, 2 Nov", value: "2026-11-02" });
		expect(o.pick).toEqual({ label: "3 Nov" });
		expect(o.canRemove).toBe(true);
	});

	it("takes the Monday after this one on a Monday, and shows nothing to pick or remove without a date", () => {
		const o = dueOptions("2026-11-02", null);
		expect(o.nextWeek).toEqual({ label: "Mon, 9 Nov", value: "2026-11-09" });
		expect(o.pick).toEqual({ label: "" });
		expect(o.canRemove).toBe(false);
	});

	it("offers no removal of today's date: a task for today is in Now by that date", () => {
		expect(dueOptions("2026-10-30", "2026-10-30").canRemove).toBe(false);
	});
});
