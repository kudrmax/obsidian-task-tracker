import { repeatParts, type RepeatRule, type RepeatUnit, type Weekday } from "../domain/Repeat";
import type { RepeatKind } from "../domain/RepeatDraft";

function capital(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `On the 5th`: the day a monthly schedule falls on; empty for any other rule. */
export function onTheDay(rule: RepeatRule): string {
	return capital(repeatParts(rule).on ?? "");
}

/**
 * The Repeat row's value: null for weeks on a schedule (the row draws the weekdays' letters, `days`), else `Every 3
 * days`, `On the 5th`, `Every 2 months on the 5th`, `Every 3 weeks after done`.
 */
export function repeatValue(rule: RepeatRule): string | null {
	const { every, on, days, afterDone } = repeatParts(rule);
	if (afterDone) return `${capital(every)} after done`;
	if (days) return null;
	if (on) return rule.every === 1 ? capital(on) : `${capital(every)} ${on}`;
	return capital(every);
}

/** The words of the repeat page: its kinds, its units after Every, and the weekdays, short and whole, Monday first. */
export const REPEAT_WORDS: {
	readonly kinds: Readonly<Record<RepeatKind, string>>;
	readonly every: string;
	readonly units: Readonly<Record<RepeatUnit, string>>;
	readonly weekdays: readonly { readonly short: string; readonly name: string; readonly letter: string }[];
	readonly remove: string;
} = {
	kinds: { schedule: "Schedule", afterDone: "After done" },
	every: "Every",
	units: { day: "days", week: "weeks", month: "months" },
	weekdays: [
		{ short: "Mon", name: "Monday", letter: "M" },
		{ short: "Tue", name: "Tuesday", letter: "T" },
		{ short: "Wed", name: "Wednesday", letter: "W" },
		{ short: "Thu", name: "Thursday", letter: "T" },
		{ short: "Fri", name: "Friday", letter: "F" },
		{ short: "Sat", name: "Saturday", letter: "S" },
		{ short: "Sun", name: "Sunday", letter: "S" },
	],
	remove: "Remove repeat",
};

/** The Repeat row of a menu: its value on the right, and the weekdays of a weekly schedule, lit among the week's letters. */
export interface RepeatRow {
	/** `repeatValue`; empty for no rule and for weeks on a schedule. */
	readonly value: string;
	/** A weekly schedule's weekdays (0 Monday); null for any other rule. */
	readonly days: readonly Weekday[] | null;
}

export function repeatRow(rule: RepeatRule | null): RepeatRow {
	if (rule === null) return { value: "", days: null };
	return { value: repeatValue(rule) ?? "", days: repeatParts(rule).days };
}
