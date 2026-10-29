import { formatTime } from "../dates";
import { LAYOUT, PROPERTY } from "../design";
import { el, px } from "../dom";
import type { Timeline } from "../Timeline";
import type { LocalDate } from "../types";
import type { DragPayload, DropResult, DropTarget } from "./DropTarget";
import { snapMinutes } from "./snap";

function setColumn(block: HTMLElement, column: number, columns: number): void {
	block.style.setProperty(PROPERTY.column, String(column));
	block.style.setProperty(PROPERTY.columns, String(columns));
}

export interface TimelineDropOptions {
	step(): number;
	date(): LocalDate;
}

/** The timeline as a place to drop: a dashed target snapped to the grid, with the start time, that scrolls the day near the edges. */
export class TimelineDrop implements DropTarget {
	private dropEl: HTMLElement | null = null;
	private sharing: HTMLElement[] = [];
	private start = 0;
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

	preview(x: number, y: number, drag: DragPayload): void {
		this.last = { x, y, drag };
		const latest = LAYOUT.minutesPerDay - drag.durationMin;
		const wanted = this.timeline.minutesAt(y) - drag.anchorMin;
		this.start = Math.min(latest, Math.max(0, snapMinutes(wanted, this.opts.step())));
		this.dropEl ??= el(this.timeline.itemsEl, "div", "tc-item tc-drop");
		this.dropEl.style.setProperty(PROPERTY.y, px(this.timeline.yOf(this.start)));
		this.dropEl.style.setProperty(PROPERTY.length, px(this.timeline.yOf(this.start + drag.durationMin) - this.timeline.yOf(this.start)));
		this.dropEl.textContent = formatTime(this.start);
		this.share(this.timeline.blocksBetween(this.start, this.start + drag.durationMin).filter((b) => !b.classList.contains("is-lifted")));
		this.autoScroll(y);
	}

	/** A block already at the target's time takes the right half; the target the left. */
	private share(blocks: HTMLElement[]): void {
		for (const block of this.sharing) if (!blocks.includes(block)) setColumn(block, 0, 1);
		for (const block of blocks) setColumn(block, 1, 2);
		this.sharing = blocks;
		if (this.dropEl) setColumn(this.dropEl, 0, blocks.length ? 2 : 1);
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
		return this.dropEl?.getBoundingClientRect() ?? null;
	}

	clear(): void {
		if (this.frame) cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.share([]);
		this.dropEl?.remove();
		this.dropEl = null;
		this.last = null;
	}

	drop(_x: number, _y: number, drag: DragPayload): DropResult {
		return { kind: "slot", slot: { date: this.opts.date(), start: this.start, end: this.start + drag.durationMin } };
	}
}
