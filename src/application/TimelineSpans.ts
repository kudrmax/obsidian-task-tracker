import { clampSlot, type DayBoundary, type Span } from "../domain/DayBoundary";
import { MINUTES_PER_DAY } from "../domain/LocalDate";
import type { LocalDate, Slot } from "../domain/Task";

/** The dot of a selected card that is taken: the top one moves the start, the bottom one the end. */
export type ResizeEdge = "start" | "end";

/** Minutes from the start of a day to both edges of a card held by a dot; a task without a duration starts at its own end. */
export interface StretchSpan {
	readonly start: number;
	readonly end: number;
}

/** A task on the timeline as the rules read it: its slot, and whether it is still open. */
export interface SlottedTask {
	readonly slot: Slot;
	readonly open: boolean;
}

/** Where a card let go at `start` stands: as long as `durationMin` (none for null), within the day. */
export function droppedSpan(start: number, durationMin: number | null): Span {
	return clampSlot(start, durationMin === null ? null : start + durationMin);
}

/** Where the cards of a day's timeline stand at a moment, and what a dot held or let go there makes of a task's time. */
export class TimelineSpans {
	constructor(
		private readonly boundary: DayBoundary,
		private readonly now: Date,
	) {}

	/** On today, an open task whose start has passed rides the now line, its duration kept; the file keeps its time. */
	shown(task: SlottedTask, day: LocalDate): Span {
		const own = this.boundary.spanOf(task.slot, day);
		const now = this.nowOn(day);
		if (now === null || !task.open || own.start >= now) return own;
		return { start: now, end: own.end === null ? null : now + own.end - own.start };
	}

	/**
	 * The card while a dot is held at `minute`: the end no earlier than the start nor past the day; the start no earlier
	 * than the day nor past the end, and on a task without a duration no later than its start, which becomes the end.
	 */
	stretched(task: SlottedTask, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan {
		const shown = this.shown(task, day);
		if (edge === "end") return { start: shown.start, end: Math.min(MINUTES_PER_DAY, Math.max(shown.start, minute)) };
		const end = shown.end ?? shown.start;
		return { start: Math.max(0, Math.min(minute, end)), end };
	}

	/**
	 * The slot a dot let go at `minute` writes, null when nothing changes. A span no longer than `minDurationMin` loses
	 * its duration and stands at its start; a task without one whose start dot was pulled keeps its start. The bottom dot
	 * changes only how long the task lasts, so a card riding the now line ends where the finger let go while the file keeps
	 * its own start; the top dot is a new start and writes it.
	 */
	resized(task: SlottedTask, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Slot | null {
		const shown = this.shown(task, day);
		const held = this.stretched(task, day, edge, minute);
		const keepsDuration = held.end - held.start > minDurationMin;
		const unmoved = edge === "start" && shown.end === null;
		const next: Span = keepsDuration ? held : { start: unmoved ? shown.start : held.start, end: null };
		if (next.start === shown.start && next.end === shown.end) return null;
		if (edge === "start") return this.boundary.slotAt(day, next.start, next.end);
		const start = this.boundary.spanOf(task.slot, day).start;
		return this.boundary.slotAt(day, start, next.end === null ? null : start + next.end - next.start);
	}

	/** Minutes from the start of `day` to now; null on another day than today. */
	private nowOn(day: LocalDate): number | null {
		return this.boundary.dayOf(this.now) === day ? this.boundary.offsetOf(day, this.now) : null;
	}
}
