import { DESIGN, LAYOUT } from "../../design";
import type { TimeScale } from "./timeScale";

/**
 * Where the calendar's tasks and events stand (spec, «Where things stand», «Time scale»): the design's «Задачи на
 * таймлайне» and «События внахлёст» laid out by the one time scale. Tasks never share the width: by start, each card on
 * its own time or one gap under the head of the one before (a stack, its start then written on the right); a card that
 * starts on a long card's body or on an event lies over it, further in. Events never share the width either: overlapping
 * ones stand in narrow lanes, their titles in lines one under another. The port says what stands where in minutes; this
 * lays it out.
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

/**
 * An event's box. What it spans: its top and height at its true times, how deep it lies over others (`level`, which the
 * tasks over it are indented by) and how high it lies (`layer`). How it is drawn (Max's rule of 2026-11-19, Decision 52):
 * its lane's left edge, the lanes right of it in its cluster (its title stands past them), where its block starts under
 * its top (`blockTop`: 0, or lower when an earlier title of the cluster holds its start's line; its bar still starts at
 * its top), how tall it is drawn from its top, the room its title has under the block's top, and whether it is tiny.
 */
export interface EventBox {
	readonly top: number;
	readonly height: number;
	readonly level: number;
	readonly layer: number;
	readonly lane: number;
	readonly left: number;
	readonly lanesAfter: number;
	readonly blockTop: number;
	readonly drawnHeight: number;
	readonly labelRoom: number;
	readonly tiny: boolean;
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

/** Under half a pixel below its top a block still starts on its own line. */
const LINE_SLACK = 0.5;

/**
 * Each event's box, in the order given (Max, 2026-11-19, Decision 52). By start, the longer first on a tie, events
 * overlapping form a cluster: each one starting before the cluster's last end joins it. In a cluster the events stand in
 * lanes by start, lane i's left edge i lanes (a bar and its gap) in, the later lying higher; every title of the cluster
 * starts right of its last lane, so no title is ever covered. Titles take the label lines top-down in start order: a
 * block starts at its event's start unless an earlier title holds that line, else at the first free line under it; its
 * bar still starts at the true start (the view draws the bar's stem above the block), and the block reaches its end or
 * its title's bottom, whichever is lower. A title's room runs to the next title of the cluster, or to its block's bottom.
 * A lone event is drawn as ever, tiny when shorter than a line; in a cluster every title has its whole line.
 */
export function layEvents(events: readonly EventSpan[], scale: TimeScale): EventBox[] {
	const order = events.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
	const levels = new Map<number, number>();
	const placed: (EventSpan & { readonly level: number })[] = [];
	for (const { span, index } of order) {
		const under = placed.filter((p) => p.start <= span.start && span.start < p.end).pop();
		const level = under ? under.level + 1 : 0;
		levels.set(index, level);
		placed.push({ ...span, level });
	}
	const clusters: { readonly members: { span: EventSpan; index: number }[]; end: number }[] = [];
	for (const item of order) {
		const last = clusters[clusters.length - 1];
		if (last && item.span.start < last.end) {
			last.members.push(item);
			last.end = Math.max(last.end, item.span.end);
		} else clusters.push({ members: [item], end: item.span.end });
	}
	const boxes: EventBox[] = new Array(events.length);
	let layer = 0;
	for (const { members } of clusters) {
		const clustered = members.length > 1;
		const drawn: { index: number; top: number; height: number; blockTop: number; bottom: number }[] = [];
		let free = -Infinity;
		for (const { span, index } of members) {
			const top = scale.y(span.start) + DESIGN.itemInset;
			const height = scale.y(span.end - span.start) - DESIGN.itemGap;
			const blockAt = clustered ? Math.max(top, free) : top;
			const blockTop = blockAt - top > LINE_SLACK ? blockAt - top : 0;
			const bottom = clustered ? Math.max(top + height, top + blockTop + DESIGN.eventLabel) : top + height;
			free = top + blockTop + DESIGN.eventLabel + DESIGN.itemGap;
			drawn.push({ index, top, height, blockTop, bottom });
		}
		drawn.forEach(({ index, top, height, blockTop, bottom }, lane) => {
			const next = drawn[lane + 1];
			const labelBottom = next ? Math.min(next.top + next.blockTop, bottom) : bottom;
			boxes[index] = {
				top,
				height,
				level: levels.get(index) ?? 0,
				layer: layer++,
				lane,
				left: DESIGN.itemInset + lane * DESIGN.eventLane,
				lanesAfter: drawn.length - 1 - lane,
				blockTop,
				drawnHeight: bottom - top,
				labelRoom: labelBottom - (top + blockTop),
				tiny: !clustered && height < LAYOUT.tinyItemHeight,
			};
		});
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
