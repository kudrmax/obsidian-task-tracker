import { AnimatePresence, type MotionValue, motion, useMotionValue, useTransform, type Variants } from "motion/react";
import { createContext, type CSSProperties, Fragment, type ReactNode, useContext } from "react";
import { LANDING } from "../gestures/followPager";

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
export function DaySlide({ day, at, window: seen, className, style, change = false, children }: { readonly day: number; readonly at: MotionValue<number> | null; readonly window: DayWindow; readonly className: string; readonly style?: CSSProperties; readonly change?: boolean; readonly children: ReactNode }) {
	const still = useMotionValue(0);
	const where = at ?? still;
	const share = useTransform(() => (at ? (day - where.get()) * 100 : 0));
	const x = useTransform((): number | string => (share.get() === 0 ? 0 : `${share.get()}%`));
	const clipPath = useTransform(() => {
		const s = share.get();
		if (seen === "lane" || s === 0) return "none";
		const right = `${Math.max(0, s)}%`;
		const left = `${Math.max(0, -s)}%`;
		return seen === "own" ? `inset(0px ${right} 0px ${left})` : `inset(0px calc(${right} - var(--tc-items-right)) 0px calc(${left} - var(--tc-items-left)))`;
	});
	const way = useContext(ChangeWay);
	if (change)
		return (
			<motion.div className={className} style={style} custom={way} variants={DAY_CHANGE} initial="enter" animate="center" exit="exit">
				{children}
			</motion.div>
		);
	return (
		<motion.div className={className} style={{ ...style, x, clipPath }}>
			{children}
		</motion.div>
	);
}

/** How far the calendar's day moves as it changes, in percent of its own width: a nudge the list's way, never a page. */
const CHANGE_SHIFT = 6;
/** The day going out fades in this long, s: the new day comes in only then, so the calendar never shows two days. */
const CHANGE_OUT_S = 0.06;
/** The new day comes in on the landing's spring and shows whole this long after it starts, s. */
const CHANGE_IN_S = 0.1;

const DAY_CHANGE: Variants = {
	enter: (way: number) => ({ x: `${way * CHANGE_SHIFT}%`, opacity: 0 }),
	center: { x: "0%", opacity: 1, transition: { x: { type: "spring", ...LANDING }, opacity: { duration: CHANGE_IN_S, ease: "easeOut" as const } } },
	exit: (way: number) => ({ x: `${-way * CHANGE_SHIFT}%`, opacity: 0, transition: { duration: CHANGE_OUT_S, ease: "easeIn" as const } }),
};

/**
 * The calendar's day changing as the days turn (Max, 2026-11-21; Decision 127): the shown day nudges out the way the list
 * went and fades, then the new day comes in from the other side on the landing's spring, whole in a tenth of a second;
 * the hours stand. Its regions are `DaySlide`s with `change`, each going out and coming in together.
 */
export function DayChange({ day, way, children }: { readonly day: number; readonly way: number; readonly children: ReactNode }) {
	return (
		<ChangeWay.Provider value={way}>
			<AnimatePresence initial={false} custom={way} mode="wait">
				<Fragment key={day}>{children}</Fragment>
			</AnimatePresence>
		</ChangeWay.Provider>
	);
}

/** The way the calendar's day last changed, for the day coming in: AnimatePresence hands its `custom` only to the day going out. */
const ChangeWay = createContext(0);
