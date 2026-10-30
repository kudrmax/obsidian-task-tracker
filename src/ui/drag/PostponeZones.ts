import { addDays } from "../dates";
import { tokenPx } from "../design";
import { el } from "../dom";
import { icon, type IconName } from "../icons";
import type { LocalDate } from "../types";
import type { DropResult, DropTarget } from "./DropTarget";

type Zone = "tomorrow" | "pick";

/** One zone as a place to drop: lit while the card is over it, the card held above the bar. */
class PostponeDrop implements DropTarget {
	constructor(
		private readonly zone: HTMLElement,
		private readonly bar: HTMLElement,
		private readonly kind: Zone,
		private readonly today: () => LocalDate,
		private readonly onEnter: () => void,
	) {}

	hitTest(x: number, y: number): boolean {
		const r = this.zone.getBoundingClientRect();
		return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	preview(): void {
		if (this.zone.classList.contains("is-hot")) return;
		this.zone.classList.add("is-hot");
		this.onEnter();
	}

	ceiling(): number {
		return this.bar.getBoundingClientRect().top - tokenPx(this.bar, "--tc-space-8");
	}

	/** Into Tomorrow the card goes; from Pick a date it goes back to its place, where the date picker opens over it. */
	landing(): DOMRect | null {
		return this.kind === "tomorrow" ? this.zone.getBoundingClientRect() : null;
	}

	clear(): void {
		this.zone.classList.remove("is-hot");
	}

	drop(): DropResult {
		return this.kind === "tomorrow" ? { kind: "postpone", date: addDays(this.today(), 1) } : { kind: "pickDate" };
	}
}

/** Tomorrow and Pick a date: one bar across the bottom of the screen while a card is dragged. */
export class PostponeZones {
	readonly targets: readonly DropTarget[];
	private readonly bar: HTMLElement;

	/** `onEnter`: the finger came onto a zone (a haptic tap). */
	constructor(parent: HTMLElement, today: () => LocalDate, onEnter: () => void) {
		this.bar = el(parent, "div", "tc-postpone");
		this.targets = [
			new PostponeDrop(this.zone(this.bar, "tomorrow", "Tomorrow"), this.bar, "tomorrow", today, onEnter),
			new PostponeDrop(this.zone(this.bar, "calendar", "Pick a date"), this.bar, "pick", today, onEnter),
		];
	}

	/** The bar's top while it shows, in client pixels; null while it is hidden. */
	top(): number | null {
		const r = this.bar.getBoundingClientRect();
		return r.height > 0 ? r.top : null;
	}

	private zone(box: HTMLElement, iconName: IconName, label: string): HTMLElement {
		const zone = el(box, "div", "tc-zone");
		zone.appendChild(icon(iconName));
		el(zone, "span", "tc-zone-label", label);
		return zone;
	}
}
