import { addDays, addMonths, gridStart, monthTitle, sameMonth, startOfMonth } from "../dates";
import { clear, el as make } from "../dom";
import { Button } from "../kit/Button";
import type { LocalDate } from "../types";

export interface MonthPickerOptions {
	month: LocalDate;
	today: LocalDate;
	selected: LocalDate | null;
	onPick(date: LocalDate): void;
}

const CELLS = 42;
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** A month as six weeks from Monday, with arrows to the neighbouring months. */
export class MonthPicker {
	month: LocalDate;
	private readonly titleEl: HTMLElement;
	private readonly gridEl: HTMLElement;

	constructor(
		readonly el: HTMLElement,
		private readonly opts: MonthPickerOptions,
	) {
		this.month = startOfMonth(opts.month);
		el.classList.add("tc-picker");
		const head = make(el, "div", "tc-picker-head");
		this.titleEl = make(head, "span", "tc-picker-title");
		const nav = make(head, "div", "tc-picker-nav");
		this.arrow(nav, "tc-picker-prev", "Previous month", -1);
		this.arrow(nav, "tc-picker-next", "Next month", 1);
		this.gridEl = make(el, "div", "tc-picker-grid");
		this.render();
	}

	private arrow(parent: HTMLElement, cls: string, label: string, months: -1 | 1): void {
		Button.create(parent, {
			kind: "icon",
			tone: "accent",
			label,
			icon: months < 0 ? "chevronLeft" : "chevronRight",
			cls: `tc-picker-arrow ${cls}`,
			onPress: () => {
				this.month = addMonths(this.month, months);
				this.render();
			},
		});
	}

	render(): void {
		this.titleEl.textContent = monthTitle(this.month);
		clear(this.gridEl);
		for (const name of WEEKDAYS) make(this.gridEl, "span", "tc-weekday", name);
		const start = gridStart(this.month);
		for (let i = 0; i < CELLS; i++) {
			const date = addDays(start, i);
			const day = make(this.gridEl, "button", "tc-btn tc-day", String(Number(date.slice(-2))));
			day.classList.toggle("is-other", !sameMonth(date, this.month));
			day.classList.toggle("is-today", date === this.opts.today);
			day.classList.toggle("is-selected", date === this.opts.selected);
			day.addEventListener("click", () => this.opts.onPick(date));
		}
	}
}
