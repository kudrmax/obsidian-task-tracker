import { useDroppable } from "@dnd-kit/core";
import { memo } from "react";
import type { DropColumn } from "../../../core/application/contracts";
import { dropId } from "./drag/dragState";
import { Icon } from "./Icon";
import { useHost, useScreen } from "./ScreenContext";
import { TaskList } from "./TaskList";

/** A column's title over its list: the list's name as the tasks file heads it. */
export function ColumnTitle({ list }: { readonly list: "inbox" | "soon" | "backlog" }) {
	const name = useScreen((s) => s.listNames[list]);
	const { ref, hot } = useTitleDrop(list);
	return (
		<div ref={ref} className={`tc-head-title${hot ? " is-hot" : ""}`}>
			{name}
		</div>
	);
}

/** A column's title as a place to drop: into its list at the end of its part without a section; it lights while a card is over it. */
function useTitleDrop(column: DropColumn) {
	const { setNodeRef } = useDroppable({ id: dropId.title(column) });
	const hot = useScreen((s) => s.drag?.phase === "carry" && s.drag.aim.kind === "title" && s.drag.aim.column === column);
	return { ref: setNodeRef, hot };
}

/**
 * The day's title, Today, Tomorrow, Yesterday or a date, with arrows for a day back and on; a tap on it goes back to
 * today. The day it shows is the day list's and the timeline's.
 */
export const DayNav = memo(function DayNav() {
	const { store } = useHost();
	const title = useScreen((s) => s.dayTitle);
	const { ref, hot } = useTitleDrop("day");
	return (
		<div className="tc-head tc-day-nav">
			<button className="tc-btn is-icon is-quiet tc-arrow" aria-label="Previous day" onClick={() => store.getState().stepDay(-1)}>
				<Icon name="chevronLeft" />
			</button>
			<button ref={ref} className={`tc-btn is-text is-plain tc-head-title tc-day-title${hot ? " is-hot" : ""}`} aria-label="Back to today" onClick={() => store.getState().toToday()}>
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
