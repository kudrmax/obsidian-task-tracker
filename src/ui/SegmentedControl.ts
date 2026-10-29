import type { RightMode } from "../settings";
import { el } from "./dom";
import { icon } from "./icons";

export interface SegmentedControlOptions {
	value(): RightMode;
	onChange(mode: RightMode): void;
	/** A calendar source is stale or failing: the orange dot on the calendar button. */
	dot(): boolean;
	/** The calendar button pressed while the calendar already shows: the sources window. */
	onCalendarAgain(): void;
}

/** The switch of the right column: the calendar or the Soon list. */
export class SegmentedControl {
	readonly el: HTMLElement;
	private readonly buttons = new Map<RightMode, HTMLButtonElement>();
	private readonly dot: HTMLElement;

	constructor(parent: HTMLElement, private readonly opts: SegmentedControlOptions) {
		this.el = el(parent, "div", "tc-seg");
		const calendar = this.add(this.el, "calendar", "Calendar");
		this.dot = el(calendar, "span", "tc-dot");
		this.add(this.el, "soon", "Soon");
		this.render();
	}

	private add(root: HTMLElement, mode: RightMode, label: string): HTMLButtonElement {
		const button = el(root, "button", "tc-seg-btn");
		button.setAttribute("aria-label", label);
		button.appendChild(icon(mode));
		button.addEventListener("click", () => (mode === "calendar" && this.opts.value() === "calendar" ? this.opts.onCalendarAgain() : this.opts.onChange(mode)));
		this.buttons.set(mode, button);
		return button;
	}

	render(): void {
		for (const [mode, button] of this.buttons) button.classList.toggle("is-on", mode === this.opts.value());
		this.dot.classList.toggle("is-shown", this.opts.dot());
	}
}
