import { el } from "./dom";
import { Button } from "./kit/Button";

export interface DayNavOptions {
	title(): string;
	onStep(days: number): void;
	onToday(): void;
}

/** The day's title between its arrows: over the day's list, or in a mode with no day list over the timeline. */
export class DayNav {
	readonly el: HTMLElement;
	private readonly title: Button;

	constructor(parent: HTMLElement, private readonly opts: DayNavOptions) {
		this.el = el(parent, "div", "tc-head tc-day-nav");
		Button.create(this.el, { kind: "icon", tone: "quiet", label: "Previous day", icon: "chevronLeft", cls: "tc-arrow", onPress: () => opts.onStep(-1) });
		this.title = Button.create(this.el, { kind: "text", label: "Back to today", text: "", cls: "tc-head-title tc-day-title", onPress: () => opts.onToday() });
		Button.create(this.el, { kind: "icon", tone: "quiet", label: "Next day", icon: "chevronRight", cls: "tc-arrow", onPress: () => opts.onStep(1) });
		this.render();
	}

	/** The day's name: a place to drop on the day's list. */
	get titleEl(): HTMLElement {
		return this.title.el;
	}

	render(): void {
		this.title.setText(this.opts.title());
	}
}
