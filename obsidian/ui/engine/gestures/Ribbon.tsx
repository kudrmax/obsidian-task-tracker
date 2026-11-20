import { useGesture } from "@use-gesture/react";
import { animate, type AnimationPlaybackControls, motion, type MotionValue, useMotionValue, useTransform } from "motion/react";
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { offsetOf } from "../layout/columns";
import { type Stop, useScreen, useScreenApi } from "../store";
import { swipeStep } from "./swipeStep";
import { WheelStrokes } from "./wheelStrokes";

/**
 * The ribbon's two gestures (spec, «Gestures that are not drag»): under a finger it follows, bounded to one stop either way
 * of where it began (@use-gesture's `bounds` and `rubberband`, stage 0 finding 10) and lands by the usual pager rule; on
 * the trackpad each stroke of the fingers turns it one stop at once (`WheelStrokes`, stage 0 round six). Either way the
 * store decides where a step leads and a Motion spring takes the strip there. Both read the one gesture slot.
 */

/** The strip's spring: settles in about 240 ms (stage 0, round six). */
const SPRING = { type: "spring", stiffness: 1400, damping: 75 } as const;

export interface RibbonGestures {
	/** Where the strip stands, in columns from Inbox: 0 Inbox–Soon, 1 Soon–day, 2 the day–its calendar. */
	readonly at: MotionValue<number>;
	readonly bind: ReturnType<typeof useGesture>;
}

export function useRibbon(ribbon: RefObject<HTMLElement | null>, win: Window): RibbonGestures {
	const api = useScreenApi();
	const stop = useScreen((s) => s.stop);
	const dragging = useScreen((s) => s.gesture === "drag");
	const at = useMotionValue(offsetOf(stop));
	const glide = useRef<AnimationPlaybackControls | null>(null);
	const strokes = useRef(new WheelStrokes());

	useEffect(() => {
		glide.current?.stop();
		glide.current = animate(at, offsetOf(stop), SPRING);
	}, [stop, at]);
	useEffect(() => () => glide.current?.stop(), []);

	/** Half the ribbon: one column, the way a step goes (the browser's width of the ribbon, read as a finger begins, as @use-gesture's pager example reads the window's). */
	const column = () => (ribbon.current?.clientWidth ?? 0) / 2;

	const bind = useGesture(
		{
			onDrag: ({ first, last, movement: [mx], offset: [ox], swipe: [sx], event, cancel, memo }) => {
				if ((event as PointerEvent).pointerType === "mouse") return memo;
				const screen = api.getState();
				if (first) {
					if (!screen.claim("ribbon")) {
						cancel();
						return memo;
					}
					glide.current?.stop();
				}
				const from: number = memo ?? at.get();
				if (api.getState().gesture !== "ribbon") {
					cancel();
					return from;
				}
				const width = column();
				if (width > 0) at.set(from - ox / width);
				if (last) {
					const step = swipeStep(-mx, width, -sx);
					api.getState().release("ribbon");
					if (step !== 0) api.getState().step(step);
					glide.current?.stop();
					glide.current = animate(at, offsetOf(api.getState().stop), SPRING);
				}
				return from;
			},
			onWheel: ({ event }) => {
				const step = strokes.current.feed({ dx: event.deltaX, dy: event.deltaY, t: event.timeStamp, ctrl: event.ctrlKey });
				if (step !== 0 && api.getState().gesture === null) api.getState().step(step);
			},
		},
		{
			window: win,
			enabled: !dragging,
			drag: {
				/** The pointer is followed on the view's window, not captured by the card under the finger: a long press there can hand it to the drag mid-swipe, and the ribbon's gesture still ends. */
				pointer: { capture: false },
				axis: "x",
				filterTaps: true,
				from: () => [0, 0],
				rubberband: true,
				bounds: () => {
					const width = column();
					const { stop: now, shown } = api.getState();
					/** Past Inbox nothing; past the day's calendar the days turn, the strip itself stays. */
					const back = now === "inbox" || (now === "calendar" && !shown.day.isToday) ? 0 : width;
					const on = now === "calendar" ? 0 : width;
					return { left: -on, right: back };
				},
			},
		},
	);
	return { at, bind };
}

/**
 * The strip's transform, kept while Motion measures a moving card inside it: Motion takes its ancestors' transforms off
 * for the measurement (`resetTransform`, «none») and puts them back at its next render, which a card measured as a stroke
 * begins left to the next frame, so the strip stood at Inbox for a frame (Decision 126).
 */
const standing = ({ x }: { readonly x?: unknown }, generated: string) => (x === undefined ? generated : `translateX(${typeof x === "number" ? `${x}px` : String(x)})`);

/** The strip of columns, `width` percent of the window, each column `share` percent of it, standing where the gestures put it. */
export function RibbonTrack({ at, className, width, share, children }: { readonly at: MotionValue<number>; readonly className: string; readonly width: number; readonly share: number; readonly children: ReactNode }) {
	const x = useTransform(at, (columns) => `${-columns * share}%`);
	return (
		<motion.div className={className} style={{ x, width: `${width}%` } as unknown as CSSProperties} transformTemplate={standing}>
			{children}
		</motion.div>
	);
}

export type { Stop };
