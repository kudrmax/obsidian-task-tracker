import { useDrag } from "@use-gesture/react";
import { useEffect, useRef } from "react";
import { useScreenApi } from "../store";

/** How long a step into the middle or out of it glides: the design's `--tc-duration-snap` (`tests/ui/engine/divider.test.ts` holds them equal). */
export const SNAP_MS = 120;

/** The ribbon's width and the list's width as the browser draws them, read as the drag begins. */
export interface DrawnWidths {
	readonly view: number;
	readonly list: number;
}

interface Press extends DrawnWidths {
	snapped: boolean;
	/** Until when (the events' clock, ms) the list's width still glides into or out of the middle. */
	glidesUntil: number;
}

/**
 * The divider between the day's list and its calendar (F51–F53): dragged by its line or its handle, it sets the list's
 * width; brought slowly near the middle of the window it holds there with a light tap, and lets go the same way, each step
 * gliding; a fast drag passes by. Where it stands is the port's rule (`dividerAt`, the core's); the drag's speed is
 * @use-gesture's. It holds the gesture slot while it runs, so nothing else moves under it; the host keeps the share it
 * was let go at. `perPx`: how far the list's width goes for a px of the divider (All columns' three lists a third each).
 */
export function useDivider(drawn: () => DrawnWidths, onSnap: () => void, perPx = 1) {
	const api = useScreenApi();
	const press = useRef<Press | null>(null);
	useEffect(
		() => () => {
			if (!press.current) return;
			api.getState().followList(false);
			api.getState().release("divider");
		},
		[api],
	);

	return useDrag(
		({ first, last, movement: [mx], velocity: [speed], timeStamp, cancel }) => {
			const screen = api.getState();
			if (first) {
				if (!screen.claim("divider")) return cancel();
				const widths = drawn();
				press.current = { ...widths, snapped: Math.abs(widths.list - screen.dividerMiddle(widths.view)) < 0.5, glidesUntil: 0 };
			}
			const held = press.current;
			if (!held) return;
			if (!first || mx !== 0) {
				const stop = screen.dragDivider(held.list + mx * perPx, held.view, speed);
				if (stop.snapped !== held.snapped) {
					if (stop.snapped) onSnap();
					held.glidesUntil = timeStamp + SNAP_MS;
				}
				held.snapped = stop.snapped;
				screen.followList(timeStamp >= held.glidesUntil);
			}
			if (!last) return;
			press.current = null;
			screen.followList(false);
			screen.release("divider");
		},
		{ pointer: { capture: true } },
	);
}
