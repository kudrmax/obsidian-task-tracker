// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { repeatDraft, type RepeatRule } from "../../src/application/contracts";
import { repeatPanel, type RepeatPanelOptions } from "../../src/ui/repeat/RepeatPanel";

afterEach(() => document.body.replaceChildren());

const THURSDAY = "2026-11-05";
const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

function open({ rule = null, ...opts }: Partial<RepeatPanelOptions> & { rule?: RepeatRule | null } = {}): { panel: HTMLElement; changes: RepeatRule[] } {
	const panel = document.body.appendChild(document.createElement("div"));
	const changes: RepeatRule[] = [];
	repeatPanel(panel, { draft: repeatDraft(THURSDAY, rule), onChange: (changed) => changes.push(changed), onRemove: () => undefined, ...opts });
	return { panel, changes };
}

const chosen = (panel: HTMLElement, group: string) => [...panel.querySelectorAll<HTMLElement>(`${group} .tc-repeat-seg-btn.is-on`)].map((b) => b.textContent);
const segment = (panel: HTMLElement, group: string, label: string) => [...panel.querySelectorAll<HTMLElement>(`${group} .tc-repeat-seg-btn`)].find((b) => b.textContent === label)!;
const count = (panel: HTMLElement) => panel.querySelector(".tc-repeat-count")?.textContent;
const more = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[aria-label="More"]')!;
const fewer = (panel: HTMLElement) => panel.querySelector<HTMLElement>('[aria-label="Fewer"]')!;
const pressedDays = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>('.tc-repeat-day[aria-pressed="true"]')].map((b) => b.textContent);
const day = (panel: HTMLElement, label: string) => [...panel.querySelectorAll<HTMLElement>(".tc-repeat-day")].find((b) => b.textContent === label)!;

