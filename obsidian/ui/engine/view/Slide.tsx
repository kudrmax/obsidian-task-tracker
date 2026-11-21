import { AnimatePresence, type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Regions that slide (spec, «The owners»): a whole region gives way to the next, in from the side it comes from, as one
 * move: the day after slides in from the right, the day before from the left. Motion's `AnimatePresence` with the
 * direction as `custom`, as its docs build a slideshow.
 */
export function Slide({ id, way, className, children }: { readonly id: string; readonly way: -1 | 0 | 1; readonly className: string; readonly children: ReactNode }) {
	return (
		<AnimatePresence initial={false} custom={way}>
			<motion.div key={id} className={className} custom={way} variants={VARIANTS} initial="enter" animate="center" exit="exit" transition={SLIDE}>
				{children}
			</motion.div>
		</AnimatePresence>
	);
}

const VARIANTS = {
	enter: (way: number) => ({ x: `${way * 100}%` }),
	center: { x: "0%" },
	exit: (way: number) => ({ x: `${-way * 100}%` }),
};

const SLIDE = { type: "spring", stiffness: 1400, damping: 75 } as const;

/**
 * How a day's region is seen while the days turn: through its own box (`own`, the calendar's items), through the
 * calendar's room past the hours' column (`now`, the now line, whose pill stands over the hours), or through the lane
 * that holds it (`lane`, the day's list).
 */
export type DayWindow = "own" | "now" | "lane";

/**
 * One day's region as the days turn (docs/plugin/screen.md, «Свайп по экрану и дни»): it stands as far from its place as
 * the days stand from it (`at`, in days from today), a whole width of its own a day, so the day going out and the day
 * coming in move as one picture; what draws every day (a header, the hours) stands still around it. Motion's motion
 * value drives it frame by frame, React drawing nothing while the fingers move.
 */
export function DaySlide({ day, at, offset = null, window: seen, className, style, children }: { readonly day: number; readonly at: MotionValue<number> | null; readonly offset?: DayOffset | null; readonly window: DayWindow; readonly className: string; readonly style?: CSSProperties; readonly children: ReactNode }) {
	const still = useMotionValue(0);
	const whole = useMotionValue(1);
	const where = at ?? still;
	const off = offset?.x ?? still;
	const share = useTransform(() => (at ? (day - where.get()) * 100 : offset ? off.get() * 100 : 0));
	const x = useTransform((): number | string => (share.get() === 0 ? 0 : `${share.get()}%`));
	const clipPath = useTransform(() => {
		const s = share.get();
		if (seen === "lane" || !at || s === 0) return "none";
		const right = `${Math.max(0, s)}%`;
		const left = `${Math.max(0, -s)}%`;
		return seen === "own" ? `inset(0px ${right} 0px ${left})` : `inset(0px calc(${right} - var(--tc-items-right)) 0px calc(${left} - var(--tc-items-left)))`;
	});
	return (
		<motion.div className={className} style={{ ...style, x, clipPath, opacity: offset?.opacity ?? whole }}>
			{children}
		</motion.div>
	);
}

/** A calendar day as it switches (`dayChange.ts`): its nudge, in widths of its own room, and its strength. */
export interface DayOffset {
	readonly x: MotionValue<number>;
	readonly opacity: MotionValue<number>;
}
