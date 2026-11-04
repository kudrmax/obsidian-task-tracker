import { addDays, addMonths, daysBetween, daysInMonth, isValidLocalDate, partsOf, weekdayOf } from "./LocalDate";
import type { LocalDate } from "./Task";

export type RepeatUnit = "day" | "week" | "month";
/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RepeatRule {
	readonly kind: "schedule" | "afterDone";
	readonly every: number;
	readonly unit: RepeatUnit;
	readonly days: readonly Weekday[];
	readonly dayOfMonth: number | null;
	readonly from: LocalDate | null;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RULE_RE = /^every(?: (\d+))? (day|week|month)(s)?(?: (when done)| on (.+?))?(?: from (\d{4}-\d{2}-\d{2}))?$/;
const ORDINAL_RE = /^the (\d{1,2})(?:st|nd|rd|th)$/;

function ordinal(n: number): string {
	const tens = n % 100;
	if (tens >= 11 && tens <= 13) return `${n}th`;
	const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
	return `${n}${suffix}`;
}

function monthIndexOf(date: LocalDate): number {
	const { year, month } = partsOf(date);
	return year * 12 + month - 1;
}

function mondayOf(date: LocalDate): LocalDate {
	return addDays(date, -weekdayOf(date));
}

export class Repeat {
	private constructor(readonly rule: RepeatRule) {}

	/** Throws for a rule the grammar cannot write: it would loop in `next` or not read back. */
	static of(rule: RepeatRule): Repeat {
		const problem = Repeat.problemWith(rule);
		if (problem) throw new Error(`Invalid repeat rule: ${problem}`);
		return new Repeat(rule);
	}

	private static problemWith({ kind, every, unit, days, dayOfMonth, from }: RepeatRule): string | null {
		if (!Number.isInteger(every) || every < 1) return "every must be a whole number from 1";
		const wantsDays = kind === "schedule" && unit === "week";
		const wantsDayOfMonth = kind === "schedule" && unit === "month";
		if (wantsDays && (days.length === 0 || !days.every((d, i) => Number.isInteger(d) && d >= 0 && d <= 6 && (i === 0 || d > days[i - 1])))) {
			return "days must be Monday to Sunday, in week order, without repeats";
		}
		if (!wantsDays && days.length > 0) return "days belong to a weekly schedule only";
		if (wantsDayOfMonth && !(dayOfMonth !== null && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31)) {
			return "the day of the month must be from 1 to 31";
		}
		if (!wantsDayOfMonth && dayOfMonth !== null) return "a day of the month belongs to a monthly schedule only";
		const wantsFrom = kind === "schedule" && every > 1;
		if (wantsFrom && (from === null || !isValidLocalDate(from))) return "a schedule with every above 1 needs a valid from date";
		if (!wantsFrom && from !== null) return "from belongs to a schedule with every above 1 only";
		return null;
	}

	static parse(text: string): Repeat | null {
		const m = RULE_RE.exec(text.trim());
		if (!m) return null;
		const [, count, unit, plural, whenDone, on, from] = m;
		const every = count === undefined ? 1 : Number(count);
		if (every < 1 || (count !== undefined && every === 1)) return null;
		if (from !== undefined && (every === 1 || !isValidLocalDate(from))) return null;
		if ((plural !== undefined) !== every > 1) return null;
		const rule = { every, unit: unit as RepeatUnit, days: [] as Weekday[], dayOfMonth: null, from: from ?? null };
		if (whenDone !== undefined) {
			return from === undefined ? new Repeat({ ...rule, kind: "afterDone" }) : null;
		}
		if (every > 1 && from === undefined) return null;
		if (unit === "day") return on === undefined ? new Repeat({ ...rule, kind: "schedule" }) : null;
		if (on === undefined) return null;
		if (unit === "week") {
			const days = Repeat.parseDays(on);
			return days ? new Repeat({ ...rule, kind: "schedule", days }) : null;
		}
		const dayOfMonth = Number(ORDINAL_RE.exec(on)?.[1]);
		if (!(dayOfMonth >= 1 && dayOfMonth <= 31) || on !== `the ${ordinal(dayOfMonth)}`) return null;
		return new Repeat({ ...rule, kind: "schedule", dayOfMonth });
	}

	private static parseDays(text: string): Weekday[] | null {
		const days = text.split(", ").map((name) => WEEKDAY_NAMES.indexOf(name));
		const inWeekOrder = days.every((d, i) => d >= 0 && (i === 0 || d > days[i - 1]));
		return inWeekOrder ? (days as Weekday[]) : null;
	}

	format(): string {
		const { kind, every, unit, days, dayOfMonth, from } = this.rule;
		const head = every === 1 ? `every ${unit}` : `every ${every} ${unit}s`;
		if (kind === "afterDone") return `${head} when done`;
		const on = unit === "week" ? ` on ${days.map((d) => WEEKDAY_NAMES[d]).join(", ")}` : unit === "month" ? ` on the ${ordinal(dayOfMonth ?? 1)}` : "";
		return `${head}${on}${from ? ` from ${from}` : ""}`;
	}

	/** Spec §3.2: strictly after max(today, taskDate); afterDone: today + N. */
	next(taskDate: LocalDate | null, today: LocalDate): LocalDate {
		const { kind, every, unit } = this.rule;
		if (kind === "afterDone") {
			return unit === "month" ? addMonths(today, every) : addDays(today, every * (unit === "week" ? 7 : 1));
		}
		const base = taskDate !== null && taskDate > today ? taskDate : today;
		return this.firstAfter(this.rule.from ?? taskDate ?? today, base);
	}

	/** Spec §3.5: first matching day ≥ today for a schedule, null for afterDone. */
	first(today: LocalDate): LocalDate | null {
		if (this.rule.kind === "afterDone") return null;
		return this.firstAfter(this.rule.from ?? today, addDays(today, -1));
	}

	/** The same rule anchored: `from` set to `date` when every > 1, else unchanged. */
	anchoredAt(date: LocalDate): Repeat {
		const { kind, every } = this.rule;
		return kind === "schedule" && every > 1 ? new Repeat({ ...this.rule, from: date }) : this;
	}

	private firstAfter(anchor: LocalDate, base: LocalDate): LocalDate {
		switch (this.rule.unit) {
			case "day":
				return this.firstDayAfter(anchor, base);
			case "week":
				return this.firstWeekdayAfter(anchor, base);
			case "month":
				return this.firstMonthDayAfter(anchor, base);
		}
	}

	private firstDayAfter(anchor: LocalDate, base: LocalDate): LocalDate {
		const { every } = this.rule;
		const cycles = Math.max(0, Math.floor(daysBetween(anchor, base) / every) + 1);
		return addDays(anchor, cycles * every);
	}

	private firstWeekdayAfter(anchor: LocalDate, base: LocalDate): LocalDate {
		const { every, days } = this.rule;
		const anchorWeek = mondayOf(anchor);
		const weeks = Math.floor(daysBetween(anchorWeek, mondayOf(base)) / 7);
		for (let cycle = Math.max(0, Math.floor(weeks / every)); ; cycle++) {
			const week = addDays(anchorWeek, cycle * every * 7);
			const hit = days.map((d) => addDays(week, d)).find((date) => date > base);
			if (hit) return hit;
		}
	}

	private firstMonthDayAfter(anchor: LocalDate, base: LocalDate): LocalDate {
		const { every, dayOfMonth } = this.rule;
		const anchorMonth = monthIndexOf(anchor);
		const months = monthIndexOf(base) - anchorMonth;
		for (let cycle = Math.max(0, Math.floor(months / every)); ; cycle++) {
			const index = anchorMonth + cycle * every;
			const year = Math.floor(index / 12);
			const month = index - year * 12 + 1;
			const day = Math.min(dayOfMonth ?? 1, daysInMonth(year, month));
			const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			if (date > base) return date;
		}
	}
}
