import { describe, expect, it } from "vitest";
import { Repeat, type RepeatRule } from "../../src/domain/Repeat";
import { editRepeat, type RepeatChange, type RepeatDraft, repeatDay, repeatDraft } from "../../src/domain/RepeatDraft";

const THURSDAY = "2026-11-05";
const rule = (over: Partial<RepeatRule>): RepeatRule => ({ kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null, ...over });

function after(draft: RepeatDraft, ...changes: RepeatChange[]): RepeatDraft {
	return changes.reduce((d, change) => editRepeat(d, change) ?? d, draft);
}

describe("repeatDay", () => {
	it("the task's day, else today", () => {
		expect(repeatDay("2026-11-07", THURSDAY)).toBe("2026-11-07");
		expect(repeatDay(null, THURSDAY)).toBe(THURSDAY);
	});
});

describe("repeatDraft", () => {
	it("offers both kinds and the three units, in the panel's order", () => {
		const draft = repeatDraft(THURSDAY, null);
		expect([draft.kinds, draft.units]).toEqual([["schedule", "afterDone"], ["day", "week", "month"]]);
	});

	it("a new rule: Schedule, every 1 week, on the day's weekday; the month's day is the day's", () => {
		const draft = repeatDraft(THURSDAY, null);
		expect(draft).toMatchObject({ kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: 5, day: THURSDAY, detail: "weekdays", can: { fewer: false } });
		expect(draft.rule).toEqual({ kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null });
	});

	it("a rule given: its own fields; the weekday and the month's day it lacks from the day", () => {
		const monthly = repeatDraft(THURSDAY, rule({ every: 3, unit: "month", dayOfMonth: 31, from: "2026-10-31" }));
		expect(monthly).toMatchObject({ every: 3, unit: "month", days: [3], dayOfMonth: 31, detail: "monthDay", can: { fewer: true } });
		expect(monthly.rule.from).toBeNull();
		expect(repeatDraft(THURSDAY, rule({ unit: "week", days: [0, 4] }))).toMatchObject({ days: [0, 4], dayOfMonth: 5 });
		expect(repeatDraft(THURSDAY, rule({ kind: "afterDone", unit: "day" })).detail).toBeNull();
	});
});

describe("Remove repeat", () => {
	it("is offered for a rule there is already, through every change, and not for a new one", () => {
		expect(repeatDraft(THURSDAY, null).removable).toBe(false);
		const draft = repeatDraft(THURSDAY, rule({ unit: "week", days: [3] }));
		expect(draft.removable).toBe(true);
		expect(editRepeat(draft, { what: "unit", to: "day" })?.removable).toBe(true);
		expect(editRepeat(repeatDraft(THURSDAY, null), { what: "unit", to: "day" })?.removable).toBe(false);
	});
});

describe("editRepeat", () => {
	const fresh = () => repeatDraft(THURSDAY, null);

	it("every steps up and down, never under 1", () => {
		const two = editRepeat(fresh(), { what: "every", by: 1 })!;
		expect([two.rule.every, two.can.fewer]).toEqual([2, true]);
		expect(editRepeat(two, { what: "every", by: -1 })!.rule.every).toBe(1);
		expect(editRepeat(fresh(), { what: "every", by: -1 })).toBeNull();
	});

	it("a weekday tapped is added in week order or taken off; the last one stays", () => {
		const two = editRepeat(fresh(), { what: "weekday", day: 2 })!;
		expect(two.rule.days).toEqual([2, 3]);
		expect(editRepeat(two, { what: "weekday", day: 3 })!.rule.days).toEqual([2]);
		expect(editRepeat(fresh(), { what: "weekday", day: 3 })).toBeNull();
	});

	it("weekdays only for a weekly schedule", () => {
		expect(editRepeat(after(fresh(), { what: "unit", to: "day" }), { what: "weekday", day: 0 })).toBeNull();
		expect(editRepeat(after(fresh(), { what: "kind", to: "afterDone" }), { what: "weekday", day: 0 })).toBeNull();
	});

	it("the chosen kind or unit again changes nothing", () => {
		expect(editRepeat(fresh(), { what: "unit", to: "week" })).toBeNull();
		expect(editRepeat(fresh(), { what: "kind", to: "schedule" })).toBeNull();
	});

	it("months: the day of the month in place of the weekdays; days: neither", () => {
		const month = editRepeat(fresh(), { what: "unit", to: "month" })!;
		expect([month.rule, month.detail]).toEqual([rule({ unit: "month", dayOfMonth: 5 }), "monthDay"]);
		const day = editRepeat(fresh(), { what: "unit", to: "day" })!;
		expect([day.rule, day.detail]).toEqual([rule({}), null]);
	});

	it("After done keeps the step and drops the weekdays and the month's day", () => {
		const done = after(fresh(), { what: "every", by: 1 }, { what: "kind", to: "afterDone" });
		expect([done.rule, done.detail]).toEqual([rule({ kind: "afterDone", every: 2, unit: "week" }), null]);
		expect(after(done, { what: "unit", to: "month" }).rule).toEqual(rule({ kind: "afterDone", every: 2, unit: "month" }));
	});

	it("the weekdays chosen stay while another kind shows", () => {
		const back = after(fresh(), { what: "weekday", day: 0 }, { what: "kind", to: "afterDone" }, { what: "kind", to: "schedule" });
		expect(back.rule.days).toEqual([0, 3]);
	});

	it("every rule it hands on is one the file can take once anchored at the day", () => {
		const taps: RepeatChange[] = [{ what: "every", by: 1 }, { what: "unit", to: "month" }, { what: "kind", to: "afterDone" }, { what: "unit", to: "day" }, { what: "kind", to: "schedule" }, { what: "unit", to: "week" }, { what: "weekday", day: 6 }];
		let draft = fresh();
		for (const tap of taps) {
			draft = editRepeat(draft, tap) ?? draft;
			expect(Repeat.problemWith(Repeat.anchored(draft.rule, THURSDAY))).toBeNull();
		}
	});
});
