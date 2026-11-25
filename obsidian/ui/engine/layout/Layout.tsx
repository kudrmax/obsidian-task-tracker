import { type CSSProperties, memo, type PointerEvent, type ReactNode, type RefObject, useContext, useRef } from "react";
import { DESIGN, PROPERTY } from "../../shared/design";
import { useDivider } from "../gestures/Divider";
import { DayTurnContext, type FollowGestures, useFollowRibbon } from "../gestures/FollowRibbon";
import { RibbonTrack, StripColumn, StripRule } from "../gestures/RibbonTrack";
import type { ListId, ViewMode } from "../port";
import { DayContext, useData, useScreen, useScreenApi } from "../store";
import { Capsule } from "../view/Capsule";
import { useHost } from "../view/host";
import { Icon } from "../view/Icon";
import { PlusButton } from "../view/QuickAdd";
import { DaySlide } from "../view/Slide";
import { TaskList } from "../view/TaskList";
import { TaskMenu } from "../view/TaskMenu";
import { ViewButton } from "../view/ViewButton";
import { ProjectsChrome } from "../view/ProjectsPanel";
import { Timeline } from "../view/Timeline";
import { Wheel } from "../view/Wheel";
import { COLUMN_SHARE, columnsOf, dayColumnWidth, drawnWidths, type Place, ruleShift, type Stop, STRIP_WIDTH } from "./columns";

export { type Place, reachOf } from "./columns";

/**
 * Where the projects put the screen (F205–F208, F54): the panel shown, docked beside the lists, the top row over the
 * columns or the folder button in the titles' row before the first column's title (the column the ribbon stands or goes
 * at), and the tree's width its divider set. The root's classes and style; none on a screen fixed to its project.
 */
export function useProjectsPlace(): { readonly className: string; readonly style: CSSProperties | undefined } {
	const projects = useScreen((s) => s.projects);
	const lead = useScreen((s) => (s.view.ribbon ? s.stop : "inbox"));
	const width = useScreen((s) => s.treeWidth);
	const following = useScreen((s) => s.treeFollow);
	if (!projects) return { className: "", style: undefined };
	const { panel, topRow } = projects;
	const classes = [panel.open ? "has-tree" : "", panel.open && panel.docked ? "has-dock" : "", topRow ? "has-top-row" : `has-head-lead is-lead-${lead}`, width === null ? "" : "has-tree-width", following ? "is-tree-following" : ""];
	return { className: classes.filter(Boolean).map((c) => ` ${c}`).join(""), style: width === null ? undefined : ({ [PROPERTY.treeKept]: `${width}px` } as CSSProperties) };
}

/** Where the ribbon stands, in places: what moves its columns and dividers each frame. */
type RibbonAt = FollowGestures["at"];

/**
 * Where things stand (spec, «The owners»): the place's columns. The only module that reads the place. A leaf shows the
 * ribbon of four columns, two at a time; a note's block shows one list. Sizes are CSS: each column is its share of the
 * strip, the strip slides by its own percent. At Inbox and at Soon the two columns split the window in half (CLAUDE.md,
 * «Behaviours Max had to ask for twice»); at the day's calendar the divider sets the list against the calendar (F51–F53).
 */
