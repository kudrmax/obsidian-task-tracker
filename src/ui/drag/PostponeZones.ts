import { addDays } from "../dates";
import { el } from "../dom";
import { icon, type IconName } from "../icons";
import type { LocalDate } from "../types";
import type { DropResult, DropTarget } from "./DropTarget";

/** A day a zone puts the task off to, counted from today; null: Pick a date, which asks for the day. */
type Offset = 0 | 1 | null;

/** One zone as a place to drop: lit while the card is over it, out of reach while it is not offered. */
class PostponeDrop implements DropTarget {
	constructor(
		readonly zone: HTMLElement,
		readonly offset: Offset,
		private readonly today: () => LocalDate,
	) {}

	hitTest(x: number, y: number): boolean {
		if (this.zone.hidden) return false;
		const r = this.zone.getBoundingClientRect();
		return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	preview(): void {
		this.zone.classList.add("is-hot");
	}

	/** Into Today or Tomorrow the card goes; from Pick a date it goes back to its place, where the date picker opens over it. */
	landing(): DOMRect | null {
		return this.offset === null ? null : this.zone.getBoundingClientRect();
	}

	leave(): void {
		this.clear();
	}

	clear(): void {
		this.zone.classList.remove("is-hot");
	}

	drop(): DropResult {
		return this.offset === null ? { kind: "pickDate" } : { kind: "postpone", date: addDays(this.today(), this.offset) };
	}
}

/**
 * Today, Tomorrow and Pick a date, one over the other in place of New task under the Today column while a card is
 * dragged: the days to come lie past today, so a task is put off through it. The day the column shows is no zone, a
 * task goes onto the column itself for it.
 */
export class PostponeZones {
	private readonly drops: readonly PostponeDrop[];

	/** `open`: the day the column shows. */
	constructor(
		parent: HTMLElement,
		private readonly today: () => LocalDate,
		private readonly open: () => LocalDate,
	) {
		const box = el(parent, "div", "tc-postpone");
		this.drops = [
			new PostponeDrop(this.zone(box, "now", "Today"), 0, today),
			new PostponeDrop(this.zone(box, "tomorrow", "Tomorrow"), 1, today),
			new PostponeDrop(this.zone(box, "calendar", "Pick a date"), null, today),
		];
	}

	get targets(): readonly DropTarget[] {
		return this.drops;
	}

	/** Offers the zones for the day open now; called as a card is lifted. */
	show(): void {
		const open = this.open();
		for (const drop of this.drops) drop.zone.hidden = drop.offset !== null && addDays(this.today(), drop.offset) === open;
	}

	private zone(box: HTMLElement, iconName: IconName, label: string): HTMLElement {
		const zone = el(box, "div", "tc-zone");
		zone.appendChild(icon(iconName));
		el(zone, "span", "tc-zone-label", label);
		return zone;
	}
}
