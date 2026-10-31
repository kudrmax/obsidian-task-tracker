import { el } from "./dom";
import { icon } from "./icons";

export interface ColumnHeadersOptions {
	title(): string;
	onStep(days: number): void;
	onToday(): void;
	/** The names of the sections Inbox and Soon, as the tasks file heads them. */
	inboxName(): string;
	soonName(): string;
}

/** A header over each list, riding with its column: Inbox's and Soon's names, and over Now the arrows round the day's name. */
export class ColumnHeaders {
	private readonly inboxEl: HTMLElement;
	private readonly soonEl: HTMLElement;
	private readonly titleEl: HTMLButtonElement;

	constructor(parent: HTMLElement, private readonly opts: ColumnHeadersOptions) {
		this.inboxEl = el(el(parent, "div", "tc-head is-inbox"), "div", "tc-head-title");
		this.soonEl = el(el(parent, "div", "tc-head is-soon"), "div", "tc-head-title");
		const nav = el(parent, "div", "tc-head tc-day-nav");
		this.arrow(nav, "chevronLeft", "Previous day", () => opts.onStep(-1));
		this.titleEl = el(nav, "button", "tc-head-title tc-day-title");
		this.titleEl.setAttribute("aria-label", "Back to today");
		this.titleEl.addEventListener("click", () => opts.onToday());
		this.arrow(nav, "chevronRight", "Next day", () => opts.onStep(1));
		this.render();
	}

	private arrow(parent: HTMLElement, name: "chevronLeft" | "chevronRight", label: string, onClick: () => void): void {
		const button = el(parent, "button", "tc-arrow");
		button.setAttribute("aria-label", label);
		button.appendChild(icon(name));
		button.addEventListener("click", onClick);
	}

	render(): void {
		this.inboxEl.textContent = this.opts.inboxName();
		this.soonEl.textContent = this.opts.soonName();
		this.titleEl.textContent = this.opts.title();
	}
}
