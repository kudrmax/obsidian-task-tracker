import { repeatParts, type RepeatRule } from "../../../core/application/contracts";

function capital(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

/** `On the 5th`: the day a monthly schedule falls on; empty for any other rule. */
export function onTheDay(rule: RepeatRule): string {
	return capital(repeatParts(rule).on ?? "");
}

/** The menu row's value: weeks → null (the row draws the M…S letters), else "Every 3 days", "On the 5th", "Every 2 months on the 5th", "Every 3 weeks after done". */
export function repeatValue(rule: RepeatRule): string | null {
	const { every, on, days, afterDone } = repeatParts(rule);
	if (afterDone) return `${capital(every)} after done`;
	if (days) return null;
	if (on) return rule.every === 1 ? capital(on) : `${capital(every)} ${on}`;
	return capital(every);
}
