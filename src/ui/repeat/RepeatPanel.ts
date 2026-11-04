import type { RepeatRule, RepeatUnit, Weekday } from "../../application/contracts";
import { dayOfMonth, weekdayOf } from "../dates";
import { el } from "../dom";
import { Button } from "../kit/Button";
import { menuRow } from "../menu/MenuPanel";
import type { LocalDate } from "../types";
import { onTheDay } from "./repeatLabel";

export interface RepeatPanelOptions {
	readonly rule: RepeatRule | null;
	/** The day new rules start from: the task's due date, else today (weekday and month day defaults). */
	readonly day: LocalDate;
	readonly onChange: (rule: RepeatRule) => void;
	/** Remove repeat, at the bottom: the opener offers it for a task that has a rule. */
	readonly onRemove: (() => void) | null;
}

type RepeatKind = RepeatRule["kind"];

interface Choice<T> {
	readonly value: T;
	readonly label: string;
}

const KINDS: readonly Choice<RepeatKind>[] = [
	{ value: "schedule", label: "Schedule" },
	{ value: "afterDone", label: "After done" },
];
const UNITS: readonly Choice<RepeatUnit>[] = [
	{ value: "day", label: "days" },
	{ value: "week", label: "weeks" },
	{ value: "month", label: "months" },
];
const WEEKDAYS = [
	["Mon", "Monday"],
	["Tue", "Tuesday"],
	["Wed", "Wednesday"],
	["Thu", "Thursday"],
	["Fri", "Friday"],
	["Sat", "Saturday"],
	["Sun", "Sunday"],
] as const;

/** A track of a few choices, one of them chosen. */
class Segments<T> {
	private readonly buttons: { readonly value: T; readonly button: Button }[];

	constructor(parent: HTMLElement, cls: string, name: string, choices: readonly Choice<T>[], onPick: (value: T) => void) {
		const track = el(parent, "div", `tc-repeat-seg ${cls}`);
		track.setAttribute("role", "group");
		track.setAttribute("aria-label", name);
		this.buttons = choices.map(({ value, label }) => ({ value, button: Button.create(track, { kind: "text", label, cls: "tc-repeat-seg-btn", onPress: () => onPick(value) }) }));
	}

	show(chosen: T): void {
		for (const { value, button } of this.buttons) {
			button.setOn(value === chosen);
			button.el.setAttribute("aria-pressed", String(value === chosen));
		}
	}
}

/** The repeat of a task as it is being set: every tap changes it and hands the new rule on at once. */
class RepeatEditor {
	private kind: RepeatKind;
	private every: number;
	private unit: RepeatUnit;
	/** The weekdays and the month's day stay while another unit or kind is shown, so going back finds them. */
	private days: readonly Weekday[];
	private monthDay: number;

	private readonly kinds: Segments<RepeatKind>;
	private readonly units: Segments<RepeatUnit>;
	private readonly fewer: Button;
	private readonly count: HTMLElement;
	private readonly removeRow: HTMLElement | null;
	private detail: HTMLElement | null = null;

	constructor(private readonly panel: HTMLElement, private readonly opts: RepeatPanelOptions) {
		const rule = opts.rule;
		this.kind = rule?.kind ?? "schedule";
		this.every = rule?.every ?? 1;
		this.unit = rule?.unit ?? "week";
		this.days = rule && rule.days.length > 0 ? rule.days : [weekdayOf(opts.day) as Weekday];
		this.monthDay = rule?.dayOfMonth ?? Number(dayOfMonth(opts.day));

		panel.classList.add("is-repeat");
		this.kinds = new Segments(panel, "tc-repeat-kind", "Repeat kind", KINDS, (kind) => this.change(() => (this.kind = kind), this.kind !== kind));
		const row = el(panel, "div", "tc-repeat-every");
		el(row, "span", "tc-repeat-every-label", "Every");
		this.fewer = Button.create(row, { kind: "icon", tone: "accent", label: "Fewer", icon: "minus", cls: "tc-repeat-step", onPress: () => this.change(() => this.every--, this.every > 1) });
		this.count = el(row, "span", "tc-repeat-count");
		Button.create(row, { kind: "icon", tone: "accent", label: "More", icon: "plus", cls: "tc-repeat-step", onPress: () => this.change(() => this.every++) });
		this.units = new Segments(panel, "tc-repeat-unit", "Unit", UNITS, (unit) => this.change(() => (this.unit = unit), this.unit !== unit));
		const onRemove = opts.onRemove;
		this.removeRow = onRemove ? menuRow(panel, { label: "Remove repeat", icon: "removeDue", cls: "tc-repeat-remove", onPick: () => onRemove() }) : null;
		panel.classList.toggle("has-remove", this.removeRow !== null);
		this.show();
	}

	private get rule(): RepeatRule {
		const schedule = this.kind === "schedule";
		return {
			kind: this.kind,
			every: this.every,
			unit: this.unit,
			days: schedule && this.unit === "week" ? this.days : [],
			dayOfMonth: schedule && this.unit === "month" ? this.monthDay : null,
			from: null,
		};
	}

	/** A tap: when it changes anything, the panel shows the new rule and hands it on. */
	private change(apply: () => void, changes = true): void {
		if (!changes) return;
		apply();
		this.show();
		this.opts.onChange(this.rule);
	}

	private toggleDay(day: Weekday): void {
		const on = this.days.includes(day);
		this.change(() => (this.days = on ? this.days.filter((d) => d !== day) : [...this.days, day].sort((a, b) => a - b)), !on || this.days.length > 1);
	}

	private show(): void {
		this.kinds.show(this.kind);
		this.units.show(this.unit);
		this.count.textContent = String(this.every);
		this.fewer.setOff(this.every === 1);
		this.fewer.el.setAttribute("aria-disabled", String(this.every === 1));
		this.detail?.remove();
		this.detail = this.buildDetail();
		if (this.detail) this.panel.insertBefore(this.detail, this.removeRow);
	}

	/** Under the unit: the weekdays of a weekly schedule, the day of a monthly one, nothing otherwise. */
	private buildDetail(): HTMLElement | null {
		if (this.kind !== "schedule") return null;
		if (this.unit === "month") return el(null, "div", "tc-repeat-month", onTheDay(this.monthDay));
		if (this.unit !== "week") return null;
		const week = el(null, "div", "tc-repeat-week");
		WEEKDAYS.forEach(([short, name], index) => {
			const day = index as Weekday;
			const on = this.days.includes(day);
			const button = Button.create(week, { kind: "text", label: name, text: short, cls: "tc-repeat-day", onPress: () => this.toggleDay(day) });
			button.setOn(on);
			button.el.setAttribute("aria-pressed", String(on));
		});
		return week;
	}
}

/** The repeat panel (README «Повторы», variant А): the kind, the step, the unit, the weekdays or the month's day, Remove repeat. */
export function repeatPanel(parent: HTMLElement, opts: RepeatPanelOptions): void {
	new RepeatEditor(parent, opts);
}
