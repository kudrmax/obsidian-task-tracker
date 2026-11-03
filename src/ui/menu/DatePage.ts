import { el } from "../dom";
import type { LocalDate } from "../types";
import { menuRow } from "./MenuPanel";
import { MonthPicker } from "./MonthPicker";

export interface DatePageSpec {
	readonly today: LocalDate;
	/** The day the tasks share, shown chosen and its month open; none opens today's month. */
	readonly selected: LocalDate | null;
	onPick(date: LocalDate): void;
	/** Remove due date, when there is one to take off; without it the page has no such row. */
	onRemove?: () => void;
}

/** The date page of a menu: the month, and Remove due date under it. */
export function datePage(panel: HTMLElement, spec: DatePageSpec): MonthPicker {
	panel.classList.add("is-picker");
	const picker = new MonthPicker(el(panel, "div"), { month: spec.selected ?? spec.today, today: spec.today, selected: spec.selected, onPick: (date) => spec.onPick(date) });
	const onRemove = spec.onRemove;
	if (onRemove) menuRow(panel, { label: "Remove due date", icon: "removeDue", cls: "tc-picker-remove", onPick: () => onRemove() });
	return picker;
}