describe("repeatPanel", () => {
	it("with no rule: Schedule, every 1 week, on the weekday of the day", () => {
		const { panel, changes } = open();
		expect(panel.classList.contains("is-repeat")).toBe(true);
		expect(chosen(panel, ".tc-repeat-kind")).toEqual(["Schedule"]);
		expect(chosen(panel, ".tc-repeat-unit")).toEqual(["weeks"]);
		expect(count(panel)).toBe("1");
		expect(panel.querySelectorAll(".tc-repeat-day")).toHaveLength(7);
		expect(pressedDays(panel)).toEqual(["Thu"]);
		expect(panel.querySelector(".tc-repeat-month")).toBeNull();
		expect(changes).toEqual([]);
	});

	it("− is off at 1 and does nothing", () => {
		const { panel, changes } = open();
		expect(fewer(panel).classList.contains("is-off")).toBe(true);
		fewer(panel).click();
		expect(changes).toEqual([]);
		expect(count(panel)).toBe("1");
	});

	it("+ steps every up and applies at once; − then steps it down", () => {
		const { panel, changes } = open();
		more(panel).click();
		expect(changes).toEqual([{ kind: "schedule", every: 2, unit: "week", days: [3], dayOfMonth: null, from: null }]);
		expect(count(panel)).toBe("2");
		expect(fewer(panel).classList.contains("is-off")).toBe(false);
		fewer(panel).click();
		expect(changes[1].every).toBe(1);
	});

	it("a weekday tapped is added, in week order", () => {
		const { panel, changes } = open();
		day(panel, "Wed").click();
		expect(last(changes)).toEqual({ kind: "schedule", every: 1, unit: "week", days: [2, 3], dayOfMonth: null, from: null });
		expect(pressedDays(panel)).toEqual(["Wed", "Thu"]);
		day(panel, "Thu").click();
		expect(last(changes)?.days).toEqual([2]);
	});

	it("the only chosen weekday stays", () => {
		const { panel, changes } = open();
		day(panel, "Thu").click();
		expect(changes).toEqual([]);
		expect(pressedDays(panel)).toEqual(["Thu"]);
	});

	it("months: the day's number in place of the week", () => {
		const { panel, changes } = open();
		segment(panel, ".tc-repeat-unit", "months").click();
		expect(last(changes)).toEqual({ kind: "schedule", every: 1, unit: "month", days: [], dayOfMonth: 5, from: null });
		expect(panel.querySelector(".tc-repeat-month")?.textContent).toBe("On the 5th");
		expect(panel.querySelector(".tc-repeat-week")).toBeNull();
	});

	it("days: neither the week nor the month's day", () => {
		const { panel, changes } = open();
		segment(panel, ".tc-repeat-unit", "days").click();
		expect(last(changes)).toEqual({ kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null });
		expect(panel.querySelector(".tc-repeat-week")).toBeNull();
		expect(panel.querySelector(".tc-repeat-month")).toBeNull();
	});

	it("After done hides the week and the month's day, and keeps the step", () => {
		const { panel, changes } = open();
		more(panel).click();
		segment(panel, ".tc-repeat-kind", "After done").click();
		expect(last(changes)).toEqual({ kind: "afterDone", every: 2, unit: "week", days: [], dayOfMonth: null, from: null });
		expect(chosen(panel, ".tc-repeat-kind")).toEqual(["After done"]);
		expect(panel.querySelector(".tc-repeat-week")).toBeNull();
		segment(panel, ".tc-repeat-unit", "months").click();
		expect(last(changes)).toEqual({ kind: "afterDone", every: 2, unit: "month", days: [], dayOfMonth: null, from: null });
		expect(panel.querySelector(".tc-repeat-month")).toBeNull();
	});

	it("back to Schedule weeks, the days chosen before come back", () => {
		const { panel, changes } = open();
		day(panel, "Mon").click();
		segment(panel, ".tc-repeat-kind", "After done").click();
		segment(panel, ".tc-repeat-kind", "Schedule").click();
		expect(last(changes)?.days).toEqual([0, 3]);
	});

	it("shows the rule it is given", () => {
		const { panel } = open({ rule: { kind: "schedule", every: 3, unit: "month", days: [], dayOfMonth: 31, from: "2026-10-31" } });
		expect(chosen(panel, ".tc-repeat-unit")).toEqual(["months"]);
		expect(count(panel)).toBe("3");
		expect(panel.querySelector(".tc-repeat-month")?.textContent).toBe("On the 31st");
	});

	it("a tap on the chosen segment changes nothing", () => {
		const { panel, changes } = open();
		segment(panel, ".tc-repeat-unit", "weeks").click();
		segment(panel, ".tc-repeat-kind", "Schedule").click();
		expect(changes).toEqual([]);
	});

	it("shows Remove repeat from the start for a rule there is already, and a change adds or takes none", () => {
		const { panel } = open({ rule: { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null } });
		expect(panel.querySelectorAll(".tc-repeat-remove")).toHaveLength(1);
		segment(panel, ".tc-repeat-unit", "days").click();
		expect([panel.querySelectorAll(".tc-repeat-remove").length, panel.lastElementChild === panel.querySelector(".tc-repeat-remove")]).toEqual([1, true]);
		const none = open().panel;
		segment(none, ".tc-repeat-unit", "days").click();
		expect([none.querySelector(".tc-repeat-remove"), none.classList.contains("has-remove")]).toEqual([null, false]);
	});

	it("drawn again into the same panel for a task without a rule, leaves no room for a Remove row it does not have", () => {
		const { panel } = open({ rule: { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null }, onRemove: () => undefined });
		panel.replaceChildren();
		repeatPanel(panel, { draft: repeatDraft(THURSDAY, null), onChange: () => undefined, onRemove: () => undefined });
		expect([panel.querySelector(".tc-repeat-remove"), panel.classList.contains("has-remove")]).toEqual([null, false]);
	});

	it("Remove repeat only for a rule there is already", () => {
		expect(open().panel.querySelector(".tc-repeat-remove")).toBeNull();
		let removed = 0;
		const { panel } = open({ rule: { kind: "schedule", every: 1, unit: "day", days: [], dayOfMonth: null, from: null }, onRemove: () => removed++ });
		const row = panel.querySelector<HTMLElement>(".tc-repeat-remove")!;
		expect([row.textContent, row.querySelector("svg") !== null, panel.lastElementChild === row]).toEqual(["Remove repeat", true, true]);
		row.click();
		expect(removed).toBe(1);
	});
});
