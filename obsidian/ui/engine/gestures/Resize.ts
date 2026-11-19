import { useDrag } from "@use-gesture/react";
import { cardMinutes, keptLength } from "../layout/calendar";
import type { TimeScale } from "../layout/timeScale";
import type { Block, Destination } from "../port";
import { useScreenApi } from "../store";

/** Which dot of a selected task: the top one moves its start, the bottom one its end. */
export type Edge = "start" | "end";

/**
 * Where a task stands once its `edge` dot is pulled `moved` pixels (the design's «Выделение и длительность»), snapped by
 * the scale's step. The top dot moves the start, the end staying; a task without a length pulled up gets one, its old
 * start becoming its end. The bottom dot moves the end, the start staying; a task riding the now line keeps its start in
 * the file and ends where it is let go. `final`: let go, a task no taller than a card keeps no length.
 */
export function resized(block: Block, edge: Edge, moved: number, scale: TimeScale, dayOffset: number, final: boolean): Destination {
	const drawnEnd = block.start + (block.length ?? cardMinutes(scale));
	const to = (at: number, end: number | null): Destination => ({ list: "day", before: null, dayOffset, at, end });
	if (edge === "start") {
		const end = block.length === null ? block.start : drawnEnd;
		const start = Math.min(scale.snap(block.start + scale.minute(moved)), block.length === null ? Number.POSITIVE_INFINITY : end - scale.step);
		if (block.length === null && start >= block.start) return to(start, null);
		const length = final ? keptLength(start, end, scale) : end - start;
		return to(start, length === null ? null : start + length);
	}
	const end = Math.max(scale.snap(drawnEnd + scale.minute(moved)), block.start + scale.step);
	const length = final ? keptLength(block.start, end, scale) : end - block.start;
	return to(block.from, length === null ? null : block.from + length);
}

/**
 * A dot of the selected task pulled (spec, «Gestures that are not drag»: resizing a block): @use-gesture's drag on the dot,
 * holding the gesture slot while it runs. The task's time follows the finger by the snap step (the port's preview), and
 * is written when the dot is let go; nothing is written when it ends where it began.
 */
export function useResize(block: Block, edge: Edge, scale: TimeScale, dayOffset: number, onWrite: () => void) {
	const api = useScreenApi();
	return useDrag(
		({ first, last, movement: [, my], cancel, event, memo }) => {
			event.stopPropagation();
			const screen = api.getState();
			if (first) {
				if (!screen.claim("resize")) return cancel();
				screen.startResize(block.id, edge);
				onWrite();
			}
			/** The task as it stood when its dot was taken: the previews redraw it as it is pulled. */
			const taken: Block = memo ?? block;
			if (api.getState().gesture !== "resize") return taken;
			const to = resized(taken, edge, my, scale, dayOffset, last);
			const same = to.at === taken.from && (to.end ?? null) === (taken.length === null ? null : taken.from + taken.length);
			if (!last) {
				api.getState().resizeTo(taken.id, to);
				return taken;
			}
			api.getState().endResize(taken.id, same ? null : to);
			if (!same) onWrite();
			return taken;
		},
		{ pointer: { capture: true }, filterTaps: true },
	);
}
