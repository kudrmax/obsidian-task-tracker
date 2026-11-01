import { LAYOUT } from "../design";
import { AutoScroll } from "./AutoScroll";
import type { Timeline } from "../Timeline";
import type { Slot } from "../types";
import type { DragPayload, DropResult, DropTarget } from "./DropTarget";
import { snapMinutes } from "./snap";

export interface TimelineDropOptions {
	step(): number;
}

/** The timeline as a place to drop: a line at the start the task will take, snapped to the grid, that scrolls the day near the edges. */
export class TimelineDrop implements DropTarget {
	private start: number | null = null;
	private duration: number | null = null;
	private last: { x: number; y: number; drag: DragPayload } | null = null;
	private readonly scroll: AutoScroll;

	constructor(
		private readonly timeline: Timeline,
		private readonly opts: TimelineDropOptions,
	) {
		this.scroll = new AutoScroll(
			() => this.timeline.el,
			() => this.last && this.preview(this.last.x, this.last.y, this.last.drag),
		);
	}

	hitTest(x: number, y: number): boolean {
		const r = this.timeline.el.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	/** The start follows the dragged card's top as the finger holds it. */
	preview(x: number, y: number, drag: DragPayload): void {
		this.last = { x, y, drag };
		this.show(this.timeline.minutesAt(y - drag.grabPx), drag.durationMin);
		this.scroll.follow(y);
	}

	/** The target for a new task under a long tap: its start where the finger is. */
	previewNew(y: number): void {
		this.show(this.timeline.minutesAt(y), null);
	}

	/** The slot the target shows now: a task keeps its duration, a new one has none. */
	get slot(): Slot {
		const start = this.start ?? 0;
		return this.timeline.slotAt(start, this.duration === null ? null : start + this.duration);
	}

	private show(wanted: number, duration: number | null): void {
		const latest = LAYOUT.minutesPerDay - (duration ?? LAYOUT.minSlotMinutes);
		const start = Math.min(latest, Math.max(0, snapMinutes(wanted, this.opts.step())));
		this.duration = duration;
		this.start = start;
		this.timeline.showDrop({ start, end: duration === null ? null : start + duration });
	}

	landing(): DOMRect | null {
		return this.timeline.landing();
	}

	leave(): void {
		this.clear();
	}

	clear(): void {
		this.scroll.stop();
		this.start = null;
		this.timeline.clearDrop();
		this.last = null;
	}

	drop(): DropResult {
		return { kind: "slot", slot: this.slot };
	}
}
