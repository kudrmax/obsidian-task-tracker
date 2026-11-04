import type { RepeatRule, RepeatUnit } from "../../application/contracts";

const UNIT_NAMES: Readonly<Record<RepeatUnit, string>> = { day: "day", week: "week", month: "month" };

/** `1st`, `2nd`, `3rd`, `11th`, `31st`. */
export function ordinal(n: number): string {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	const suffix = ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
	return `${n}${suffix}`;
}

/** `On the 5th`: the day a monthly schedule falls on. */
export function onTheDay(dayOfMonth: number): string {
	return `On the ${ordinal(dayOfMonth)}`;
}

/** `Every day`, `Every 3 weeks`. */
function every(rule: RepeatRule): string {
	const unit = UNIT_NAMES[rule.unit];
	return rule.every === 1 ? `Every ${unit}` : `Every ${rule.every} ${unit}s`;
}

/** The menu row's value: weeks → null (the row draws the M…S letters), else "Every 3 days", "On the 5th", "Every 2 months on the 5th", "Every 3 weeks after done". */
export function repeatValue(rule: RepeatRule): string | null {
	if (rule.kind === "afterDone") return `${every(rule)} after done`;
	if (rule.unit === "week") return null;
	if (rule.unit === "month" && rule.dayOfMonth !== null) {
		return rule.every === 1 ? onTheDay(rule.dayOfMonth) : `${every(rule)} on the ${ordinal(rule.dayOfMonth)}`;
	}
	return every(rule);
}
