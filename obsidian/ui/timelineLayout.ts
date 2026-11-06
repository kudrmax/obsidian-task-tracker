import type { CardSize } from "./cardSize";
export { durationParts, stackCorner, timeParts } from "../../core/application/contracts";
import { eventLevels, gridAt as coreGridAt, overlayLeft as coreOverlayLeft, type StackBox, stackTasks as coreStackTasks, type TaskSpan } from "../../core/application/contracts";
import { DESIGN, LAYOUT } from "./design";

export interface Span {
	readonly start: number;
	readonly end: number;
}

/** An event in the items area: its left edge, how deep it lies over others, and its place back to front. */
export interface EventBox {
	readonly left: number;
	readonly level: number;
	readonly layer: number;
}

export type PlacedSpan = Span & { readonly level: number };

export type { StackBox, TaskSpan };

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

/** Each event's box: its left edge by how deep it lies over others (`eventLevels`). Answers in the order given. */
export function layoutEvents(spans: readonly Span[]): EventBox[] {
	return eventLevels(spans).map(({ level, layer }) => ({ left: overlayLeft(level), level, layer }));
}

function overlayLeft(level: number): number {
	return coreOverlayLeft(level, INSETS);
}

/** The grid at this zoom (`gridAt` in the core) in this design's measures. */
export function gridAt(hourPx: number): Grid {
	return coreGridAt(hourPx, { divisions: LAYOUT.gridDivisions, labelGap: LAYOUT.gridLabelGap, tickMinutes: LAYOUT.gridTickMinutes, tickGap: LAYOUT.gridTickGap });
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

/** The stack of task cards on the timeline (`stackTasks` in the core) in this design's insets. */
export function stackTasks(tasks: readonly TaskSpan[], events: readonly PlacedSpan[], hourPx: number, card: CardSize): StackBox[] {
	return coreStackTasks(tasks, events, hourPx, card, INSETS);
}

const INSETS = { itemInset: DESIGN.itemInset, itemGap: DESIGN.itemGap, overlayInset: LAYOUT.overlayInset };

/** Puts a minute `fraction` down the visible height; one too near the day's first or last hour gets empty room beyond it to stand there all the same. */
export function scrollPlace(box: ScrollBox, fraction: number): ScrollPlace {
	if (box.canvasTop + box.canvasHeight <= box.visible) return { roomTop: 0, roomBottom: 0, scrollTop: 0 };
	const above = fraction * box.visible;
	const y = box.canvasTop + box.y;
	const roomTop = Math.max(0, above - y);
	const roomBottom = Math.max(0, box.visible - above - (box.canvasTop + box.canvasHeight - y));
	return { roomTop, roomBottom, scrollTop: roomTop + y - above };
}
