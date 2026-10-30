import { DESIGN, LAYOUT } from "./design";

export interface Span {
	readonly start: number;
	readonly end: number;
}

export interface ColumnBox {
	readonly col: number;
	readonly cols: number;
}

export interface TaskSpan {
	readonly start: number;
	readonly end: number | null;
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

export interface ItemBox {
	readonly top: number;
	readonly height: number;
	readonly tiny: boolean;
}

const MINUTES_PER_HOUR = 60;
/** Under half a pixel off its time a card still stands on it. */
const STACK_SLACK = 0.5;

/** Overlapping events share the width in equal columns, each cluster on its own; answers in the order given. */
export function layoutColumns(spans: readonly Span[]): ColumnBox[] {
	const order = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || b.span.end - a.span.end);
	const boxes: ColumnBox[] = new Array(spans.length);
	let cluster: { index: number; col: number }[] = [];
	let columnEnds: number[] = [];
	let clusterEnd = -Infinity;
	const close = () => {
		for (const member of cluster) boxes[member.index] = { col: member.col, cols: columnEnds.length };
		cluster = [];
		columnEnds = [];
	};
	for (const { span, index } of order) {
		if (span.start >= clusterEnd) close();
		let col = columnEnds.findIndex((end) => end <= span.start);
		if (col < 0) col = columnEnds.length;
		columnEnds[col] = span.end;
		cluster.push({ index, col });
		clusterEnd = Math.max(clusterEnd, span.end);
	}
	close();
	return boxes;
}

export function minutesToPx(minutes: number, hourPx: number): number {
	return (minutes / MINUTES_PER_HOUR) * hourPx;
}

export function pxToMinutes(y: number, hourPx: number): number {
	return (y / hourPx) * MINUTES_PER_HOUR;
}

/** Where a block of the timeline sits: one pixel under its start, two pixels short of its length. */
export function itemBox(startMin: number, endMin: number, hourPx: number): ItemBox {
	const height = minutesToPx(endMin - startMin, hourPx) - DESIGN.itemGap;
	return { top: minutesToPx(startMin, hourPx) + DESIGN.itemInset, height, tiny: height < LAYOUT.tinyItemHeight };
}

/**
 * Tasks never share the width: by start, ties in the order given, each card sits on its own time or 4 px under the head
 * (the top 40 px) of the one before. A pushed long card still ends at its end. A card that starts on a long card's body or
 * on an event lies over it, 18 px further in. Answers in the order given.
 */
export function stackTasks(tasks: readonly TaskSpan[], events: readonly Span[], hourPx: number): StackBox[] {
	const head = DESIGN.cardHeight;
	const y = (minutes: number) => minutesToPx(minutes, hourPx);
	const overEvent = (top: number, bottom: number) => events.some((e) => top < y(e.end) && bottom > y(e.start));
	const order = tasks.map((task, index) => ({ task, index })).sort((a, b) => a.task.start - b.task.start || a.index - b.index);
	const boxes: { -readonly [K in keyof StackBox]: StackBox[K] }[] = new Array(tasks.length);
	const bodies: { top: number; bottom: number; left: number }[] = [];
	let previous: (typeof boxes)[number] | null = null;
	let headBottom = -Infinity;
	for (const { task, index } of order) {
		const natural = y(task.start) + DESIGN.itemInset;
		const top = Math.max(natural, headBottom + LAYOUT.stackGap);
		const height = task.end === null ? head : Math.max(head, y(task.end) - DESIGN.itemInset - top);
		headBottom = top + head;
		const parent = bodies.filter((b) => top < b.bottom && top + head > b.top).pop();
		const overlay = !!parent || overEvent(top, top + height);
		const left = parent ? parent.left + LAYOUT.overlayInset : overlay ? LAYOUT.overlayInset : DESIGN.itemInset;
		if (height > head) bodies.push({ top: top + head, bottom: top + height, left });
		const stacked = top - natural > STACK_SLACK;
		if (stacked && previous) previous.stacked = true;
		const hiddenDuration = task.end !== null && y(task.end - task.start) - DESIGN.itemGap < head;
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
