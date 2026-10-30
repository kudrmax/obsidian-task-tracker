import type { RightMode } from "../settings";
import { el } from "./dom";
import { icon } from "./icons";
import { ColumnSwitch } from "./ColumnSwitch";

export interface DayHeaderOptions {
	title(): string;
	onStep(days: number): void;
	onToday(): void;
	mode(): RightMode;
	onMode(mode: RightMode): void;
	dot(): boolean;
	onSources(anchor: HTMLElement): void;
	longPressMs(): number;
}

/** The day row: the arrows round the day's name, and the switch of the columns. */
export class DayHeader {
	private readonly titleEl: HTMLButtonElement;
	private readonly switcher: ColumnSwitch;

	constructor(parent: HTMLElement, private readonly opts: DayHeaderOptions) {
		const row = el(parent, "div", "tc-day-row");
		const nav = el(row, "div", "tc-day-nav");
		this.arrow(nav, "chevronLeft", "Previous day", () => opts.onStep(-1));
		this.titleEl = el(nav, "button", "tc-day-title");
		this.titleEl.setAttribute("aria-label", "Back to today");
		this.titleEl.addEventListener("click", () => opts.onToday());
		this.arrow(nav, "chevronRight", "Next day", () => opts.onStep(1));
		this.switcher = new ColumnSwitch(row, {
			value: () => opts.mode(),
			onChange: (mode) => opts.onMode(mode),
			dot: () => opts.dot(),
			onSources: () => opts.onSources(this.switcher.el),
			longPressMs: () => opts.longPressMs(),
		});
		this.render();
	}

	private arrow(parent: HTMLElement, name: "chevronLeft" | "chevronRight", label: string, onClick: () => void): void {
		const button = el(parent, "button", "tc-arrow");
		button.setAttribute("aria-label", label);
		button.appendChild(icon(name));
		button.addEventListener("click", onClick);
	}

	render(): void {
		this.titleEl.textContent = this.opts.title();
		this.switcher.render();
	}
}
