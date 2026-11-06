import { describe, expect, it } from "vitest";
import type { RepeatRule } from "../../src/application/contracts";
import { RepeatPage, repeatPageEnd } from "../../src/application/RepeatPage";

const daily: RepeatRule = { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null };
const weekly: RepeatRule = { kind: "schedule", every: 1, unit: "week", days: [1], dayOfMonth: null, from: null };

function page(repeat: RepeatRule | null) {
	const written: (RepeatRule | null)[] = [];
	return { written, page: new RepeatPage({ repeat, repeatDay: "2026-11-06" }, (rule) => written.push(rule)) };
}

describe("a task menu's repeat page", () => {
	it("writes nothing while a change is held, and the rule once as the menu closes", () => {
		const { page: p, written } = page(null);
		p.change(weekly);
		p.change(daily);
		expect(written).toEqual([]);
		p.close();
		p.close();
		expect(written).toEqual([daily]);
	});

	it("writes nothing when it came back to the task's own rule, or was left untouched", () => {
		const back = page(daily);
		back.page.change(weekly);
		back.page.change(daily);
		back.page.close();
		expect(back.written).toEqual([]);
		const untouched = page(daily);
		untouched.page.close();
		expect(untouched.written).toEqual([]);
	});

	it("takes the rule off with Remove, whatever was changed before it", () => {
		const { page: p, written } = page(daily);
		p.change(weekly);
		p.remove();
		p.close();
		expect(written).toEqual([null]);
	});

	it("offers the draft of the task's rule from its repeat day", () => {
		expect(page(weekly).page.draft.removable).toBe(true);
		expect(page(null).page.draft.day).toBe("2026-11-06");
	});

	it("answers the door as the class writes", () => {
		expect(repeatPageEnd(daily, null)).toBeNull();
		expect(repeatPageEnd(daily, { rule: daily })).toBeNull();
		expect(repeatPageEnd(daily, { rule: weekly })).toEqual({ rule: weekly });
		expect(repeatPageEnd(daily, { rule: null })).toEqual({ rule: null });
		expect(repeatPageEnd(null, { rule: null })).toBeNull();
	});
});
