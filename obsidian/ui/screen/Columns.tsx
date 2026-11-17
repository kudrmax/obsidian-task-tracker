import { memo } from "react";
import { Icon } from "./Icon";
import { useHost, useScreen } from "./ScreenContext";
import { TaskList } from "./TaskList";

/** A column's title over its list: the list's name as the tasks file heads it. */
export function ColumnTitle({ list }: { readonly list: "inbox" | "soon" | "backlog" }) {
	const name = useScreen((s) => s.listNames[list]);
	return <div className="tc-head-title">{name}</div>;
}

/**
 * The day's title, Today, Tomorrow, Yesterday or a date, with arrows for a day back and on; a tap on it goes back to
 * today. The day it shows is the day list's and the timeline's.
 */
export const DayNav = memo(function DayNav() {
	const { store } = useHost();
	const title = useScreen((s) => s.dayTitle);
	return (
		<div className="tc-head tc-day-nav">
			<button className="tc-btn is-icon is-quiet tc-arrow" aria-label="Previous day" onClick={() => store.getState().stepDay(-1)}>
				<Icon name="chevronLeft" />
			</button>
			<button className="tc-btn is-text is-plain tc-head-title tc-day-title" aria-label="Back to today" onClick={() => store.getState().toToday()}>
				{title}
			</button>
			<button className="tc-btn is-icon is-quiet tc-arrow" aria-label="Next day" onClick={() => store.getState().stepDay(1)}>
				<Icon name="chevronRight" />
			</button>
		</div>
	);
});

/** Inbox over Backlog: one column halved, Backlog under a line with its own title, each half scrolling by itself. */
export const InboxBacklog = memo(function InboxBacklog({ scrolls }: { readonly scrolls: boolean }) {
	return (
		<>
			<div className="tc-pane is-inbox">
				<TaskList column="inbox" day={null} scrolls={scrolls} />
			</div>
			<div className="tc-pane is-backlog">
				<div className="tc-pane-head">
					<ColumnTitle list="backlog" />
				</div>
				<TaskList column="backlog" day={null} scrolls={scrolls} />
			</div>
		</>
	);
});

/** The day's list: Now on today, the tasks due on another day; its cards leave out the shown day's date. */
export const DayList = memo(function DayList({ scrolls }: { readonly scrolls: boolean }) {
	const date = useScreen((s) => s.date);
	return <TaskList column="day" day={date} scrolls={scrolls} />;
});
