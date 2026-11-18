import { createContext, useContext, useEffect, useRef } from "react";
import type { ListId } from "../port";
import type { Entry, Measured } from "./listDrag";

/** A list as a drag reads it: the rows it draws, their boxes as the virtualizer measured them, its scroll, the room over its first row. */
export interface ListShape {
	readonly entries: readonly Entry[];
	readonly measured: readonly Measured[];
	readonly scrollTop: number;
	readonly padTop: number;
}

/** The timeline as a drag reads it: the minute at a height of the window, from its own scroll and zoom. */
export interface TimelineShape {
	minuteAt(clientY: number, top: number): number;
	readonly hourPx: number;
}

/** Where the drag layer reads what the lists and the timeline draw: each registers a reader of its own state while mounted. */
export class DragGeometry {
	private readonly lists = new Map<ListId, () => ListShape>();
	private timelineShape: (() => TimelineShape) | null = null;

	list(id: ListId): ListShape | null {
		return this.lists.get(id)?.() ?? null;
	}

	timeline(): TimelineShape | null {
		return this.timelineShape?.() ?? null;
	}

	registerList(id: ListId, read: () => ListShape): () => void {
		this.lists.set(id, read);
		return () => {
			if (this.lists.get(id) === read) this.lists.delete(id);
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

export function useListShape(id: ListId | null, read: () => ListShape): void {
	const geometry = useContext(GeometryContext);
	const latest = useRef(read);
	latest.current = read;
	useEffect(() => (geometry && id ? geometry.registerList(id, () => latest.current()) : undefined), [geometry, id]);
}

export function useTimelineShape(read: () => TimelineShape): void {
	const geometry = useContext(GeometryContext);
	const latest = useRef(read);
	latest.current = read;
	useEffect(() => (geometry ? geometry.registerTimeline(() => latest.current()) : undefined), [geometry]);
}
