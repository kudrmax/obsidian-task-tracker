import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { SortableList, SortableRow } from "../drag/Drag";
import { descendantsOf } from "../drag/tree";
import { useAnchor } from "../layers/Layers";
import type { ListId, Row } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { Card } from "./Card";
import { MovingRow, MovingRows } from "./MovingRow";

/** A row counts as this tall until it is drawn and measured (a card and its gap at the default size). */
const ESTIMATE_PX = 37;
/** Rows drawn past each edge of the list's room. */
const OVERSCAN = 6;

/**
 * The one list component (spec, «Long lists»): a list scrolls natively in its own room and mounts only the rows in sight,
 * as TanStack Virtual's dynamic list draws them (the rows in flow inside one block translated to the first one's start,
 * each measured; a carried card's row kept mounted). Every task's id stays in the list's `SortableContext`, mounted or not (stage 0, second round); every row
 * is a `MovingRow`. A task the store asks to reveal is scrolled into sight by the virtualizer's `scrollToIndex`.
 */
export const TaskList = memo(function TaskList({ list }: { readonly list: ListId }) {
	const allRows = useData((d) => d.lists[list].rows);
	const readRows = useData((d) => d.lists[list].rows, true);
	const lifted = useScreen((s) => s.lifted);
	const liftedDepth = useScreen((s) => s.liftedDepth);
	/** A carried task's subtasks fold away under it while it is carried (dnd-kit's «Sortable tree»): they travel with it. */
	const rows = useMemo(() => {
		if (lifted === null) return allRows;
		const under = descendantsOf(allRows, lifted);
		return under.size === 0 ? allRows : allRows.filter((row) => !under.has(row.id));
	}, [allRows, lifted]);
	const fresh = useScreen((s) => s.fresh);
	const reveal = useScreen((s) => s.reveal);
	const order = useMemo(() => readRows.map((row) => row.id).join(" "), [readRows]);
	/** Every row is in the sortable list: headers and plates move aside like cards, and a card goes after them into their section. */
	const ids = useMemo(() => rows.map((row) => row.id), [rows]);
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	/**
	 * While a card is carried, its own row stays mounted however far the list scrolls under it (TanStack Virtual's
	 * `rangeExtractor`): dnd-kit carries it by that row. The rows from it to those in sight are mounted with it, so the rows
	 * still stand in one flow.
	 */
	const liftedAt = useMemo(() => (lifted === null ? -1 : rows.findIndex((row) => row.id === lifted)), [rows, lifted]);
	const rangeExtractor = useCallback(
		(range: Range) => {
			const inSight = defaultRangeExtractor(range);
			if (liftedAt < 0 || inSight.length === 0 || inSight.includes(liftedAt)) return inSight;
			const from = Math.min(liftedAt, inSight[0]);
			const to = Math.max(liftedAt, inSight[inSight.length - 1]);
			return Array.from({ length: to - from + 1 }, (_, i) => from + i);
		},
		[liftedAt],
	);
	const virtualizer = useVirtualizer({
		rangeExtractor,
		count: rows.length,
		getScrollElement: () => scroller,
		estimateSize: useCallback(() => ESTIMATE_PX, []),
		getItemKey: useCallback((i: number) => rows[i]?.id ?? i, [rows]),
		overscan: OVERSCAN,
	});

	useEffect(() => {
		if (!reveal) return;
		const at = rows.findIndex((row) => row.id === reveal.id);
		if (at >= 0) virtualizer.scrollToIndex(at, { align: "auto" });
		// The reveal is asked once per `seq`; the rows it looks in are those drawn then.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reveal?.seq]);

	const items = virtualizer.getVirtualItems();
	return (
		<div className="tc-list" ref={setScroller} data-list={list}>
			<div className="tc-list-items" style={{ height: virtualizer.getTotalSize() }}>
				<div className="tc-list-block" style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
					<SortableList list={list} ids={ids}>
						<MovingRows>
							{items.map((item) => {
								const row = rows[item.index];
								return (
									<MovingRow key={row.id} id={row.id} index={item.index} ref={virtualizer.measureElement} order={order} carried={lifted === row.id} fresh={fresh.has(row.id)} className="tc-list-item">
										<RowFace row={row.kind === "task" && row.id === lifted && liftedDepth !== null ? { ...row, depth: liftedDepth } : row} />
									</MovingRow>
								);
							})}
						</MovingRows>
					</SortableList>
				</div>
			</div>
		</div>
	);
});

/** A row's face: a section's header, or a task's card as a drag source that opens its menu when tapped. */
const RowFace = memo(function RowFace({ row }: { readonly row: Row }) {
	const api = useScreenApi();
	const anchor = useAnchor();
	if (row.kind === "section")
		return (
			<SortableRow id={row.id}>
				<div className="tc-group-head">
					<span className="tc-group-name">{row.title}</span>
				</div>
			</SortableRow>
		);
	if (row.kind === "empty")
		return (
			<SortableRow id={row.id}>
				<div className="tc-group-empty">{row.label}</div>
			</SortableRow>
		);
	return (
		<SortableRow
			id={row.id}
			onTap={(target) => {
				anchor.current = target;
				api.getState().openMenu(row.id);
			}}
		>
			<Card id={row.id} depth={row.depth} />
		</SortableRow>
	);
});
