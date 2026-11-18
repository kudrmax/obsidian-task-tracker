import { motion, useMotionValue, useTransform } from "motion/react";
import { type CSSProperties, Fragment, memo, useCallback, useEffect, useState } from "react";
import { type DropColumn, type LayoutColumn, layoutShareAt, layoutWidths, stackedLists, type ViewLayout } from "../../../core/application/contracts";
import { DESIGN } from "../design";
import { ColumnTitle, DayList, DayNav, InboxBacklog } from "./Columns";
import { Divider } from "./Divider";
import { useHost, useScreen } from "./ScreenContext";
import { type ListSize, TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import { useHeight } from "./useHeight";

/**
 * The still layouts (`ViewLayout.swipe: "none"`): all columns, rows and by project, each column as wide as the core says
 * (`layoutWidths`), the last the rest, the divider before the timeline. The screen stands: no swipe, no rubber band.
 */
export const StillStage = memo(function StillStage({ layout }: { readonly layout: ViewLayout }) {
	const { store, width } = useHost();
	const share = useScreen((s) => s.settings.listShare);
	const widthsAt = useCallback((at: number) => layoutWidths(layout, at, width, DESIGN.dividerWidth), [layout, width]);
	const start = widthsAt(share);
	const dividerAt = useMotionValue(start?.divider?.width ?? 0);
	useEffect(() => dividerAt.set(widthsAt(share)?.divider?.width ?? 0), [share, widthsAt, dividerAt]);
	const shareAt = (at: number) => layoutShareAt(layout, at, width, DESIGN.dividerWidth) ?? share;
	const titled = layout.columns.some((column) => column.id === "inbox" || column.id === "soon" || column.id === "day");
	const navIn = layout.columns.some((column) => column.id === "day") ? "day" : "timeline";
	return (
		<div className={`tc-stage is-${layout.mode === "allColumns" ? "columns" : layout.mode === "rows" ? "rows" : "by-project"}`}>
			{layout.columns.map((column, i) => (
				<Fragment key={column.id}>
					{i === 0 ? null : column.id === "timeline" && layout.divider ? (
						<Divider width={dividerAt} bounds={() => ({ ...widthsAt(shareAt(dividerAt.get()))!.divider! })} onRelease={(at) => store.getState().saveShare(shareAt(at))} />
					) : (
						<div className="tc-stage-rule">
							<div className="tc-divider-line" />
						</div>
					)}
					<StillColumn column={column} index={i} widthAt={(at) => widthsAt(shareAt(at))?.widths[i] ?? 0} at={dividerAt} titled={titled} nav={column.id === navIn} layout={layout} />
				</Fragment>
			))}
		</div>
	);
});

function StillColumn({ column, index, widthAt, at, titled, nav, layout }: { readonly column: LayoutColumn; readonly index: number; readonly widthAt: (at: number) => number; readonly at: ReturnType<typeof useMotionValue<number>>; readonly titled: boolean; readonly nav: boolean; readonly layout: ViewLayout }) {
	const width = useTransform(at, (value) => widthAt(value));
	const rest = column.width === "rest";
	const head = titled || nav ? <div className="tc-stage-head">{nav ? <DayNav /> : column.id === "inbox" || column.id === "soon" ? <ColumnTitle list={column.id} /> : null}</div> : null;
	return (
		<motion.div className={`tc-stage-col is-${column.id}${rest ? " is-rest" : ""}`} style={rest ? undefined : { width }} data-index={index}>
			{head}
			<div className="tc-stage-body">
				<ColumnBody column={column} layout={layout} />
			</div>
		</motion.div>
	);
}

function ColumnBody({ column, layout }: { readonly column: LayoutColumn; readonly layout: ViewLayout }) {
	if (column.id === "inbox") return <InboxBacklog scrolls />;
	if (column.id === "soon") return <TaskList column="soon" day={null} scrolls />;
	if (column.id === "day") return <DayList scrolls />;
	if (column.id === "timeline") return <Timeline />;
	if (column.id === "rows") return <RowsStack lists={layout.stack?.lists ?? []} scrolls={layout.stack?.scrolls ?? false} titles={new Map(column.lists.map((list) => [list.list, list.title]))} />;
	return <ProjectsList scrolls={layout.columns.some((c) => c.id === "timeline")} />;
}

/** By project: the node's own tasks first with no header, then a part per subproject, each card with its stage's mark. */
function ProjectsList({ scrolls }: { readonly scrolls: boolean }) {
	return <TaskList column="projects" day={null} scrolls={scrolls} className="tc-projects-list" />;
}

/**
 * The rows: Inbox, Backlog, Soon and the day's list stacked, each under its small label. While all fit each is as tall as
 * its cards; long lists share the rest, each ending on a whole card (`stackedLists`, the core's). In a note's block every
 * list is as tall as its cards and the block grows.
 */
function RowsStack({ lists, scrolls, titles }: { readonly lists: readonly DropColumn[]; readonly scrolls: boolean; readonly titles: ReadonlyMap<string, string | null> }) {
	const dayTitle = useScreen((s) => s.dayTitle);
	const date = useScreen((s) => s.date);
	const settings = useScreen((s) => s.settings);
	const [stackRef, room] = useHeight();
	const [sizes, setSizes] = useState<Readonly<Record<string, ListSize>>>({});
	const report = useCallback((list: DropColumn) => (size: ListSize) => setSizes((prev) => (sameSize(prev[list], size) ? prev : { ...prev, [list]: size })), []);
	const reporters = useState(() => new Map<DropColumn, (size: ListSize) => void>())[0];
	const reporterOf = (list: DropColumn) => {
		if (!reporters.has(list)) reporters.set(list, report(list));
		return reporters.get(list)!;
	};
	const top = DESIGN.groupHead + settings.cardGap;
	const measured = lists.map((list) => {
		const size = sizes[list] ?? { content: 0, stops: [] };
		return { wanted: top + size.content, stops: size.stops.map((stop) => top + stop) };
	});
	const free = room - DESIGN.sectionGap * Math.max(0, lists.length - 1);
	const heights = scrolls && room > 0 ? stackedLists(measured, free, settings.cardHeight / 2) : null;
	return (
		<div className={`tc-rows-stack${scrolls ? "" : " is-growing"}`} ref={stackRef}>
			{lists.map((list, i) => (
				<div key={list} className="tc-row" data-column={list} style={heights ? ({ height: heights[i] } as CSSProperties) : undefined}>
					<div className="tc-row-label">{titles.get(list) ?? dayTitle}</div>
					<div className="tc-row-body">
						<TaskList column={list} day={list === "day" ? date : null} scrolls={scrolls} className="tc-row-list" padTop={settings.cardGap} onSize={reporterOf(list)} />
					</div>
				</div>
			))}
		</div>
	);
}

const sameSize = (a: ListSize | undefined, b: ListSize) => !!a && a.content === b.content && a.stops.length === b.stops.length && a.stops.every((stop, i) => stop === b.stops[i]);
