import { useGesture } from "@use-gesture/react";
import { motion, type MotionValue, useMotionValue, useSpring, useTransform } from "motion/react";
import { type CSSProperties, memo, useEffect, useMemo, useRef } from "react";
import { type FunnelPlace, LIST_WIDTHS, swipeLanding } from "../../../core/application/contracts";
import { DESIGN, PROPERTY } from "../design";
import { centeredListWidth, listShareOf, listWidthMax, shownListWidth } from "../listWidth";
import { ColumnTitle, DayList, DayNav, InboxBacklog } from "./Columns";
import { Divider } from "./Divider";
import { useHost, useScreen } from "./ScreenContext";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import { WheelStrokes } from "./wheelStrokes";

/** The ribbon's landing: short and decisive, critically damped (stage 0, round six: about 240 ms). */
const RIBBON_SPRING = { stiffness: 1400, damping: 75, mass: 1 };
/** A sideways drag of the content moves the ribbon only past this, so a tap or a vertical scroll never does. */
const SWIPE_THRESHOLD = 10;

const PLACES: readonly FunnelPlace[] = ["inbox", "soon", "calendar"];

/** The ribbon's measures in a window `width` wide: a half column, the step between two places, each place's offset. */
export function ribbonMeasures(width: number) {
	const half = (width - DESIGN.dividerWidth) / 2;
	const step = half + DESIGN.dividerWidth;
	return { half, step, offsetOf: (place: FunnelPlace) => -PLACES.indexOf(place) * step };
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * Two columns (`ViewLayout.swipe: "pages"`): a window two columns wide on a strip of four, Inbox over Backlog, Soon, the
 * day's list and the timeline. At Inbox–Soon and Soon–Now the columns split the window in half; at Now–calendar the
 * divider sets the day list against the timeline, the list's width following the ribbon between the two.
 *
 * On the Mac trackpad the ribbon is a pager (Max's call, stage 0 round six): each stroke of the fingers turns it one place
 * at once on a short spring, a stroke during the spring adds one more, the momentum tail moves nothing. On the phone it
 * follows the finger and lands where the core's `swipeLanding` says; a flick during a landing goes on from where it stands.
 * At Now–calendar a step on turns the day (`DayService.stepFunnel`).
 */
export const RibbonStage = memo(function RibbonStage({ position }: { /** Where the ribbon stands, 0 at Inbox–Soon to 2 at Now–calendar: the wheel turns with it. */ readonly position: MotionValue<number> }) {
	const { store, width, win } = useHost();
	const place = useScreen((s) => s.place);
	const share = useScreen((s) => s.settings.listShare);
	const { half, step, offsetOf } = ribbonMeasures(width);
	const x = useSpring(offsetOf(place), RIBBON_SPRING);
	const listWidth = useMotionValue(shownListWidth(share, width));
	const widthRef = useRef(width);

	useEffect(() => {
		if (widthRef.current !== width) {
			widthRef.current = width;
			x.jump(offsetOf(place));
		} else x.set(offsetOf(place));
	}, [place, width]);
	useEffect(() => listWidth.set(shownListWidth(share, width)), [share, width, listWidth]);
	useEffect(() => {
		position.set(-x.get() / step);
		return x.on("change", (at) => position.set(-at / step));
	}, [x, position, step]);

	/** The window's measures as motion values: the transforms below read them when the window changes, not as first drawn. */
	const halfNow = useMotionValue(half);
	const stepNow = useMotionValue(step);
	useEffect(() => {
		halfNow.set(half);
		stepNow.set(step);
	}, [half, step, halfNow, stepNow]);
	/** 0 at Soon–Now, 1 at Now–calendar: the day list's width and the columns' sides follow it. */
	const toCalendar = useTransform(() => clamp01((-x.get() - stepNow.get()) / stepNow.get()));
	const toSoon = useTransform(() => clamp01(-x.get() / stepNow.get()));
	const dayWidth = useTransform(() => halfNow.get() + (listWidth.get() - halfNow.get()) * toCalendar.get());
	const timelineWidth = useTransform(() => 2 * halfNow.get() - listWidth.get());
	const soonSide = useTransform(toSoon, (at) => 1 - at);
	const daySide = useTransform(toCalendar, (at) => 1 - at);

	const strokes = useMemo(() => new WheelStrokes(), []);
	const fingerSpeed = useRef(0);
	const dragFrom = useRef(0);
	const bind = useGesture(
		{
			onDrag: ({ offset: [ox], velocity: [vx], direction: [dx], xy: [px], initial: [ix], first, last, cancel, event, tap }) => {
				if ((event as PointerEvent).pointerType === "mouse" || tap) return cancel();
				if (first) dragFrom.current = x.get();
				if (!last) {
					fingerSpeed.current = -vx * dx;
					x.jump(ox);
					return;
				}
				/** Where the finger took the screen, past the bounds too: the bounds only hold what is drawn. */
				const moved = offsetOf(store.getState().place) - (dragFrom.current + px - ix);
				const shift = swipeLanding(moved, step, fingerSpeed.current);
				if (shift !== 0) store.getState().step(shift);
				x.set(offsetOf(store.getState().place));
			},
			onWheel: ({ event }) => {
				const e = event as WheelEvent;
				if (e.ctrlKey || e.metaKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
				e.preventDefault();
				const shift = strokes.feed({ dx: e.deltaX, dy: e.deltaY, t: e.timeStamp });
				if (shift !== 0) store.getState().step(shift);
			},
		},
		{
			drag: {
				axis: "x",
				threshold: SWIPE_THRESHOLD,
				filterTaps: true,
				from: () => [x.get(), 0],
				bounds: () => {
					const at = PLACES.indexOf(store.getState().place);
					return { left: offsetOf(PLACES[Math.min(PLACES.length - 1, at + 1)]), right: offsetOf(PLACES[Math.max(0, at - 1)]) };
				},
				rubberband: true,
			},
			wheel: { eventOptions: { passive: false } },
			window: win,
		},
	);

	const side = (value: MotionValue<number>) => ({ [PROPERTY.side]: value }) as unknown as CSSProperties;
	return (
		<div className="tc-ribbon" {...bind()}>
			<motion.div className="tc-ribbon-track" style={{ x }}>
				<div className="tc-stage-col is-inbox" style={{ width: half, [PROPERTY.side]: 0 } as CSSProperties}>
					<div className="tc-stage-head">
						<ColumnTitle list="inbox" />
					</div>
					<div className="tc-stage-body">
						<InboxBacklog scrolls />
					</div>
				</div>
				<div className="tc-stage-rule">
					<div className="tc-divider-line" />
				</div>
				<motion.div className="tc-stage-col is-soon" style={{ width: half, ...side(soonSide) }}>
					<div className="tc-stage-head">
						<ColumnTitle list="soon" />
					</div>
					<div className="tc-stage-body">
						<TaskList column="soon" day={null} scrolls />
					</div>
				</motion.div>
				<div className="tc-stage-rule">
					<div className="tc-divider-line" />
				</div>
				<motion.div className="tc-stage-col is-day" style={{ width: dayWidth, ...side(daySide) }}>
					<div className="tc-stage-head">
						<DayNav />
					</div>
					<div className="tc-stage-body">
						<DayList scrolls />
					</div>
				</motion.div>
				<Divider
					width={listWidth}
					bounds={() => ({ ...ribbonBounds(width), width: listWidth.get() })}
					onRelease={(at) => store.getState().saveShare(listShareOf(at, width))}
				/>
				<motion.div className="tc-stage-col is-timeline" style={{ width: timelineWidth }}>
					<div className="tc-stage-head" />
					<div className="tc-stage-body">
						<Timeline />
					</div>
				</motion.div>
			</motion.div>
		</div>
	);
});

/** The list's bounds beside the timeline in this window (`listWidths`): the design's on a phone, wider in a wider window. */
function ribbonBounds(width: number) {
	return { min: LIST_WIDTHS.min, max: listWidthMax(width), center: centeredListWidth(width) };
}
