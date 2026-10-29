import type { RightMode } from "../settings";
import { el } from "./dom";
import { icon } from "./icons";

export interface SegmentedControlOptions {
	value(): RightMode;
	onChange(mode: RightMode): void;
}

/** The switch of the right column: the calendar or the Soon list. */
export class SegmentedControl {
	private readonly buttons = new Map<RightMode, HTMLButtonElement>();

	constructor(parent: HTMLElement, private readonly opts: SegmentedControlOptions) {
		const root = el(parent, "div", "tc-seg");
		this.add(root, "calendar", "Calendar");
		this.add(root, "soon", "Soon");
		this.render();
	}

	private add(root: HTMLElement, mode: RightMode, label: string): void {
		const button = el(root, "button", "tc-seg-btn");
		button.setAttribute("aria-label", label);
		button.appendChild(icon(mode));
		button.addEventListener("click", () => this.opts.onChange(mode));
		this.buttons.set(mode, button);
	}

	render(): void {
		for (const [mode, button] of this.buttons) button.classList.toggle("is-on", mode === this.opts.value());
	}
}
