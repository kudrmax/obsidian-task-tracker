import { el } from "./dom";
import { Button } from "./kit/Button";

export interface ColumnHeadersOptions {
	title(): string;
	onStep(days: number): void;
	onToday(): void;
	/** The names of the sections Inbox and Soon, as the tasks file heads them. */
	inboxName(): string;
	soonName(): string;
	/** The name of the Done section, over the column the search opens. */
	doneName(): string;
}

/** A header over each list, riding with its column: Done's, Inbox's and Soon's names, and over Now the arrows round the day's name. */
export class ColumnHeaders {
	private readonly doneEl: HTMLElement;
	private readonly inboxEl: HTMLElement;
	private readonly soonEl: HTMLElement;
	private readonly title: Button;

	constructor(parent: HTMLElement, private readonly opts: ColumnHeadersOptions) {
		this.doneEl = el(el(parent, "div", "tc-head is-done"), "div", "tc-head-title");
		this.inboxEl = el(el(parent, "div", "tc-head is-inbox"), "div", "tc-head-title");
		this.soonEl = el(el(parent, "div", "tc-head is-soon"), "div", "tc-head-title");
		const nav = el(parent, "div", "tc-head tc-day-nav");
		Button.create(nav, { kind: "icon", tone: "quiet", label: "Previous day", icon: "chevronLeft", cls: "tc-arrow", onPress: () => opts.onStep(-1) });
		this.title = Button.create(nav, { kind: "text", label: "Back to today", text: "", cls: "tc-head-title tc-day-title", onPress: () => opts.onToday() });
		Button.create(nav, { kind: "icon", tone: "quiet", label: "Next day", icon: "chevronRight", cls: "tc-arrow", onPress: () => opts.onStep(1) });
		this.render();
	}

	render(): void {
		this.doneEl.textContent = this.opts.doneName();
		this.inboxEl.textContent = this.opts.inboxName();
		this.soonEl.textContent = this.opts.soonName();
		this.title.setText(this.opts.title());
	}
}
