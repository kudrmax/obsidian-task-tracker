import { DESIGN, LAYOUT } from "../../design";
import type { TimeScale } from "./timeScale";

/**
 * Where the calendar's tasks and events stand (spec, «Where things stand», «Time scale»): the design's «Задачи на
 * таймлайне» and «События внахлёст» laid out by the one time scale. Tasks never share the width: by start, each card on
 * its own time or one gap under the head of the one before (a stack, its start then written on the right); a card that
 * starts on a long card's body or on an event lies over it, further in. Events never share the width either: one that
 * starts while another goes on lies over it, further in. The port says what stands where in minutes; this lays it out.
 */

/** A task on the calendar in minutes from the day's start: where it is drawn, and its length (null: none, a card's height). */
export interface TaskSpan {
	readonly start: number;
	readonly length: number | null;
}

/** An event in minutes from the day's start. */
export interface EventSpan {
	readonly start: number;
	readonly end: number;
}

/** A task card's box in the calendar's items: its top and height, its left edge, and what it shows on the right. */
export interface TaskBox {
	readonly top: number;
	readonly height: number;
	readonly left: number;
	/** In a stack pushed off its times: the card writes its start. */
	readonly stacked: boolean;
	/** Its length is shorter than a card at this zoom: the card writes its length. */
	readonly shortLength: boolean;
	/** Its place in the stack, from 0: a card lying over another is drawn over it. */
	readonly rank: number;
}

/** An event's box: its top and height, its left edge by how deep it lies over others, and how high it lies. */
export interface EventBox {
	readonly top: number;
	readonly height: number;
	readonly left: number;
	readonly level: number;
	readonly layer: number;
}

/** A card's height and the gap between cards (the design's tokens at the default card size). */
export interface CardMeasure {
	readonly height: number;
	readonly gap: number;
}

export const CARD: CardMeasure = { height: DESIGN.cardHeight, gap: DESIGN.cardGap };

/** Under half a pixel off its time a card still stands on it. */
const STACK_SLACK = 0.5;

const overlayLeft = (level: number): number => (level === 0 ? DESIGN.itemInset : level * LAYOUT.overlayInset);

/** Each event's box, in the order given: by start, the longer first on a tie; one starting while another goes on lies over it, one inset in, and higher. */
export function layEvents(events: readonly EventSpan[], scale: TimeScale): EventBox[] {
	const order = events.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
	const boxes: EventBox[] = new Array(events.length);
	const placed: (EventSpan & { readonly level: number })[] = [];
	for (const { span, index } of order) {
		const under = placed.filter((p) => p.start <= span.start && span.start < p.end).pop();
		const level = under ? under.level + 1 : 0;
		boxes[index] = { top: scale.y(span.start) + DESIGN.itemInset, height: scale.y(span.end - span.start) - DESIGN.itemGap, left: overlayLeft(level), level, layer: placed.length };
		placed.push({ ...span, level });
	}
	return boxes;
}

/** Each task card's box, in the order given (ties in that order): the stack of the design's «Задачи на таймлайне». */
export function layTasks(tasks: readonly TaskSpan[], events: readonly EventBox[], scale: TimeScale, card: CardMeasure = CARD): TaskBox[] {
	const order = tasks.map((task, index) => ({ task, index })).sort((a, b) => a.task.start - b.task.start || a.index - b.index);
	const boxes: { -readonly [K in keyof TaskBox]: TaskBox[K] }[] = new Array(tasks.length);
	const bodies: { readonly top: number; readonly bottom: number; readonly left: number }[] = [];
	let previous: (typeof boxes)[number] | null = null;
	let headBottom = -Infinity;
	for (const [rank, { task, index }] of order.entries()) {
		const natural = scale.y(task.start) + DESIGN.itemInset;
		const top = Math.max(natural, headBottom + card.gap);
		const end = task.length === null ? null : scale.y(task.start + task.length) - DESIGN.itemInset;
		const height = end === null ? card.height : Math.max(card.height, end - top);
		headBottom = top + card.height;
		const parent = bodies.filter((b) => top < b.bottom && top + card.height > b.top).pop();
		const under = events.filter((e) => top < e.top + e.height && top + height > e.top);
		const eventLeft = under.length > 0 ? overlayLeft(Math.max(...under.map((e) => e.level)) + 1) : DESIGN.itemInset;
		const left = Math.max(parent ? parent.left + LAYOUT.overlayInset : DESIGN.itemInset, eventLeft);
		if (height > card.height) bodies.push({ top: top + card.height, bottom: top + height, left });
		const stacked = top - natural > STACK_SLACK;
		if (stacked && previous) previous.stacked = true;
		const shortLength = task.length !== null && scale.y(task.length) - DESIGN.itemGap < card.height;
		previous = boxes[index] = { top, height, left, stacked, shortLength, rank };
	}
	return boxes;
}

/** The bottom of the lowest card: a stack running past the day's end lengthens the day. */
export function stackEnd(boxes: readonly TaskBox[]): number {
	return boxes.reduce((bottom, box) => Math.max(bottom, box.top + box.height), 0);
}

/** Where today opens: how far under the room's top the now line stands (the reveal's scroll margin). */
export interface Opening {
	readonly above: number;
}

/**
 * Today opens with the now line at its share of what a person sees of the calendar (`visible`, above the screen's foot),
 * the day `dayHeight` tall and the line `y` down it; near the day's first or last hour the scroll stops at the day's end,
 * no room is kept over or under it (Max, 2026-11-19: the day's ends are the calendar's edges at every zoom); a day that
 * fits stands at its top.
 */
export function opening(y: number, dayHeight: number, visible: number): Opening {
	if (dayHeight + 2 * DESIGN.labelLift <= visible) return { above: DESIGN.labelLift + y };
	return { above: LAYOUT.nowFraction * visible };
}
