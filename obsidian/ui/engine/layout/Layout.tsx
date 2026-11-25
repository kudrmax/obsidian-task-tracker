import { type CSSProperties, Fragment, memo, type PointerEvent, type ReactNode, type RefObject, useContext, useRef } from "react";
import { DESIGN } from "../../shared/design";
import { useDivider } from "../gestures/Divider";
import { DayTurnContext, type FollowGestures, useFollowRibbon } from "../gestures/FollowRibbon";
import { RibbonTrack, StripColumn, StripRule } from "../gestures/RibbonTrack";
import type { DropColumn, LayoutColumnId, LayoutStack, ListId, ViewLayout } from "../port";
import { DayContext, useData, useScreen, useScreenApi } from "../store";
import { Capsule } from "../view/Capsule";
import { useHost } from "../view/host";
import { Icon } from "../view/Icon";
import { PlusButton } from "../view/QuickAdd";
import { DaySlide } from "../view/Slide";
import { TaskList } from "../view/TaskList";
import { TaskMenu } from "../view/TaskMenu";
import { ViewButton } from "../view/ViewButton";
import { Timeline } from "../view/Timeline";
import { Wheel } from "../view/Wheel";
import { COLUMN_SHARE, columnsOf, dayColumnWidth, drawnWidths, useDrawnWidth, type Place, ruleShift, type Stop, STRIP_WIDTH } from "./columns";

