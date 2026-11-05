import { AutoScroll } from "./AutoScroll";
import type { Timeline } from "../Timeline";
import type { Slot } from "../types";
import { acceptsDrop, clampSlot } from "../../application/contracts";
import { type DragPayload, type DropResult, type DropTarget, originsOf } from "./DropTarget";
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
		this.show(wanted, drag.durationMin);
		this.scroll.follow(y, box);
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
		const snapped = snapMinutes(wanted, this.opts.step());
		const span = clampSlot(snapped, duration === null ? null : snapped + duration);
		this.duration = duration;
		this.start = span.start;
		this.timeline.showDrop(span);
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
