import { DESIGN, LAYOUT } from "./design";

export interface Span {
	readonly start: number;
	readonly end: number;
}

export interface ColumnBox {
	readonly col: number;
	readonly cols: number;
}

export interface ItemBox {
	readonly top: number;
	readonly height: number;
	readonly tiny: boolean;
}

const MINUTES_PER_HOUR = 60;

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

/** The minutes between the grid's lines at this zoom: the finest division whose labels still have room, else the hour. */
export function gridDivision(hourPx: number): number {
	return LAYOUT.gridDivisions.find((minutes) => minutesToPx(minutes, hourPx) >= LAYOUT.gridLabelGap) ?? MINUTES_PER_HOUR;
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
