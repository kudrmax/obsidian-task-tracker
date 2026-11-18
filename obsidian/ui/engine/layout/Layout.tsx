import { type CSSProperties, memo, type ReactNode, useRef } from "react";
import { RibbonTrack, useRibbon } from "../gestures/Ribbon";
import type { ListId } from "../port";
import { DayContext, useData, useScreen } from "../store";
import { useHost } from "../view/host";
import { PlusButton } from "../view/QuickAdd";
import { Slide } from "../view/Slide";
import { TaskList } from "../view/TaskList";
import { TaskMenu } from "../view/TaskMenu";
import { Timeline } from "../view/Timeline";
import { COLUMN_SHARE, STRIP_WIDTH } from "./columns";

/**
 * Where a screen is mounted: Obsidian's leaf (the main screen, a pop-out), a note's block, or the stand's steps alone:
 * one column (a list and drag, nothing else on screen), then two columns side by side (drag between them).
 */
export type Place = "leaf" | "note" | "column" | "twoColumns";

/**
 * Where things stand (spec, «The owners»): the place's columns. The only module that reads the place. A leaf shows the
 * ribbon of four columns, two at a time; a note's block shows one list. Sizes are CSS: each column is its share of the
 * strip, the strip slides by its own percent. At Inbox and at Soon the two columns split the window in half (CLAUDE.md,
 * «Behaviours Max had to ask for twice»); at the day's calendar too until the divider comes (E2).
 */
export const Layout = memo(function Layout({ place }: { readonly place: Place }) {
	if (place === "column" || place === "twoColumns")
		return (
			<>
				{place === "column" ? <NoteColumn /> : <TwoColumns />}
				<PlusButton />
			</>
		);
	return (
		<>
			{place === "leaf" ? <RibbonColumns /> : <NoteColumn />}
			<PlusButton />
			<TaskMenu />
		</>
	);
});

function RibbonColumns() {
	const ribbon = useRef<HTMLDivElement>(null);
	const { win } = useHost();
	const { at, bind } = useRibbon(ribbon, win);
	const dayOffset = useScreen((s) => s.dayOffset);
	const way = useScreen((s) => s.dayWay);
	return (
		<div className="tc-ribbon" ref={ribbon} {...bind()}>
			<RibbonTrack at={at} className="tc-ribbon-track" width={STRIP_WIDTH} share={COLUMN_SHARE}>
				<ListColumn list="inbox" />
				<ListColumn list="soon" />
				<ColumnBox className="is-day">
					<Slide id={`day-${dayOffset}`} way={way} className="tc-slide">
						<DayContext.Provider value={dayOffset}>
							<ColumnHead title={<DayTitle />} />
							<div className="tc-stage-body">
								<TaskList list="day" />
							</div>
						</DayContext.Provider>
					</Slide>
				</ColumnBox>
				<ColumnBox className="is-timeline">
					<Slide id={`timeline-${dayOffset}`} way={way} className="tc-slide">
						<DayContext.Provider value={dayOffset}>
							<ColumnHead title={null} />
							<div className="tc-stage-body">
								<Timeline />
							</div>
						</DayContext.Provider>
					</Slide>
				</ColumnBox>
			</RibbonTrack>
		</div>
	);
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
/** Two columns standing still side by side split the room in half. */
const HALF = 50;

function TwoColumns() {
	return (
		<div className="tc-note-column">
			<ListColumn list="inbox" share={HALF} />
			<ListColumn list="soon" share={HALF} />
		</div>
	);
}

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

function DayTitle() {
	const title = useData((d) => d.day.title);
	return <span className="tc-day-title">{title}</span>;
}