export const Layout = memo(function Layout({ place }: { readonly place: Place }) {
	const stop = useScreen((s) => s.stop);
	const mode = useScreen((s) => s.view.mode);
	const ribbon = useScreen((s) => s.view.ribbon);
	const shown = columnsOf(place, stop, ribbon);
	return (
		<>
			{place === "leaf" ? <ModeColumns key={mode} mode={mode} /> : <NoteColumn list={shown[0]} />}
			<PlusButton shown={shown} />
			<Capsule />
			{place === "leaf" ? <ViewButton /> : null}
			{place === "leaf" ? <ProjectsChrome /> : null}
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
function ModeColumns({ mode }: { readonly mode: ViewMode }) {
	const ribbon = useRef<HTMLDivElement>(null);
	const calendar = useRef<HTMLElement>(null);
	const { win, fingers } = useHost();
	const { at, turn, bind } = useFollowRibbon(ribbon, calendar, win, fingers, mode === "twoColumns");
	return (
		<>
			<div className={`tc-ribbon is-${mode}`} ref={ribbon} {...bind()}>
				<DayTurnContext.Provider value={turn}>{mode === "allColumns" ? <AllColumns ribbon={ribbon} calendar={calendar} /> : <RibbonStrip at={at} rows={mode === "rows"} ribbon={ribbon} calendar={calendar} />}</DayTurnContext.Provider>
			</div>
			{mode === "twoColumns" ? <Wheel at={at} /> : null}
		</>
	);
}

/**
 * Two columns' strip (F24) and Rows' (F17): Rows is the strip standing at the day and its calendar, the day's column holding
 * the lists stacked and the day's title with its arrows over the calendar; the strip's own Inbox and Soon stand empty there,
 * never in sight.
 */
function RibbonStrip({ at, rows, ribbon, calendar }: { readonly at: RibbonAt; readonly rows: boolean; readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	return (
		<RibbonTrack at={at} className="tc-ribbon-track" width={STRIP_WIDTH} share={COLUMN_SHARE}>
			{rows ? <ColumnBox className="is-inbox" /> : <InboxColumn />}
			<ColumnRule at={at} stop="inbox" />
			{rows ? <ColumnBox className="is-soon" /> : <ListColumn list="soon" />}
			<ColumnRule at={at} stop="soon" />
			<DayColumnBox at={at}>{rows ? <StackedRows /> : <TurningDay />}</DayColumnBox>
			<ListDivider at={at} ribbon={ribbon} calendar={calendar} />
			<CalendarColumn ref={calendar} nav={rows} />
		</RibbonTrack>
	);
}

/**
 * All columns (F16, desktop): Inbox over Backlog, Soon and the day's list side by side, each as wide, then the calendar
 * behind the divider; nothing slides. The divider sets the three lists against the calendar, all four equal at its
 * middle: the same share as Two columns' list, read over half the window (the stylesheet's `--tc-all-list-width`).
 */
function AllColumns({ ribbon, calendar }: { readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const { style, follow } = useListWidth();
	return (
		<div className={`tc-all-columns${follow}`} style={style}>
			<InboxColumn share={null} />
			<StillRule />
			<ListColumn list="soon" share={null} />
			<StillRule />
			<section className="tc-stage-col is-day">
				<TurningDay />
			</section>
			<AllDivider ribbon={ribbon} calendar={calendar} />
			<CalendarColumn ref={calendar} nav={false} />
		</div>
	);
}

/** The line between two of All columns' lists: no handle, nothing to drag. */
function StillRule() {
	return (
		<div className="tc-rule">
			<div className="tc-rule-strip">
				<div className="tc-divider-line" />
			</div>
		</div>
	);
}

/** The day's list as the days turn: a page a day, its header with it, the next day's page beside it past the column's own gap. */
function TurningDay() {
	const turn = useContext(DayTurnContext);
	if (!turn) return null;
	return (
		<>
			<div className="tc-day-lane">
				{turn.days.map((day) => (
					<DaySlide key={day} day={day} at={turn.at} line={turn.line} window="lane" className="tc-slide">
						<DayContext.Provider value={day}>
							<ColumnHead title={<DayTitle />} />
							<div className="tc-stage-body">
								<TaskList list="day" />
							</div>
						</DayContext.Provider>
					</DaySlide>
				))}
			</div>
			<DayNav />
		</>
	);
}

/**
 * Rows (F17, F18): Inbox, Backlog, Soon and the day's list stacked, each under its small label; while all fit each is as
 * tall as its cards, long ones share the rest and scroll each by itself (CSS flex). The day's list turns with the days as
 * its pages, its label the day's name; the day changes only by the arrows over the calendar (F22).
 */
function StackedRows() {
	const turn = useContext(DayTurnContext);
	return (
		<div className="tc-rows-stack">
			{(["inbox", "backlog", "soon"] as const).map((list) => (
				<StackedRow key={list} list={list} />
			))}
			<div className="tc-row is-day">
				<div className="tc-day-lane">
					{turn?.days.map((day) => (
						<DaySlide key={day} day={day} at={turn.at} line={turn.line} window="lane" className="tc-slide">
							<DayContext.Provider value={day}>
								<RowLabel list="day" />
								<TaskList list="day" />
							</DayContext.Provider>
						</DaySlide>
					))}
				</div>
			</div>
		</div>
	);
}

const StackedRow = memo(function StackedRow({ list }: { readonly list: Exclude<ListId, "day"> }) {
	return (
		<div className={`tc-row is-${list}`}>
			<RowLabel list={list} />
			<TaskList list={list} />
		</div>
	);
});

function RowLabel({ list }: { readonly list: ListId }) {
	const title = useData((d) => d.lists[list].title);
	return <div className="tc-row-label">{title}</div>;
}

/**
 * The share the divider set and the port's bounds, on the two columns it divides: the stylesheet draws the list's
 * width from them (`--tc-ribbon-list-width`, the one place it is worked out), the calendar taking the rest; while the
 * hand drags the divider it follows at once, else a change glides.
 */
function useListWidth(): { readonly style: CSSProperties; readonly follow: string } {
	const share = useScreen((s) => s.listShare);
	const { min, max } = useScreen((s) => s.listBounds);
	const follow = useScreen((s) => s.listFollow);
	return { style: { "--tc-ribbon-list-share": share, "--tc-ribbon-list-least": `${min}px`, "--tc-ribbon-list-most": `${max}px` } as CSSProperties, follow: follow ? " is-following" : "" };
}

/** The day list's column: half the ribbon at Soon, the divider's width at the calendar, going from one to the other with the strip. */
function DayColumnBox({ at, children }: { readonly at: RibbonAt; readonly children: ReactNode }) {
	const { style, follow } = useListWidth();
	return (
		<StripColumn at={at} widthAt={dayColumnWidth} className={`tc-stage-col is-day${follow}`} style={style}>
			{children}
		</StripColumn>
	);
}

/** The day's calendar: the rest of the window beside the list, the width it has at the calendar all the way there. */
function CalendarColumn({ ref, nav }: { readonly ref: RefObject<HTMLElement | null>; readonly nav: boolean }) {
	const { style, follow } = useListWidth();
	return (
		<section ref={ref} className={`tc-stage-col is-timeline${follow}`} style={style}>
			{nav ? <CalendarNav /> : <ColumnHead title={null} />}
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
function ListDivider({ at, ribbon, calendar }: { readonly at: RibbonAt; readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const { haptics } = useHost();
	/** The list as the browser draws it: all the ribbon but the calendar and the divider's half beside it. */
	const drawn = () => {
		const { view, calendar: beside } = drawnWidths(ribbon.current, calendar.current);
		return { view, list: view - beside - DESIGN.dividerWidth / 2 };
	};
	const bind = useDivider(drawn, () => haptics.tap());
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

/** All columns' lists beside the calendar (the stylesheet's `--tc-all-lists`). */
const ALL_LISTS = 3;

/** The divider of All columns: the three lists against the calendar, a list's px a third of the divider's (F16). */
function AllDivider({ ribbon, calendar }: { readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const { haptics } = useHost();
	/** A list as the browser draws it, over half the window: the share's own measure, so the middle is four equal columns. */
	const drawn = () => {
		const { view, calendar: beside } = drawnWidths(ribbon.current, calendar.current);
		return { view: view / 2, list: (view - beside) / ALL_LISTS };
	};
	const bind = useDivider(drawn, () => haptics.tap(), 1 / 3);
	const handlers = bind();
	return (
		<div className="tc-rule">
			<div className="tc-rule-strip is-divider" {...handlers}>
				<div className="tc-divider-line" />
				<span className="tc-divider-handle" role="separator" aria-orientation="vertical" aria-label="Resize columns" />
			</div>
		</div>
	);
}

/** Rows' day over the calendar (F17, F49): the arrows and the day's title, standing; the calendar switches day as the arrows turn it. */
function CalendarNav() {
	const api = useScreenApi();
	const title = useScreen((s) => s.shown.lists.day.title);
	return (
		<header className="tc-stage-head">
			<div className="tc-day-nav is-standing">
				<button type="button" className="tc-btn is-icon is-quiet tc-arrow" aria-label="Previous day" onClick={() => api.getState().turnDay(-1)}>
					<Icon name="chevronLeft" />
				</button>
				<div className="tc-head-title">
					<button type="button" className="tc-btn tc-day-title" aria-label="Back to today" onClick={() => api.getState().backToToday()}>
						{title}
					</button>
				</div>
				<button type="button" className="tc-btn is-icon is-quiet tc-arrow" aria-label="Next day" onClick={() => api.getState().turnDay(1)}>
					<Icon name="chevronRight" />
				</button>
			</div>
		</header>
	);
}

/** A day's title on its page (F41): a tap goes back to today (F42). */
function DayTitle() {
	const title = useData((d) => d.lists.day.title);
	const api = useScreenApi();
	return (
		<button type="button" className="tc-btn tc-day-title" aria-label="Back to today" onClick={() => api.getState().backToToday()}>
			{title}
		</button>
	);
}

/**
 * The day's arrows (F41, the design's «Колонка дня»): a day back and on, standing still over the turning pages so a quick
 * second tap finds the same arrow (F46); the shown day's title, unseen, keeps the next arrow right after it.
 */
function DayNav() {
	const api = useScreenApi();
	const title = useScreen((s) => s.shown.lists.day.title);
	return (
		<div className="tc-day-nav">
			<button type="button" className="tc-btn is-icon is-quiet tc-arrow" aria-label="Previous day" onClick={() => api.getState().turnDay(-1)}>
				<Icon name="chevronLeft" />
			</button>
			<span className="tc-day-nav-title" aria-hidden="true">
				{title}
			</span>
			<button type="button" className="tc-btn is-icon is-quiet tc-arrow" aria-label="Next day" onClick={() => api.getState().turnDay(1)}>
				<Icon name="chevronRight" />
			</button>
		</div>
	);
}

function NoteColumn({ list }: { readonly list: ListId }) {
	return (
		<div className="tc-note-column">
			<ListColumn list={list} share={WHOLE} />
		</div>
	);
}

/** A note's one column takes the whole block. */
const WHOLE = 100;

const ListColumn = memo(function ListColumn({ list, share = COLUMN_SHARE }: { readonly list: ListId; readonly share?: number | null }) {
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

/**
 * The ribbon's first column (the design's «Inbox над Backlog»): Inbox over Backlog, half and half, each list scrolling by
 * itself; Backlog's title stands in its half under a line, as a column's stands over it.
 */
const InboxColumn = memo(function InboxColumn({ share = COLUMN_SHARE }: { readonly share?: number | null }) {
	const inbox = useData((d) => d.lists.inbox.title);
	const backlog = useData((d) => d.lists.backlog.title);
	return (
		<ColumnBox className="is-inbox" share={share}>
			<ColumnHead title={inbox} />
			<div className="tc-stage-body is-inbox-half">
				<TaskList list="inbox" />
			</div>
			<div className="tc-backlog">
				<header className="tc-backlog-head">
					<div className="tc-head-title">{backlog}</div>
				</header>
				<div className="tc-stage-body">
					<TaskList list="backlog" />
				</div>
			</div>
		</ColumnBox>
	);
});

/** A column of the strip, `share` percent of it; null: as wide as the stylesheet sets it (All columns' lists). */
function ColumnBox({ className, share = COLUMN_SHARE, children = null }: { readonly className: string; readonly share?: number | null; readonly children?: ReactNode }) {
	return (
		<section className={`tc-stage-col ${className}`} style={share === null ? undefined : ({ width: `${share}%` } as CSSProperties)}>
			{children}
		</section>
	);
}

function ColumnHead({ title }: { readonly title: ReactNode }) {
	return <header className="tc-stage-head">{title === null ? null : <div className="tc-head-title">{title}</div>}</header>;
}

