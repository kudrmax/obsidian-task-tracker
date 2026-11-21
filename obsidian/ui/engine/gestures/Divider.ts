import { useDrag } from "@use-gesture/react";
import { useEffect, useRef } from "react";
import { useScreenApi } from "../store";

/** How long a step into the middle or out of it glides: the design's `--tc-duration-snap` (`tests/ui/engine/divider.test.ts` holds them equal). */
export const SNAP_MS = 120;

interface Press {
	readonly width: number;
	readonly view: number;
	snapped: boolean;
	/** Until when (the events' clock, ms) the list's width still glides into or out of the middle. */
	glidesUntil: number;
}

/**
 * The divider between the day's list and its calendar (F51–F53): dragged by its line or its handle, it sets the list's
 * width; brought slowly near the middle of the window it holds there with a light tap, and lets go the same way, each step
 * gliding; a fast drag passes by. Where it stands is the port's rule (`dividerAt`, the core's); the drag's speed is
 * @use-gesture's. It holds the gesture slot while it runs, so nothing else moves under it; the host keeps the share it
 * was let go at. `view` reads the ribbon's width as the drag begins, as the ribbon's own gesture does.
 */
export function useDivider(view: () => number, onSnap: () => void) {
	const api = useScreenApi();
	const press = useRef<Press | null>(null);
	useEffect(
		() => () => {
			if (press.current) api.getState().release("divider");
		},
		[api],
	);

	return useDrag(
		({ first, last, movement: [mx], velocity: [speed], timeStamp, cancel }) => {
			const screen = api.getState();
			if (first) {
				if (!screen.claim("divider")) return cancel();
				const width = view();
				const list = screen.listWidths(width);
				screen.glideList(false);
				press.current = { width: list.width, view: width, snapped: list.width === list.center, glidesUntil: 0 };
			}
			const held = press.current;
			if (!held) return;
			if (!first || mx !== 0) {
				const stop = screen.dragDivider(held.width + mx, held.view, speed);
				if (stop.snapped !== held.snapped) {
					if (stop.snapped) onSnap();
					held.glidesUntil = timeStamp + SNAP_MS;
				}
				held.snapped = stop.snapped;
				screen.glideList(timeStamp < held.glidesUntil);
			}
			if (!last) return;
			press.current = null;
			screen.release("divider");
		},
		{ pointer: { capture: true } },
	);
}
