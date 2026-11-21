import { motion, type MotionValue, useTransform } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

/**
 * The strip of columns, `width` percent of the window, each column `share` percent of it, standing where the ribbon puts it.
 * Its place is its own `transform`, not Motion's `x`: Motion, measuring a moving card inside the strip, takes the `x` of
 * the card's ancestors off (`resetTransform`, «none») and puts it back at its next render, which a card measured as a
 * stroke begins left to the next frame, so the strip stood at Inbox for a frame (Decision 126).
 */
export function RibbonTrack({ at, className, width, share, children }: { readonly at: MotionValue<number>; readonly className: string; readonly width: number; readonly share: number; readonly children: ReactNode }) {
	const transform = useTransform(at, (columns) => `translateX(${-columns * share}%)`);
	return (
		<motion.div className={className} style={{ transform, width: `${width}%` } as unknown as CSSProperties}>
			{children}
		</motion.div>
	);
}
