import { createContext, useContext, useEffect, useRef } from "react";
import type { DropColumn } from "../../../../core/application/contracts";
import type { Entry, Measured } from "./listDrag";

/** A list as a drag reads it: the rows it draws, their boxes as the virtualizer measured them, its scroll, the room over its first row. */
export interface ListShape {
	readonly entries: readonly Entry[];
	readonly measured: readonly Measured[];
	readonly scrollTop: number;
	readonly padTop: number;
}

/** The timeline as a drag reads it: the minute at a height of the window, read from its own scroll and zoom. */
export interface TimelineShape {
	minuteAt(clientY: number, top: number): number;
	readonly hourPx: number;
}

/**
 * Where the drag layer reads what the lists and the timeline draw: each registers a reader of its own state while mounted.
 * Nothing is measured here; the readers give what their libraries already know (the virtualizer's boxes, the scroll).
 */
export class DragGeometry {
	private readonly lists = new Map<DropColumn, () => ListShape>();
	private timelineShape: (() => TimelineShape) | null = null;

	list(column: DropColumn): ListShape | null {
		return this.lists.get(column)?.() ?? null;
	}

	timeline(): TimelineShape | null {
		return this.timelineShape?.() ?? null;
	}

	registerList(column: DropColumn, read: () => ListShape): () => void {
		this.lists.set(column, read);
		return () => {
			if (this.lists.get(column) === read) this.lists.delete(column);
		};
	}

	registerTimeline(read: () => TimelineShape): () => void {
		this.timelineShape = read;
		return () => {
			if (this.timelineShape === read) this.timelineShape = null;
		};
	}
}

export const GeometryContext = createContext<DragGeometry | null>(null);

/** Registers `read` (kept fresh each render) for the list `column` while the component is mounted; nothing outside a drag layer. */
export function useListShape(column: DropColumn | null, read: () => ListShape): void {
	const geometry = useContext(GeometryContext);
	const latest = useRef(read);
	latest.current = read;
	useEffect(() => (geometry && column ? geometry.registerList(column, () => latest.current()) : undefined), [geometry, column]);
}

export function useTimelineShape(read: () => TimelineShape): void {
	const geometry = useContext(GeometryContext);
	const latest = useRef(read);
	latest.current = read;
	useEffect(() => (geometry ? geometry.registerTimeline(() => latest.current()) : undefined), [geometry]);
}
