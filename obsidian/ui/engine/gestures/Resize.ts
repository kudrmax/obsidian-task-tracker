import { useDrag } from "@use-gesture/react";
import { useEffect, useRef } from "react";
import { DESIGN } from "../../design";
import type { TimeScale } from "../layout/timeScale";
import type { Block, Edge } from "../port";
import { useScreenApi } from "../store";

export type { Edge };

/** The minute a dot stands at as it is taken: the top one at the start, the bottom one at the end (a task without a length: its start). */
export const edgeMinute = (block: Block, edge: Edge): number => (edge === "end" ? block.start + (block.length ?? 0) : block.start);

/** The longest a task may be stretched and still keep no length: a card and its gap at this zoom (the plugin's `DragController`). */
export const leastLength = (scale: TimeScale): number => scale.minute(DESIGN.cardHeight + DESIGN.itemGap);

/** Whether a pull ended without being let go: the browser took the pointer (a cancel, the capture lost). */
const cancelled = (event: Event): boolean => event.type === "pointercancel" || event.type === "lostpointercapture";

/**
 * A dot of the selected task pulled (spec, «Gestures that are not drag»: resizing a block): @use-gesture's drag on the dot,
 * holding the gesture slot while it runs. The gesture only turns the hand into an edge and a minute (the minute the dot
 * stood at, moved by the pull, by the snap step); the port says how the task stretches and what letting go writes. A
 * pull the browser cancels writes nothing and puts the task back, and so does a dot unmounted mid-pull.
 */
export function useResize(block: Block, edge: Edge, scale: TimeScale, onWrite: () => void) {
	const api = useScreenApi();
	const holding = useRef(false);
	const id = block.id;
	useEffect(
		() => () => {
			if (!holding.current) return;
			holding.current = false;
			api.getState().endResize(id, edge, null, 0);
		},
		[api, id, edge],
	);
	return useDrag(
		({ first, last, movement: [, my], cancel, event, memo }) => {
			event.stopPropagation();
			if (first) {
				if (!api.getState().claim("resize")) {
					cancel();
					return memo;
				}
				holding.current = true;
				api.getState().startResize(id, edge);
				onWrite();
			}
			/** Where the dot stood as it was taken: the previews redraw the task as it is pulled. */
			const from: number = memo ?? edgeMinute(block, edge);
			if (!holding.current) return from;
			const minute = scale.snap(from + scale.minute(my));
			if (!last) {
				api.getState().resizeTo(id, edge, minute);
				return from;
			}
			holding.current = false;
			if (api.getState().endResize(id, edge, cancelled(event) ? null : minute, leastLength(scale))) onWrite();
			return from;
		},
		{ pointer: { capture: true }, filterTaps: true },
	);
}
