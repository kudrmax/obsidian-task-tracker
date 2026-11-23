import { motion, type MotionValue, useMotionValueEvent, useTransform } from "motion/react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { PROPERTY } from "../../shared/design";

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

/** A column of the strip whose width goes with the ribbon's place (`widthAt`, the layout's): drawn by Motion each frame, React drawing nothing while it moves. */
export function StripColumn({ at, widthAt, className, style, children }: { readonly at: MotionValue<number>; readonly widthAt: (at: number) => string; readonly className: string; readonly style: CSSProperties; readonly children: ReactNode }) {
	const width = useTransform(at, widthAt);
	return (
		<motion.section className={className} style={{ ...style, width } as unknown as CSSProperties}>
			{children}
		</motion.section>
	);
}

/** A divider of the strip that stands off its place by the ribbon's place (`leftAt`, the layout's): drawn by Motion each frame. */
export function StripRule({ at, leftAt, children }: { readonly at: MotionValue<number>; readonly leftAt: (at: number) => string; readonly children: ReactNode }) {
	const left = useTransform(at, leftAt);
	return (
		<motion.div className="tc-rule" style={{ left } as unknown as CSSProperties}>
			{children}
		</motion.div>
	);
}

/**
 * The wheel at the screen's foot, turning with the ribbon (the design's «Колёсико»: «лента колёсика крутится синхронно»):
 * its place, `--tc-wheel-at` (0 Inbox–Soon to `last` the calendar; the days past it stand at the calendar), drawn by Motion
 * from the ribbon's place each frame. While a finger holds it, it stands where the finger has it (`held`); let go, it
 * rolls to the place it landed on (`settling`, the stylesheet's glide) and follows the ribbon again once the ribbon
 * stands there too (`onSettled`).
 */
export function StripWheel({ at, last, held, settling, onSettled, className, children, ...rest }: { readonly at: MotionValue<number>; readonly last: number; readonly held: number | null; readonly settling: number | null; readonly onSettled: () => void; readonly className: string; readonly children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, "className" | "children">) {
	const turned = useTransform(at, (columns) => Math.min(last, Math.max(0, columns)));
	useMotionValueEvent(turned, "change", (now) => {
		if (settling !== null && Math.abs(now - settling) < ARRIVED) onSettled();
	});
	const shown = held ?? settling;
	return (
		<motion.div className={`${className}${settling !== null ? " is-settling" : ""}`} style={{ [PROPERTY.wheelAt]: shown ?? turned } as unknown as CSSProperties} {...(rest as object)}>
			{children}
		</motion.div>
	);
}

/** The ribbon is at the wheel's place once this near it. */
const ARRIVED = 0.01;
