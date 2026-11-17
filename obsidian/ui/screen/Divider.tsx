import { useDrag } from "@use-gesture/react";
import type { MotionValue } from "motion/react";
import type { PointerEvent } from "react";
import { dividerAt, type ListWidths } from "../../../core/application/contracts";
import { useHost } from "./ScreenContext";

export interface DividerProps {
	/** The list's width beside the timeline, px: the divider sets it while dragged. */
	readonly width: MotionValue<number>;
	/** Its bounds and its middle for the window, the core's (`listWidths`, `layoutWidths`). */
	readonly bounds: () => ListWidths;
	/** Let go at `width`: the share is saved. */
	readonly onRelease: (width: number) => void;
}

/**
 * The divider between the lists and the timeline: dragged by its line or its handle it sets the list's width, which follows
 * the pointer and holds to the middle when brought there slowly (`dividerAt`, the core's). A swipe never starts on it.
 */
export function Divider({ width, bounds, onRelease }: DividerProps) {
	const { win } = useHost();
	const bind = useDrag(
		({ offset: [ox], velocity: [vx], last }) => {
			const stop = dividerAt(ox, bounds(), vx);
			width.set(stop.width);
			if (last) onRelease(stop.width);
		},
		{ axis: "x", from: () => [width.get(), 0], pointer: { capture: true }, window: win },
	);
	const handlers = bind();
	/** The ribbon's swipe never starts on the divider: its press stays its own. */
	const press = (e: PointerEvent<HTMLDivElement>) => {
		handlers.onPointerDown?.(e);
		e.stopPropagation();
	};
	return (
		<div className="tc-divider" {...handlers} onPointerDown={press}>
			<div className="tc-divider-line" />
			<span className="tc-divider-handle" role="separator" aria-orientation="vertical" aria-label="Resize columns" />
		</div>
	);
}
