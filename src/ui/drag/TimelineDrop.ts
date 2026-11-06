import { AutoScroll } from "./AutoScroll";
import type { Timeline } from "../Timeline";
import type { Slot } from "../types";
import { acceptsDrop, type DaySpan, type DropOrigin, type TaskItem } from "../../application/contracts";
import { type DragPayload, type DropResult, type DropTarget, originsOf } from "./DropTarget";
import { snapMinutes } from "./snap";

export interface TimelineDropOptions {
	step(): number;
	/** Where a card from `from` let go at `start` stands (`TaskService.dropSpan`). */
	span(item: TaskItem | null, from: DropOrigin, start: number): DaySpan;
	/** The slot a new task takes at `start` (`TaskService.newSlot`). */
	newSlot(start: number): Slot;
}

/** The timeline as a place to drop: a line at the start the task will take, snapped to the grid, that scrolls the day near the edges. */
export class TimelineDrop implements DropTarget {
	/** The snapped start under the finger, before the service places the card within the day. */
	private start: number | null = null;
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

	hitTest(x: number, y: number, drag: DragPayload): boolean {
		if (!acceptsDrop("timeline", originsOf(drag))) return false;
		const r = this.timeline.viewBox();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	/** The start follows the dragged card's top as the finger holds it. */
	preview(x: number, y: number, drag: DragPayload): void {
		this.last = { x, y, drag };
		const wanted = this.timeline.minutesAt(y - drag.grabPx);
		const box = this.timeline.viewBox();
		this.show(wanted, drag.item, drag.from);
		this.scroll.follow(y, box);
	}

	/** The target for a new task under a long tap: its start where the finger is. */
	previewNew(y: number): void {
		this.show(this.timeline.minutesAt(y), null, "new");
	}

	/** The slot a new task takes where the target shows now. */
	get slot(): Slot {
		return this.opts.newSlot(this.start ?? 0);
	}

	private show(wanted: number, item: TaskItem | null, from: DropOrigin): void {
		this.start = snapMinutes(wanted, this.opts.step());
		this.timeline.showDrop(this.opts.span(item, from, this.start));
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
		return { kind: "time", start: this.start ?? 0 };
	}
}
