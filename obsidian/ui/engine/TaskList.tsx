import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, memo, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { PROPERTY } from "../design";
import type { LocalDate } from "../types";
import { Card } from "./Card";
import type { ColumnModel, GroupModel, RowModel } from "./columnModel";
import { useScreen } from "./ScreenContext";
import type { ShownList } from "./screenStore";

/** A row of a list as the virtualizer counts it: a section's header, its No tasks plate, a card, or the empty list's plate. */
type Entry =
	| { readonly key: string; readonly kind: "head"; readonly group: GroupModel; readonly top: boolean }
	| { readonly key: string; readonly kind: "plate"; readonly group: GroupModel }
	| { readonly key: string; readonly kind: "card"; readonly row: RowModel }
	| { readonly key: string; readonly kind: "empty"; readonly words: string };

function entriesOf(model: ColumnModel): Entry[] {
	const entries: Entry[] = [];
	for (const group of model.groups) {
		if (group.header) entries.push({ key: `head:${group.id}`, kind: "head", group, top: entries.length === 0 });
		if (group.empty) entries.push({ key: `plate:${group.id}`, kind: "plate", group });
		for (const row of group.rows) entries.push({ key: `task:${row.id}`, kind: "card", row });
	}
	if (model.plate !== null) entries.push({ key: "empty", kind: "empty", words: model.plate });
	return entries;
}

/** How far the list is scrolled from its top and how much of it lies below: the fades at its edges follow them. */
interface Edges {
	readonly above: number;
	readonly below: number;
}

export interface TaskListProps {
	readonly column: ShownList;
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	readonly day: LocalDate | null;
	/** The list scrolls in its own room and mounts only the cards in sight (TanStack Virtual); false: every card, the list as tall as its cards. */
	readonly scrolls: boolean;
	readonly className?: string;
	/** The list's content as drawn, for the rows' heights (`stackedLists`): its whole height and where each card ends. */
	readonly onSize?: (size: ListSize) => void;
}

export interface ListSize {
	readonly content: number;
	readonly stops: readonly number[];
}

/**
 * A column's list: each task with its open subtasks under it and their branches, the sections' headers and the empty
 * sections' plates, as the core groups them. A list that scrolls mounts only what is in sight; its edges fade as it is
 * scrolled under them.
 */
export const TaskList = memo(function TaskList({ column, day, scrolls, className = "", onSize }: TaskListProps) {
	const model = useScreen((s) => s.columns[column]);
	const entries = useMemo(() => entriesOf(model), [model]);
	const settings = useScreen((s) => s.settings);
	const ungrouped = settings.ungrouped;
	const emptyLabel = useScreen((s) => s.funnel?.view.emptyLabel ?? "");
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	const [edges, setEdges] = useState<Edges>({ above: 0, below: 0 });
	/** Every row is measured once drawn; until then it counts as a card. */
	const estimate = useCallback(() => settings.cardHeight, [settings.cardHeight]);
	const shape = useRef({ entries, onSize });
	shape.current = { entries, onSize };
	const follow = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
		const { entries: drawn, onSize: report } = shape.current;
		report?.({ content: v.getTotalSize(), stops: v.measurementsCache.filter((m) => drawn[m.index]?.kind === "card").map((m) => m.end) });
		const el = v.scrollElement;
		if (!el) return;
		const next = { above: Math.round(el.scrollTop), below: Math.max(0, Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)) };
		setEdges((prev) => (prev.above === next.above && prev.below === next.below ? prev : next));
	}, []);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scroller,
		estimateSize: estimate,
		getItemKey: (i) => entries[i]?.key ?? i,
		overscan: 6,
		gap: settings.cardGap,
		enabled: scrolls,
		onChange: follow,
	});
	const draw = (entry: Entry): ReactNode => {
		if (entry.kind === "card") return <Card id={entry.row.id} day={day} level={entry.row.level} branch={entry.row.branch} stage={entry.row.stage} />;
		if (entry.kind === "head")
			return (
				<div className={`tc-group-head${entry.group.name === null ? " is-ungrouped" : ""}`}>
					<span className="tc-group-name">{entry.group.title !== undefined ? entry.group.title ?? "" : entry.group.name ?? ungrouped}</span>
				</div>
			);
		if (entry.kind === "plate") return <div className="tc-group-empty" data-group={entry.group.name ?? ""}>{emptyLabel}</div>;
		return <div className="tc-group-empty tc-list-empty">{entry.words}</div>;
	};
	const fades = `${edges.above > 0 ? " is-under-top" : ""}${edges.below > 0 ? " is-under-bottom" : ""}`;
	const style = { [PROPERTY.scrolled]: `${edges.above}px`, [PROPERTY.scrolledBelow]: `${edges.below}px` } as CSSProperties;
	if (!scrolls)
		return (
			<div className={`tc-list ${className}`} data-list={column}>
				<div className="tc-list-items is-flow">
					{entries.map((entry) => (
						<div key={entry.key} className={`tc-list-item${entry.kind === "head" && entry.top ? " is-top" : ""}`}>
							{draw(entry)}
						</div>
					))}
				</div>
			</div>
		);
	return (
		<div className={`tc-list ${className}${fades}`} style={style} ref={setScroller} data-list={column}>
			<div className="tc-list-items" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((v) => {
					const entry = entries[v.index];
					return (
						<div key={v.key} ref={virtualizer.measureElement} data-index={v.index} className={`tc-list-item${entry.kind === "head" && entry.top ? " is-top" : ""}`} style={{ transform: `translateY(${v.start}px)` }}>
							{draw(entry)}
						</div>
					);
				})}
			</div>
		</div>
	);
});
