import { type MotionValue, motion, useMotionValue, useTransform } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { DayLine } from "../layout/columns";

/**
 * How a day's region is seen while the days turn: through its own box (`own`, the calendar's items), through the
 * calendar's room past the hours' column (`now`, the now line, whose pill stands over the hours), or through the lane
 * that holds it (`lane`, the day's list).
 */
export type DayWindow = "own" | "now" | "lane";

/**
 * Regions that slide (spec, «The owners»): one day's region as the days turn. It stands as far from its place as the
 * days stand from it (`at`, in pages; `line` says each day's page), a whole width of its own a day, so the day going out and the day coming
 * in move as one picture (the day's list), or nudged and faded as the calendar switches day (`offset`, `dayChange.ts`);
 * what draws every day (a header, the hours) stands still around it. Motion's values drive it frame by frame, React
 * drawing nothing while the fingers move.
 */
export function DaySlide({ day, at, line = null, offset = null, window: seen, className, style, children }: { readonly day: number; readonly at: MotionValue<number> | null; readonly line?: MotionValue<DayLine> | null; readonly offset?: DayOffset | null; readonly window: DayWindow; readonly className: string; readonly style?: CSSProperties; readonly children: ReactNode }) {
	const still = useMotionValue(0);
	const whole = useMotionValue(1);
	const where = at ?? still;
	const off = offset?.x ?? still;
	const share = useTransform(() => (at ? ((line?.get().pos(day) ?? day) - where.get()) * 100 : offset ? off.get() * 100 : 0));
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
