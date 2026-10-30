import { LAYOUT } from "../design";
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
	private frame = 0;

	constructor(
		private readonly timeline: Timeline,
		private readonly opts: TimelineDropOptions,
	) {}

	hitTest(x: number, y: number): boolean {
		const r = this.timeline.el.getBoundingClientRect();
		return x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	/** The start follows the dragged card's top as the finger holds it. */
	preview(x: number, y: number, drag: DragPayload): void {
		this.last = { x, y, drag };
		this.show(this.timeline.minutesAt(y - drag.grabPx), drag.durationMin);
		this.autoScroll(y);
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

	/** Near the top or bottom edge the day scrolls under the finger, faster the closer to the edge. */
	private autoScroll(y: number): void {
		const r = this.timeline.el.getBoundingClientRect();
		const edge = LAYOUT.autoScrollEdge;
		let velocity = 0;
		if (y < r.top + edge) velocity = -(1 - Math.max(0, y - r.top) / edge) * LAYOUT.autoScrollSpeed;
		else if (y > r.bottom - edge) velocity = (1 - Math.max(0, r.bottom - y) / edge) * LAYOUT.autoScrollSpeed;
		if (velocity === 0 || this.frame) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			const before = this.timeline.el.scrollTop;
			this.timeline.el.scrollTop = before + velocity;
			if (this.last && this.timeline.el.scrollTop !== before) this.preview(this.last.x, this.last.y, this.last.drag);
		});
	}

	landing(): DOMRect | null {
		return this.timeline.landing();
	}

	clear(): void {
		if (this.frame) cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.start = null;
		this.timeline.clearDrop();
		this.last = null;
	}

	drop(): DropResult {
		return { kind: "slot", slot: this.slot };
	}
}
