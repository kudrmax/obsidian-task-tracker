import type { EventLevel } from "./eventLevels";

/** A task's minutes on the timeline, from the start of the shown day; a null end for one without a duration. */
export interface TaskSpan {
	readonly start: number;
	readonly end: number | null;
}

/** An event already laid out: its minutes and how deep it lies over others (`eventLevels`). */
export interface LevelledSpan {
	readonly start: number;
	readonly end: number;
	readonly level: number;
}

/** A card's height and the gap between cards, in the frontend's units. */
export interface StackCard {
	readonly height: number;
	readonly gap: number;
}

/** The frontend's insets in the items area: a block one `itemInset` under its start and in from the edge, one lying over another `overlayInset` further in. */
export interface TimelineInsets {
	readonly itemInset: number;
	readonly itemGap: number;
	readonly overlayInset: number;
}

/** Where a task card sits in the items area: its top and height, its left edge, and what it shows on the right. */
export interface StackBox {
	readonly top: number;
	readonly height: number;
	readonly left: number;
	/** Laid over a long task's body or an event: ringed in the ground's colour. */
	readonly overlay: boolean;
	/** In a stack pushed off its times: the card shows its start. */
	readonly stacked: boolean;
	/** Its duration is shorter than a card at this zoom: the card shows the duration. */
	readonly hiddenDuration: boolean;
}

const MINUTES_PER_HOUR = 60;
/** Under half a unit off its time a card still stands on it. */
const STACK_SLACK = 0.5;

/** The left edge of a block lying `level` deep: on the ground at the inset, over others one overlay inset per level. */
export function overlayLeft(level: number, insets: TimelineInsets): number {
	return level === 0 ? insets.itemInset : level * insets.overlayInset;
}

/** An event's left edge on the timeline, by how deep it lies (`eventLevels`). */
export function eventLeft(level: EventLevel, insets: TimelineInsets): number {
	return overlayLeft(level.level, insets);
}

/**
 * Tasks never share the width: by start, ties in the order given, each card sits on its own time or one gap under the head
 * (the top card's height) of the one before. A pushed long card still ends at its end. A card that starts on a long card's body or
 * on an event lies over it, one overlay inset further in than the topmost. Answers in the order given.
 */
export function stackTasks(tasks: readonly TaskSpan[], events: readonly LevelledSpan[], hourPx: number, card: StackCard, insets: TimelineInsets): StackBox[] {
	const head = card.height;
	const y = (minutes: number) => (minutes / MINUTES_PER_HOUR) * hourPx;
	const eventsUnder = (top: number, bottom: number) => events.filter((e) => top < y(e.end) && bottom > y(e.start));
	const order = tasks.map((task, index) => ({ task, index })).sort((a, b) => a.task.start - b.task.start || a.index - b.index);
	const boxes: { -readonly [K in keyof StackBox]: StackBox[K] }[] = new Array(tasks.length);
	const bodies: { top: number; bottom: number; left: number }[] = [];
	let previous: (typeof boxes)[number] | null = null;
	let headBottom = -Infinity;
	for (const { task, index } of order) {
		const natural = y(task.start) + insets.itemInset;
		const top = Math.max(natural, headBottom + card.gap);
		const height = task.end === null ? head : Math.max(head, y(task.end) - insets.itemInset - top);
		headBottom = top + head;
		const parent = bodies.filter((b) => top < b.bottom && top + head > b.top).pop();
		const under = eventsUnder(top, top + height);
		const overlay = !!parent || under.length > 0;
		const eventLeft = under.length ? overlayLeft(Math.max(...under.map((e) => e.level)) + 1, insets) : insets.itemInset;
		const left = Math.max(parent ? parent.left + insets.overlayInset : insets.itemInset, eventLeft);
		if (height > head) bodies.push({ top: top + head, bottom: top + height, left });
		const stacked = top - natural > STACK_SLACK;
		if (stacked && previous) previous.stacked = true;
		const hiddenDuration = task.end !== null && y(task.end - task.start) - insets.itemGap < head;
		previous = boxes[index] = { top, height, left, overlay, stacked, hiddenDuration };
	}
	return boxes;
}

/** A duration as the card writes it: a number over its unit. */
export function durationParts(minutes: number): [string, string] {
	if (minutes < MINUTES_PER_HOUR) return [String(minutes), "MIN"];
	const hours = Math.floor(minutes / MINUTES_PER_HOUR);
	const rest = minutes % MINUTES_PER_HOUR;
	return [rest ? `${hours}:${pad(rest)}` : String(hours), "H"];
}

/** A start as a stacked card writes it: the hours over the minutes. */
export function timeParts(minutes: number): [string, string] {
	return [String(Math.floor(minutes / MINUTES_PER_HOUR)), pad(minutes % MINUTES_PER_HOUR)];
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * What a card of the stack shows on the right: a stacked one the time it is put on in the file (`slotStart`, minutes of
 * the clock), one shorter than its duration the duration; null for neither.
 */
export function stackCorner(box: Pick<StackBox, "stacked" | "hiddenDuration">, slotStart: number, span: TaskSpan): [string, string] | null {
	if (box.stacked) return timeParts(slotStart);
	if (box.hiddenDuration && span.end !== null) return durationParts(span.end - span.start);
	return null;
}
