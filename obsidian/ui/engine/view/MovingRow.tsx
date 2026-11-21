import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { createContext, type CSSProperties, type ForwardedRef, forwardRef, type ReactNode, useCallback, useContext, useRef } from "react";
import { EASE_OUT, GLIDE, LAYER_MS } from "../layers/motion";

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
export const MovingRow = forwardRef<HTMLDivElement, MovingRowProps>(function MovingRow({ id, order, context = 0, carried, fresh, placed = false, className, style, index, measure, onGlide, children }, ref) {
	const screen = useContext(RowScreen);
	const still = carried || placed;
	const present = useIsPresent();
	const setElement = useMeasured(ref, measure, present);
	return (
		<motion.div
			ref={setElement}
			data-index={present ? index : NO_INDEX}
			className={present ? className : `${className ?? ""} is-leaving`}
			style={style}
			layout={still ? false : "position"}
			layoutId={still ? undefined : `row-${screen}-${context}-${id}`}
			layoutDependency={order}
			layoutCrossfade={false}
			initial={fresh ? (placed ? FADED : COME_IN) : false}
			animate={SHOWN}
			variants={{ leave: (gone: ReadonlySet<string>) => (!gone.has(id) ? AT_ONCE : placed ? { ...FADED, transition: LEAVE } : { ...COME_IN, transition: LEAVE }) }}
			exit="leave"
			transition={GLIDE}
			onTransitionRun={onGlide && ((event) => event.target === event.currentTarget && onGlide(true))}
			onTransitionEnd={onGlide && ((event) => event.target === event.currentTarget && onGlide(false))}
			onTransitionCancel={onGlide && ((event) => event.target === event.currentTarget && onGlide(false))}
		>
			{children}
		</motion.div>
	);
});

/**
 * The screen a row belongs to (Decision 139): Motion keeps one register of layout ids for the whole window, so a note's
 * block and the main screen showing the same task would take each other's row for one (the older hidden). Each mounted
 * screen gives its rows its own name.
 */
export const RowScreen = createContext("");

/** Whether the row drawing this is leaving: its card keeps the face it had, the screen's data no longer has it. */
export const useLeaving = (): boolean => !useIsPresent();

/**
 * The row's element to the presence (its pop) and, while the row is present, to the list's virtualizer (`measure`): a row
 * leaving is no row of the list any more, so it is never measured again, and its index is none the virtualizer counts.
 */
function useMeasured(ref: ForwardedRef<HTMLDivElement>, measure: ((element: HTMLDivElement | null) => void) | undefined, present: boolean) {
	const presentNow = useRef(present);
	presentNow.current = present;
	return useCallback(
		(element: HTMLDivElement | null) => {
			if (typeof ref === "function") ref(element);
			else if (ref) ref.current = element;
			if (element === null || presentNow.current) measure?.(element);
		},
		[ref, measure],
	);
}

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
	/** The context the screen is drawn in (Decision 132), or the region apart from the lists (a menu's stack): a task's row of another context is another row. */
	readonly context?: number | string;
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
	/** Its index for the list's virtualizer, and the virtualizer's measure of it; a row leaving has neither. */
	readonly index?: number;
	readonly measure?: (element: HTMLDivElement | null) => void;
	/** A placed row's box starts or stops gliding by its CSS transition (the browser's own transition events). */
	readonly onGlide?: (gliding: boolean) => void;
	readonly children: ReactNode;
}

const COME_IN = { opacity: 0, scale: 0.96 };
const FADED = { opacity: 0 };
const SHOWN = { opacity: 1, scale: 1 };
/** A row leaves in the design's `--tc-duration-collapse` on its `--tc-ease-out`, as a layer closes (F296, F297). */
const LEAVE = { duration: LAYER_MS.close / 1000, ease: EASE_OUT } as const;
const AT_ONCE = { opacity: 0, transition: { duration: 0 } };
/** The index of a row leaving: out of every list's range, so the virtualizer ignores it. */
const NO_INDEX = -1;
