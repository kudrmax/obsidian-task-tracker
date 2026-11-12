import { el } from "./dom";

export interface ColumnHeadersOptions {
	/** The names of the sections Inbox and Soon, as the tasks file heads them. */
	inboxName(): string;
	soonName(): string;
	/** The name of the Done section, over the column the search opens. */
	doneName(): string;
}

/** The ribbon's titles over its lists, each riding with its column: Done's, Inbox's and Soon's names. */
export class ColumnHeaders {
	private readonly doneEl: HTMLElement;
	private readonly inboxEl: HTMLElement;
	private readonly soonEl: HTMLElement;
	/** The headers, Done's, Inbox's, Soon's, in that order. */
	readonly elements: readonly HTMLElement[];

	constructor(parent: HTMLElement, private readonly opts: ColumnHeadersOptions) {
		const heads = (["is-done", "is-inbox", "is-soon"] as const).map((kind) => el(parent, "div", `tc-head ${kind}`));
		this.elements = heads;
		[this.doneEl, this.inboxEl, this.soonEl] = heads.map((head) => el(head, "div", "tc-head-title"));
		this.render();
	}

	/** The title over a column: Inbox's and Soon's names. */
	titleOf(column: "inbox" | "soon"): HTMLElement {
		return column === "inbox" ? this.inboxEl : this.soonEl;
	}

	render(): void {
		this.doneEl.textContent = this.opts.doneName();
		this.inboxEl.textContent = this.opts.inboxName();
		this.soonEl.textContent = this.opts.soonName();
	}
}
