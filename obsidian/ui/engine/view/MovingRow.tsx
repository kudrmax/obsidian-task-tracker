import { LayoutGroup, motion, useIsPresent } from "motion/react";
import { type CSSProperties, forwardRef, type ReactNode } from "react";

/**
 * Rows that move (spec, «The owners»): a row glides to its new place whatever moved it, a drag, a command, Sync, a new
 * task. Motion's `layout="position"` keyed by the task's id, as stage 0 settled it («Integration findings» 2–3, «Drop
 * flicker» 3): the layout is measured only when the order *as read* changes (`order`), never on the drag's own reorder;
 * the carried row has no layout and no layout id; no crossfade; a row comes in only when its task is new.
 */
export const MovingRow = forwardRef<HTMLDivElement, MovingRowProps>(function MovingRow({ id, order, carried, fresh, className, style, index, children }, ref) {
	/** In a region sliding out (the day turned away from) the row stands still and gives its layout id to the copy coming in. */
	const still = carried || !useIsPresent();
	return (
		<motion.div
			ref={ref}
			data-index={index}
			className={className}
			style={style}
			layout={still ? false : "position"}
			layoutId={still ? undefined : `row-${id}`}
			layoutDependency={order}
			layoutCrossfade={false}
			initial={fresh ? { opacity: 0, scale: COME_IN_SCALE } : false}
			animate={{ opacity: 1, scale: 1 }}
			transition={GLIDE}
		>
			{children}
		</motion.div>
	);
});

export interface MovingRowProps {
	readonly id: string;
	/** The order of its list as read: a change measures the rows and glides them. */
	readonly order: string;
	readonly carried: boolean;
	/** Its task is new in the last read: it comes in. */
	readonly fresh: boolean;
	readonly className?: string;
	readonly style?: CSSProperties;
	/** Its index for the list's virtualizer, which measures it. */
	readonly index?: number;
	readonly children: ReactNode;
}

/**
 * The rows of one region (a list, the timeline's blocks). A row whose task left goes in the same frame, never lingering
 * where it stood while its task is drawn elsewhere (stage 0, «Drop flicker» 3): the region holds no exit, and a task moved
 * to another region glides there by its layout id, as Motion's shared layout does without `AnimatePresence`.
 */
export function MovingRows({ children }: { readonly children: ReactNode }) {
	return <LayoutGroup>{children}</LayoutGroup>;
}

/** Every row that changes place glides there the same way (stage 0's spring). */
const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
const COME_IN_SCALE = 0.96;
