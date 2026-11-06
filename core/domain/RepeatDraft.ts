import { partsOf, weekdayOf } from "./LocalDate";
import { Repeat, type RepeatRule, type RepeatUnit, type Weekday } from "./Repeat";
import type { LocalDate } from "./Task";

export type RepeatKind = RepeatRule["kind"];

const KINDS: readonly RepeatKind[] = ["schedule", "afterDone"];
const UNITS: readonly RepeatUnit[] = ["day", "week", "month"];

/** What the repeat panel holds: the rule's parts, with the weekdays and the month's day kept while another unit or kind shows. */
interface DraftState {
	readonly kind: RepeatKind;
	readonly every: number;
	readonly unit: RepeatUnit;
	/** The weekdays of a weekly schedule, in week order; never none. */
	readonly days: readonly Weekday[];
	readonly dayOfMonth: number;
	/** The day the rule is drawn from: its weekday and month's day are a new rule's, and the rule is checked anchored there. */
	readonly day: LocalDate;
	/** The draft is of a rule there is already: Remove repeat is offered. */
	readonly removable: boolean;
}

/** A rule as it is being set: what may be chosen, what is chosen, and the rule that stands for it. */
export interface RepeatDraft extends DraftState {
	/** The kinds offered, in order. */
	readonly kinds: readonly RepeatKind[];
	/** The units offered, in order. */
	readonly units: readonly RepeatUnit[];
	/** Under the unit: the weekdays of a weekly schedule, the day of a monthly one, nothing otherwise. */
	readonly detail: "weekdays" | "monthDay" | null;
	/** `every` may come down: it stays from 1. */
	readonly can: { readonly fewer: boolean };
	/** The rule to write, without its anchor: `setRepeat` and a new task's write anchor it at the task's day. */
	readonly rule: RepeatRule;
}

/** A tap on the panel. */
export type RepeatChange =
	| { readonly what: "kind"; readonly to: RepeatKind }
	| { readonly what: "unit"; readonly to: RepeatUnit }
	| { readonly what: "every"; readonly by: 1 | -1 }
	| { readonly what: "weekday"; readonly day: Weekday };

/** The day a new rule is drawn from: the task's day, which `setRepeat` anchors the rule at; today for a task without one, where a schedule's first day is looked for from. */
export function repeatDay(taskDay: LocalDate | null, today: LocalDate): LocalDate {
	return taskDay ?? today;
}

function ruleOf({ kind, every, unit, days, dayOfMonth }: DraftState): RepeatRule {
	const schedule = kind === "schedule";
	return { kind, every, unit, days: schedule && unit === "week" ? days : [], dayOfMonth: schedule && unit === "month" ? dayOfMonth : null, from: null };
}

function writable(state: DraftState): boolean {
	return Repeat.problemWith(Repeat.anchored(ruleOf(state), state.day)) === null;
}

function detailOf({ kind, unit }: DraftState): RepeatDraft["detail"] {
	if (kind !== "schedule") return null;
	return unit === "week" ? "weekdays" : unit === "month" ? "monthDay" : null;
}

function draftOf(state: DraftState): RepeatDraft {
	return { ...state, kinds: KINDS, units: UNITS, detail: detailOf(state), can: { fewer: writable({ ...state, every: state.every - 1 }) }, rule: ruleOf(state) };
}

/** The panel for `rule` drawn from `day`; a new rule is a schedule of every week on the day's weekday. */
export function repeatDraft(day: LocalDate, rule: RepeatRule | null): RepeatDraft {
	return draftOf({
		kind: rule?.kind ?? "schedule",
		every: rule?.every ?? 1,
		unit: rule?.unit ?? "week",
		days: rule && rule.days.length > 0 ? rule.days : [weekdayOf(day)],
		dayOfMonth: rule?.dayOfMonth ?? partsOf(day).day,
		day,
		removable: rule !== null,
	});
}

function changed(draft: RepeatDraft, change: RepeatChange): DraftState | null {
	switch (change.what) {
		case "kind":
			return change.to === draft.kind ? null : { ...draft, kind: change.to };
		case "unit":
			return change.to === draft.unit ? null : { ...draft, unit: change.to };
		case "every":
			return { ...draft, every: draft.every + change.by };
		case "weekday": {
			if (draft.detail !== "weekdays") return null;
			const on = draft.days.includes(change.day);
			return { ...draft, days: on ? draft.days.filter((d) => d !== change.day) : [...draft.days, change.day].sort((a, b) => a - b) };
		}
	}
}

/** The draft after a tap; null when the tap changes nothing or would make a rule the file cannot take (every 0, no weekday). */
export function editRepeat(draft: RepeatDraft, change: RepeatChange): RepeatDraft | null {
	const next = changed(draft, change);
	return next && writable(next) ? draftOf(next) : null;
}
