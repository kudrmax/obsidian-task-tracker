import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { type CSSProperties, forwardRef, type ReactNode } from "react";
import { LAYER_MS } from "../layers/motion";

/**
 * Rows that move (spec, «The owners»; principle 3): a row glides to its new place whatever moved it, a drag, a command,
 * Sync, a new task, Undo. Motion's `layout="position"` keyed by the task's id, as stage 0 settled it («Integration
 * findings» 2–3, «Drop flicker» 3): the layout is measured only when the order *as read* changes (`order`), never on the
 * drag's own reorder; the carried row has no layout and no layout id; no crossfade. A task new on the screen comes in
 * (`fresh`), the rows under it gliding aside; a task moved to another region glides there by its layout id (`context`
 * keeps a new context's rows apart from the old one's, Decision 132). A row leaves inside `MovingRows`. No
 * `LayoutGroup`: a list's rows already measure together (one `order`), and a group would make a row going away at a drop
 * measure every other row in the middle of the drop, without the place dnd-kit has them at, so they would glide back from
 * where they stood before the drag.
 */
export const MovingRow = forwardRef<HTMLDivElement, MovingRowProps>(function MovingRow({ id, order, context = 0, carried, fresh, placed = false, className, style, index, children }, ref) {
	const still = carried || placed;
	const present = useIsPresent();
	return (
		<motion.div
			ref={ref}
			data-index={present ? index : undefined}
			className={present ? className : `${className ?? ""} is-leaving`}
			style={style}
			layout={still ? false : "position"}
			layoutId={still ? undefined : `row-${context}-${id}`}
			layoutDependency={order}
			layoutCrossfade={false}
			initial={fresh ? (placed ? FADED : COME_IN) : false}
			animate={SHOWN}
			variants={{ leave: (gone: ReadonlySet<string>) => (!gone.has(id) ? AT_ONCE : placed ? { ...FADED, transition: LEAVE } : { ...COME_IN, transition: LEAVE }) }}
			exit="leave"
			transition={GLIDE}
		>
			{children}
		</motion.div>
	);
});

/**
 * The rows of a region as they come and go (Motion's `AnimatePresence`, `popLayout`, Decision 132): a row whose task is
 * `gone` from the screen (done, deleted, sent where the screen doesn't show it) fades where it stands, out of the flow at
 * once, so the rows under it glide up into its place by their layout; a row that only went out of sight (scrolled past,
 * its task moved to another region, which glides there) goes at once. The rows drawn as the region mounts come in
 * without motion: a new context draws in place.
 */
export function MovingRows({ gone, children }: { readonly gone: ReadonlySet<string>; readonly children: ReactNode }) {
	return (
		<AnimatePresence mode="popLayout" initial={false} custom={gone}>
			{children}
		</AnimatePresence>
	);
}

export interface MovingRowProps {
	readonly id: string;
	/** The order of its list as read: a change measures the rows and glides them. */
	readonly order: string;
	/** The context the screen is drawn in (Decision 132): a task's row of another context is another row. */
	readonly context?: number;
	readonly carried: boolean;
	/**
	 * Placed by its own box in CSS (a calendar's block: its top, height and lane), so it glides by that box's CSS transition,
	 * size and all, and Motion measures nothing; it comes and goes by fading where it stands.
	 */
	readonly placed?: boolean;
	/** Its task is new in the last read: it comes in. */
	readonly fresh: boolean;
	readonly className?: string;
	readonly style?: CSSProperties;
	/** Its index for the list's virtualizer, which measures it; a row leaving has none (it is no row of the list any more). */
	readonly index?: number;
	readonly children: ReactNode;
}

/** Every row that changes place glides there the same way (stage 0's spring). */
const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
const COME_IN = { opacity: 0, scale: 0.96 };
const FADED = { opacity: 0 };
const SHOWN = { opacity: 1, scale: 1 };
/** A row leaves in the design's `--tc-duration-collapse` on its `--tc-ease-out`, as a layer closes (F296, F297). */
const LEAVE = { duration: LAYER_MS.close / 1000, ease: [0.2, 0.8, 0.2, 1] } as const;
const AT_ONCE = { opacity: 0, transition: { duration: 0 } };
