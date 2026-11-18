import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

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
