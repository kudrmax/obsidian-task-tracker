import { type CSSProperties, memo, type PointerEvent, type ReactNode, type RefObject, useContext, useRef } from "react";
import { useDivider } from "../gestures/Divider";
import { DayTurnContext, type FollowGestures, useFollowRibbon } from "../gestures/FollowRibbon";
import { RibbonTrack, StripColumn, StripRule } from "../gestures/RibbonTrack";
import type { ListId } from "../port";
import { DayContext, type Stop, STOP_LISTS, useData, useScreen } from "../store";
import { useHost } from "../view/host";
import { PlusButton } from "../view/QuickAdd";
import { DaySlide } from "../view/Slide";
import { TaskList } from "../view/TaskList";
import { TaskMenu } from "../view/TaskMenu";
import { Timeline } from "../view/Timeline";
import { COLUMN_SHARE, dayColumnWidth, ruleShift, STRIP_WIDTH } from "./columns";

/** Where the ribbon stands, in places: what moves its columns and dividers each frame. */
type RibbonAt = FollowGestures["at"];

/** Where a screen is mounted: Obsidian's leaf (the main screen, a pop-out) or a note's block. */
export type Place = "leaf" | "note";

/**
 * Where things stand (spec, «The owners»): the place's columns. The only module that reads the place. A leaf shows the
 * ribbon of four columns, two at a time; a note's block shows one list. Sizes are CSS: each column is its share of the
 * strip, the strip slides by its own percent. At Inbox and at Soon the two columns split the window in half (CLAUDE.md,
 * «Behaviours Max had to ask for twice»); at the day's calendar the divider sets the list against the calendar (F51–F53).
 */
/** The lists a screen mounted at `place` can bring into sight: the ribbon turns to any; a note's block shows Inbox. */
export function reachOf(place: Place): readonly ListId[] {
	return place === "note" ? ["inbox"] : ["inbox", "soon", "day"];
}

export const Layout = memo(function Layout({ place }: { readonly place: Place }) {
	const stop = useScreen((s) => s.stop);
	return (
		<>
			{place === "leaf" ? <RibbonColumns /> : <NoteColumn />}
			<PlusButton shown={place === "note" ? ["inbox"] : STOP_LISTS[stop]} />
			<TaskMenu />
		</>
	);
});

/**
 * The ribbon (spec, «Gestures that are not drag»; Decisions 64, 126, 127): the four columns at their widths on one strip,
 * standing at three stops, following a finger on glass and two on the trackpad as one gallery; past the calendar the days,
 * one place a day: the strip stands, the day's list turns under the fingers as a page with its header, and the calendar,
 * standing on its day while they hold it, changes to the new day on the list's own landing.
 */
function RibbonColumns() {
	const ribbon = useRef<HTMLDivElement>(null);
	const { win, fingers } = useHost();
	const { at, turn, bind } = useFollowRibbon(ribbon, win, fingers);
	return (
		<div className="tc-ribbon" ref={ribbon} {...bind()}>
			<DayTurnContext.Provider value={turn}>
				<RibbonTrack at={at} className="tc-ribbon-track" width={STRIP_WIDTH} share={COLUMN_SHARE}>
					<ListColumn list="inbox" />
					<ColumnRule at={at} stop="inbox" />
					<ListColumn list="soon" />
					<ColumnRule at={at} stop="soon" />
					<TurningDayColumn at={at} />
					<ListDivider at={at} ribbon={ribbon} />
					<CalendarColumn />
				</RibbonTrack>
			</DayTurnContext.Provider>
		</div>
	);
}

/** The day's list as the days turn: a page a day, its header with it, the next day's page beside it past the column's own gap. */
function TurningDayColumn({ at }: { readonly at: RibbonAt }) {
	const turn = useContext(DayTurnContext);
	if (!turn) return null;
	return (
		<DayColumnBox at={at}>
			<div className="tc-day-lane">
				{turn.days.map((day) => (
					<DaySlide key={day} day={day} at={turn.at} window="lane" className="tc-slide">
						<DayContext.Provider value={day}>
							<ColumnHead title={<DayListTitle />} />
							<div className="tc-stage-body">
								<TaskList list="day" />
							</div>
						</DayContext.Provider>
					</DaySlide>
				))}
			</div>
		</DayColumnBox>
	);
}

