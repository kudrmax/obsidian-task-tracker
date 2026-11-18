import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, memo, useCallback, useEffect, useMemo, useState } from "react";
import { PROPERTY } from "../../design";
import { EmptyPlate, PLUS, SortableList, SortableRow } from "../drag/Drag";
import { descendantsOf } from "../drag/tree";
import { useAnchor } from "../layers/Layers";
import type { Destination, ListId, Row } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { Card } from "./Card";
import { MovingRow, MovingRows } from "./MovingRow";
import { EntryField } from "./QuickAdd";

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
	const plusAt = useScreen((s) => s.plusAt);
	/** The rows with the carried plus among them, as a row of this list while it is over it. */
	const withPlus = useMemo((): readonly Drawn[] => {
		if (!plusAt) return rows;
		const { into: where, index } = plusAt;
		if (where !== list) return rows;
		const slot: Drawn = { kind: "plus", id: PLUS };
		return [...rows.slice(0, index), slot, ...rows.slice(index)];
	}, [rows, plusAt, list]);
	const entry = useScreen((s) => s.entry);
	const entrySeq = useScreen((s) => s.entrySeq);
	/** The rows drawn: the list's, with the new task's field standing in its slot when it is in this list. */
	const drawn = useMemo(() => withEntry(withPlus, list, entry), [withPlus, list, entry]);
	const fresh = useScreen((s) => s.fresh);
	const reveal = useScreen((s) => s.reveal);
	const order = useMemo(() => readRows.map((row) => row.id).join(" "), [readRows]);
	/** Cards and headers are in the sortable list (headers move aside like cards, a card goes after one into its section); an empty section's plate stands still. */
	const ids = useMemo(() => withPlus.filter((row) => row.kind !== "empty").map((row) => row.id), [withPlus]);
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	/**
	 * While a card is carried, its own row stays mounted however far the list scrolls under it (TanStack Virtual's
	 * `rangeExtractor`): dnd-kit carries it by that row. The rows from it to those in sight are mounted with it, so the rows
	 * still stand in one flow.
	 */
	const liftedAt = useMemo(() => (lifted === null ? -1 : drawn.findIndex((row) => row.id === lifted)), [drawn, lifted]);
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
		count: drawn.length,
		getScrollElement: () => scroller,
		estimateSize: useCallback(() => ESTIMATE_PX, []),
		getItemKey: useCallback((i: number) => drawn[i]?.id ?? i, [drawn]),
		overscan: OVERSCAN,
	});

	/** A field just opened (or the next one after Enter) is brought into sight. */
	useEffect(() => {
		const at = drawn.findIndex((row) => row.kind === "entry");
		if (at >= 0) virtualizer.scrollToIndex(at, { align: "auto" });
		// Once per field opened: the rows it looks in are those drawn then.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entrySeq]);

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
								const row = drawn[item.index];
								if (row.kind === "plus")
									return (
										<MovingRow key={row.id} id={row.id} index={item.index} ref={virtualizer.measureElement} order={order} carried fresh={false} className="tc-list-item">
											<SortableRow id={row.id} gap>
												<div className="tc-card" style={{ [PROPERTY.level]: String(liftedDepth ?? 0) } as CSSProperties} />
											</SortableRow>
										</MovingRow>
									);
								if (row.kind === "entry")
									return (
										<MovingRow key={row.id} id={row.id} index={item.index} ref={virtualizer.measureElement} order={order} carried={false} fresh={false} className="tc-list-item">
											<EntryField key={entrySeq} depth={row.depth} />
										</MovingRow>
									);
								return (
									<MovingRow key={row.id} id={row.id} index={item.index} ref={virtualizer.measureElement} order={order} carried={lifted === row.id} fresh={fresh.has(row.id)} className="tc-list-item">
										<RowFace row={row.kind === "task" && row.id === lifted && liftedDepth !== null ? { ...row, depth: liftedDepth } : row} list={list} />
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
const RowFace = memo(function RowFace({ row, list }: { readonly row: Row; readonly list: ListId }) {
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
			<EmptyPlate id={row.id} list={list} section={row.section}>
				{row.label}
			</EmptyPlate>
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

/** A row of the list as drawn: the list's own, or the new task's field. */
type Drawn = Row | { readonly kind: "entry"; readonly id: string; readonly depth: number } | { readonly kind: "plus"; readonly id: string };

/**
 * The list's rows with the new task's field put in its slot: before the task it goes before, else at the end of its
 * section (in place of an empty section's plate). Its level is no deeper than one under the task above it.
 */
function withEntry(rows: readonly Drawn[], list: ListId, entry: Destination | null): readonly Drawn[] {
	if (!entry) return rows;
	const { list: where, section, before } = entry;
	if (where !== list) return rows;
	let at = before === null ? -1 : rows.findIndex((row) => row.id === before);
	let replaces = false;
	if (at < 0) {
		const head = section === null || section === undefined ? -1 : rows.findIndex((row) => row.id === section);
		const from = head + 1;
		const next = rows.findIndex((row, i) => i >= from && row.kind === "section");
		at = next < 0 ? rows.length : next;
		replaces = rows[from]?.kind === "empty";
		if (replaces) at = from;
	}
	const above = rows[at - 1];
	const depth = Math.min(entry.depth ?? 0, above?.kind === "task" ? above.depth + 1 : 0);
	const field: Drawn = { kind: "entry", id: "entry", depth };
	return [...rows.slice(0, at), field, ...rows.slice(replaces ? at + 1 : at)];
}