export { type Place, reachOf } from "./columns";

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
	const layout = useScreen((s) => s.view.layout);
	const shown = columnsOf(place, stop, layout);
	return (
		<>
			{place === "leaf" ? <ViewColumns key={layout.mode} layout={layout} /> : <NoteColumn list={shown[0]} />}
			<PlusButton shown={shown} />
			<Capsule />
			{place === "leaf" ? <ViewButton /> : null}
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
function ViewColumns({ layout }: { readonly layout: ViewLayout }) {
	const ribbon = useRef<HTMLDivElement>(null);
	const calendar = useRef<HTMLElement>(null);
	const { win, fingers } = useHost();
	const wheel = useScreen((s) => s.view.wheel);
	const { at, turn, bind } = useFollowRibbon(ribbon, calendar, win, fingers, layout.swipe === "pages");
	return (
		<>
			<div className={`tc-ribbon is-${layout.mode}`} ref={ribbon} {...bind()}>
				<DayTurnContext.Provider value={turn}>{layout.swipe === "pages" || layout.stack ? <RibbonStrip at={at} stack={layout.stack} ribbon={ribbon} calendar={calendar} /> : <StillColumns layout={layout} ribbon={ribbon} calendar={calendar} />}</DayTurnContext.Provider>
			</div>
			{wheel ? <Wheel at={at} /> : null}
		</>
	);
}

/**
 * Two columns' strip (F24) and Rows' (F17): Rows is the strip standing at the day and its calendar, the day's column holding
 * the lists stacked and the day's title with its arrows over the calendar; the strip's own Inbox and Soon stand empty there,
 * never in sight.
 */
function RibbonStrip({ at, stack, ribbon, calendar }: { readonly at: RibbonAt; readonly stack: LayoutStack | null; readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const rows = stack !== null;
	return (
		<RibbonTrack at={at} className="tc-ribbon-track" width={STRIP_WIDTH} share={COLUMN_SHARE}>
			{rows ? <ColumnBox className="is-inbox" /> : <InboxColumn />}
			<ColumnRule at={at} stop="inbox" />
			{rows ? <ColumnBox className="is-soon" /> : <ListColumn list="soon" />}
			<ColumnRule at={at} stop="soon" />
			<DayColumnBox at={at}>{stack ? <StackedRows lists={stack.lists} /> : <TurningDay />}</DayColumnBox>
			<ListDivider at={at} ribbon={ribbon} calendar={calendar} />
			<CalendarColumn ref={calendar} nav={rows} />
		</RibbonTrack>
	);
}

/**
 * A still layout's columns side by side (All columns, F16; the core's `ViewLayout`): each column the core's list, nothing
 * slides; the divider before the calendar sets the lists against it, each column as wide as the core's `layoutWidths`
 * gives for the share in the width the browser draws (all four equal at its middle in All columns).
 */
function StillColumns({ layout, ribbon, calendar }: { readonly layout: ViewLayout; readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const api = useScreenApi();
	const { follow } = useListWidth();
	const share = useScreen((s) => s.listShare);
	const view = useDrawnWidth(ribbon);
	const widths = view === null ? null : (api.getState().stillWidths(view, share)?.widths ?? null);
	const width = (i: number): CSSProperties | undefined => (widths ? { width: `${widths[i]}px` } : undefined);
	return (
		<div className={`tc-all-columns${follow}`}>
			{layout.columns.map((column, i) => (
				<Fragment key={column.id}>
					{i === 0 ? null : column.id === "timeline" ? layout.divider ? <StillDivider ribbon={ribbon} calendar={calendar} /> : null : <StillRule />}
					<StillColumn id={column.id} calendar={calendar} style={width(i)} />
				</Fragment>
			))}
		</div>
	);
}

/** One column of a still layout, by the core's id: a list (Inbox over Backlog, Soon, the day's turning), the calendar, or By project's list, drawn empty until the engine draws it (Decision 149). */
function StillColumn({ id, calendar, style }: { readonly id: LayoutColumnId; readonly calendar: RefObject<HTMLElement | null>; readonly style: CSSProperties | undefined }) {
	if (id === "timeline") return <CalendarColumn ref={calendar} nav={false} />;
	return (
		<section className={`tc-stage-col is-${id}`} style={style}>
			{id === "inbox" ? <InboxLists /> : id === "soon" ? <ListLists list="soon" /> : id === "day" ? <TurningDay /> : null}
		</section>
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
			<DayNav standing={false} />
		</>
	);
}

/**
 * Rows (F17, F18): Inbox, Backlog, Soon and the day's list stacked, each under its small label; while all fit each is as
 * tall as its cards, long ones share the rest and scroll each by itself (CSS flex). The day's list turns with the days as
 * its pages, its label the day's name; the day changes only by the arrows over the calendar (F22).
 */
function StackedRows({ lists }: { readonly lists: readonly DropColumn[] }) {
	return (
		<div className="tc-rows-stack">
			{lists.map((list) => (list === "day" ? <TurningRow key={list} /> : <StackedRow key={list} list={list} />))}
		</div>
	);
}

/** The day's row: its pages turning with the days, each under the day's name. */
function TurningRow() {
	const turn = useContext(DayTurnContext);
	return (
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
			{nav ? (
				<header className="tc-stage-head">
					<DayNav standing />
				</header>
			) : (
				<ColumnHead title={null} />
			)}
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

/**
 * A still layout's divider (All columns): dragged, it stands where the core's rule for the layout puts it
 * (`layoutWidths`, `dividerAt`), the share saved its `layoutShareAt`; the place it is read at, from the view's left, is
 * all but the calendar and the divider's own width.
 */
function StillDivider({ ribbon, calendar }: { readonly ribbon: RefObject<HTMLDivElement | null>; readonly calendar: RefObject<HTMLElement | null> }) {
	const { haptics } = useHost();
	const drawn = () => {
		const { view, calendar: beside } = drawnWidths(ribbon.current, calendar.current);
		return { view, list: view - beside - DESIGN.dividerWidth };
	};
	const bind = useDivider(drawn, () => haptics.tap());
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

/** A day's title (F41): a tap goes back to today (F42). On a turning page, the page's day; over the calendar (Rows), the shown day's. */
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
 * The day's arrows either side of its title (F41, the design's «Колонка дня»): a day back and on. Over the day's turning
 * pages they stand still, the shown day's title drawn unseen between them for its width, so a quick second tap finds the
 * same arrow (F46); over the calendar (Rows, F17) the title itself stands between them.
 */
function DayNav({ standing }: { readonly standing: boolean }) {
	const api = useScreenApi();
	const title = useScreen((s) => s.shown.lists.day.title);
	return (
		<div className={`tc-day-nav${standing ? " is-standing" : ""}`}>
			<button type="button" className="tc-btn is-icon is-quiet tc-arrow" aria-label="Previous day" onClick={() => api.getState().turnDay(-1)}>
				<Icon name="chevronLeft" />
			</button>
			{standing ? (
				<div className="tc-head-title">
					<DayTitle />
				</div>
			) : (
				<span className="tc-day-nav-title" aria-hidden="true">
					{title}
				</span>
			)}
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

const ListColumn = memo(function ListColumn({ list, share = COLUMN_SHARE }: { readonly list: ListId; readonly share?: number }) {
	return (
		<ColumnBox className={`is-${list}`} share={share}>
			<ListLists list={list} />
		</ColumnBox>
	);
});

/** A list under its column's title. */
function ListLists({ list }: { readonly list: ListId }) {
	const title = useData((d) => d.lists[list].title);
	return (
		<>
			<ColumnHead title={title} />
			<div className="tc-stage-body">
				<TaskList list={list} />
			</div>
		</>
	);
}

/**
 * The ribbon's first column (the design's «Inbox над Backlog»): Inbox over Backlog, half and half, each list scrolling by
 * itself; Backlog's title stands in its half under a line, as a column's stands over it.
 */
const InboxColumn = memo(function InboxColumn() {
	return (
		<ColumnBox className="is-inbox">
			<InboxLists />
		</ColumnBox>
	);
});

function InboxLists() {
	const inbox = useData((d) => d.lists.inbox.title);
	const backlog = useData((d) => d.lists.backlog.title);
	return (
		<>
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
		</>
	);
}

/** A column of the strip, `share` percent of it. */
function ColumnBox({ className, share = COLUMN_SHARE, children = null }: { readonly className: string; readonly share?: number; readonly children?: ReactNode }) {
	return (
		<section className={`tc-stage-col ${className}`} style={{ width: `${share}%` } as CSSProperties}>
			{children}
		</section>
	);
}

function ColumnHead({ title }: { readonly title: ReactNode }) {
	return <header className="tc-stage-head">{title === null ? null : <div className="tc-head-title">{title}</div>}</header>;
}

