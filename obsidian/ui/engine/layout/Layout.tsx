import { type CSSProperties, memo, type ReactNode, useContext, useRef } from "react";
import { DayTurnContext, useFollowRibbon } from "../gestures/FollowRibbon";
import { RibbonTrack } from "../gestures/RibbonTrack";
import type { ListId } from "../port";
import { DayContext, STOP_LISTS, useData, useScreen } from "../store";
import { useHost } from "../view/host";
import { PlusButton } from "../view/QuickAdd";
import { DaySlide } from "../view/Slide";
import { TaskList } from "../view/TaskList";
import { TaskMenu } from "../view/TaskMenu";
import { Timeline } from "../view/Timeline";
import { COLUMN_SHARE, STRIP_WIDTH } from "./columns";

/** Where a screen is mounted: Obsidian's leaf (the main screen, a pop-out) or a note's block. */
export type Place = "leaf" | "note";

/**
 * Where things stand (spec, «The owners»): the place's columns. The only module that reads the place. A leaf shows the
 * ribbon of four columns, two at a time; a note's block shows one list. Sizes are CSS: each column is its share of the
 * strip, the strip slides by its own percent. At Inbox and at Soon the two columns split the window in half (CLAUDE.md,
 * «Behaviours Max had to ask for twice»); at the day's calendar too until the divider comes (E2).
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
					<ListColumn list="soon" />
					<TurningDayColumn />
					<ColumnBox className="is-timeline">
						<ColumnHead title={null} />
						<div className="tc-stage-body">
							<Timeline />
						</div>
					</ColumnBox>
				</RibbonTrack>
			</DayTurnContext.Provider>
		</div>
	);
}

/** The day's list as the days turn: a page a day, its header with it, the next day's page beside it past the column's own gap. */
function TurningDayColumn() {
	const turn = useContext(DayTurnContext);
	if (!turn) return null;
	return (
		<ColumnBox className="is-day">
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
		</ColumnBox>
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