/**
 * The share the divider set, its glide and the port's bounds, on the two columns it divides: the stylesheet draws the
 * list's width from them (`--tc-list-width`), the calendar taking the rest.
 */
function useListWidth(): CSSProperties {
	const share = useScreen((s) => s.listShare);
	const { min, max } = useScreen((s) => s.listBounds);
	return { "--tc-list-share": share, "--tc-list-least": `${min}px`, "--tc-list-most": `${max}px` } as CSSProperties;
}

const gliding = (glide: boolean) => (glide ? " is-gliding" : "");

/** The day list's column: half the ribbon at Soon, the divider's width at the calendar, going from one to the other with the strip. */
function DayColumnBox({ at, children }: { readonly at: RibbonAt; readonly children: ReactNode }) {
	const style = useListWidth();
	const glide = useScreen((s) => s.listGlide);
	return (
		<StripColumn at={at} widthAt={dayColumnWidth} className={`tc-stage-col is-day${gliding(glide)}`} style={style}>
			{children}
		</StripColumn>
	);
}

/** The day's calendar: the rest of the window beside the list, the width it has at the calendar all the way there. */
function CalendarColumn() {
	const style = useListWidth();
	const glide = useScreen((s) => s.listGlide);
	return (
		<section className={`tc-stage-col is-timeline${gliding(glide)}`} style={style}>
			<ColumnHead title={null} />
			<div className="tc-stage-body">
				<Timeline />
			</div>
		</section>
	);
}

/** The line between two columns that split the window in half: no handle, nothing to drag (the design's «Soon и Now»). */
function ColumnRule({ at, stop }: { readonly at: RibbonAt; readonly stop: Stop }) {
	return (
		<StripRule at={at} leftAt={ruleShift(stop)}>
			<div className="tc-rule-strip">
				<div className="tc-divider-line" />
			</div>
		</StripRule>
	);
}

const DIVIDER_SHIFT = ruleShift("calendar");

/** The divider between the day's list and its calendar, with its handle: dragged by either, it sets the list's width (F51–F53). */
function ListDivider({ at, ribbon }: { readonly at: RibbonAt; readonly ribbon: RefObject<HTMLDivElement | null> }) {
	const { haptics } = useHost();
	const bind = useDivider(() => ribbon.current?.clientWidth ?? 0, () => haptics.tap());
	const handlers = bind();
	/** The divider's press is its own: the ribbon under it never begins a swipe from it. */
	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		event.stopPropagation();
		handlers.onPointerDown?.(event);
	};
	return (
		<StripRule at={at} leftAt={DIVIDER_SHIFT}>
			<div className="tc-rule-strip is-divider" {...handlers} onPointerDown={onPointerDown}>
				<div className="tc-divider-line" />
				<span className="tc-divider-handle" role="separator" aria-orientation="vertical" aria-label="Resize columns" />
			</div>
		</StripRule>
	);
}

function DayListTitle() {
	const title = useData((d) => d.lists.day.title);
	return <span className="tc-day-title">{title}</span>;
}

function NoteColumn() {
	return (
		<div className="tc-note-column">
			<ListColumn list="inbox" share={WHOLE} />
		</div>
	);
}

/** A note's one column takes the whole block. */
const WHOLE = 100;

const ListColumn = memo(function ListColumn({ list, share = COLUMN_SHARE }: { readonly list: ListId; readonly share?: number }) {
	const title = useData((d) => d.lists[list].title);
	return (
		<ColumnBox className={`is-${list}`} share={share}>
			<ColumnHead title={title} />
			<div className="tc-stage-body">
				<TaskList list={list} />
			</div>
		</ColumnBox>
	);
});

function ColumnBox({ className, share = COLUMN_SHARE, children }: { readonly className: string; readonly share?: number; readonly children: ReactNode }) {
	return (
		<section className={`tc-stage-col ${className}`} style={{ width: `${share}%` } as CSSProperties}>
			{children}
		</section>
	);
}

function ColumnHead({ title }: { readonly title: ReactNode }) {
	return <header className="tc-stage-head">{title === null ? null : <div className="tc-head-title">{title}</div>}</header>;
}

