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

/** The minutes between the grid's labelled lines and between all its lines. */
export interface Grid {
	readonly labels: number;
	readonly lines: number;
}

export interface ItemBox {
	readonly top: number;
	readonly height: number;
	readonly tiny: boolean;
}

/** The timeline's scroll box as measured with no room beyond the day. */
export interface ScrollBox {
	/** The minute's height in the canvas. */
	readonly y: number;
	readonly canvasTop: number;
	readonly canvasHeight: number;
	/** The height the fade at the bottom leaves visible. */
	readonly visible: number;
}

/** Empty room over the day's first hour and under its last, and the scroll that puts the minute where it was asked. */
export interface ScrollPlace {
	readonly roomTop: number;
	readonly roomBottom: number;
	readonly scrollTop: number;
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

/** The grid at this zoom: labels at the finest division that still has room for them, else the hour; lines as often as they stay apart. */
export function gridAt(hourPx: number): Grid {
	const labels = LAYOUT.gridDivisions.find((minutes) => minutesToPx(minutes, hourPx) >= LAYOUT.gridLabelGap) ?? MINUTES_PER_HOUR;
	const ticks = minutesToPx(LAYOUT.gridTickMinutes, hourPx) >= LAYOUT.gridTickGap;
	return { labels, lines: ticks ? LAYOUT.gridTickMinutes : labels };
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

/** A task left open past its start rides the now line, its duration kept; the file keeps its time. */
export function followNow(span: TaskSpan, now: number): TaskSpan {
	if (span.start >= now) return span;
	return { start: now, end: span.end === null ? null : now + span.end - span.start };
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
 * Where a stretch lets go: no taller than a card at this zoom, the task loses its duration and stands at its start; a task
 * without one (`from.end` null) whose start dot was pulled keeps its start, the pull having come to nothing.
 */
export function stretchedSpan(from: TaskSpan, span: Span, edge: "start" | "end", hourPx: number): TaskSpan {
	if (minutesToPx(span.end - span.start, hourPx) - DESIGN.itemGap > DESIGN.cardHeight) return { start: span.start, end: span.end };
	const unmoved = edge === "start" && from.end === null;
	return { start: unmoved ? from.start : span.start, end: null };
}

/** Puts a minute `fraction` down the visible height; one too near the day's first or last hour gets empty room beyond it to stand there all the same. */
export function scrollPlace(box: ScrollBox, fraction: number): ScrollPlace {
	const above = fraction * box.visible;
	const y = box.canvasTop + box.y;
	const roomTop = Math.max(0, above - y);
	const roomBottom = Math.max(0, box.visible - above - (box.canvasTop + box.canvasHeight - y));
	return { roomTop, roomBottom, scrollTop: roomTop + y - above };
}
