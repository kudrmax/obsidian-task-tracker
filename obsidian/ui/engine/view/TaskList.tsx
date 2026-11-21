import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PROPERTY } from "../../design";
import { PLUS, SortableList, SortableRow, useListTarget } from "../drag/Drag";
import { descendantsOf } from "../drag/tree";
import { useAnchor } from "../layers/Layers";
import type { EntryField as Field, ListId, Row } from "../port";
import { DayContext, useData, useScreen, useScreenApi } from "../store";
import { Card, PressedLook } from "./Card";
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
	const api = useScreenApi();
	const allRows = useData((d) => d.lists[list].rows);
	const readRows = useData((d) => d.lists[list].rows, true);
	const lifted = useScreen((s) => s.lifted);
	const liftedDepth = useScreen((s) => s.liftedDepth);
	/** A carried task's subtasks fold away under it while it is carried (dnd-kit's «Sortable tree»): they travel with it. */
	const listed = useMemo(() => {
		if (lifted === null) return allRows;
		const under = descendantsOf(allRows, lifted);
		return under.size === 0 ? allRows : allRows.filter((row) => !under.has(row.id));
	}, [allRows, lifted]);
	const plusAt = useScreen((s) => s.plusAt);
	const rows = listed;
	/** The rows with the carried plus among them, as a row of this list while it is over it. */
	const withPlus = useMemo((): readonly Drawn[] => {
		if (!plusAt) return rows;
		const { into: where, index } = plusAt;
		if (where !== list) return rows;
		const slot: Drawn = { kind: "plus", id: PLUS };
		return [...rows.slice(0, index), slot, ...rows.slice(index)];
	}, [rows, plusAt, list]);
	/** A day's list draws the field only for its own day: the day sliding out keeps none. */
	const day = useContext(DayContext);
	const entry = useScreen((s) => (s.entry && !s.entry.stack && (list !== "day" || day === null || day === s.entry.at.dayOffset) ? s.entry : null));
	const entrySeq = useScreen((s) => s.entrySeq);
	/** The rows drawn: the list's, with the new task's field standing in its slot when it is in this list. */
	const drawn = useMemo(() => withEntry(withPlus, list, entry), [withPlus, list, entry]);
	const fresh = useScreen((s) => s.fresh);
	const gone = useScreen((s) => s.gone);
	const reveal = useScreen((s) => s.reveal);
	const order = useMemo(() => readRows.map((row) => row.id).join(" "), [readRows]);
	/** Every row is in the sortable list: headers move aside like cards; a card goes after a header into its section. */
	const ids = useMemo(() => withPlus.map((row) => row.id), [withPlus]);
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	/** A day's page beside the shown one (the day turn draws them ahead) is no place to drop on: its target stands apart. */
	const away = useScreen((s) => (day !== null && day !== s.dayOffset ? day : null));
	const target = useListTarget(list, ids, away);
	const setRoom = useCallback(
		(element: HTMLDivElement | null) => {
			setScroller(element);
			target(element);
		},
		[target],
	);
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

	/** Before the screen is painted, so a menu opening over the card finds it where it is shown. */
	useLayoutEffect(() => {
		if (!reveal) return;
		const at = rows.findIndex((row) => row.id === reveal.id);
		if (at >= 0) virtualizer.scrollToIndex(at, { align: "auto" });
		// The reveal is asked once per `seq`; the rows it looks in are those drawn then.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reveal?.seq]);

	const items = virtualizer.getVirtualItems();
	/** Whether the pointer that pressed last was a mouse: the phone has no double click. */
	const mouse = useRef(false);
	return (
		<div
			className="tc-list"
			ref={setRoom}
			data-list={list}
			onPointerDown={(event) => void (mouse.current = event.pointerType === "mouse")}
			/** A mouse's double click on the list's free room, between or under the cards, opens a new task at its end (F67); a card, a header or a field keeps its own. */
			onDoubleClick={(event) => mouse.current && !(event.target as Element).closest(".tc-drag-source, .tc-group-head, .tc-quick-row") && api.getState().openAtEnd(list)}
		>
			<div className="tc-list-items" style={{ height: virtualizer.getTotalSize() }}>
				<div className="tc-list-block" style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}>
					<SortableList list={list} ids={ids}>
						<MovingRows gone={gone}>
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
	const pressed = useContext(PressedLook);
	if (row.kind === "section")
		return (
			<SortableRow id={row.id}>
				<div className="tc-group-head">
					<span className="tc-group-name">{row.title}</span>
				</div>
			</SortableRow>
		);
	return (
		<SortableRow
			id={row.id}
			onTap={(target) => {
				anchor.current = target.querySelector("[data-id]") ?? target;
				pressed.current = null;
				api.getState().openMenu(row.id, "list", true);
			}}
		>
			<Card id={row.id} depth={row.depth} />
		</SortableRow>
	);
});

/** A row of the list as drawn: the list's own, or the new task's field. */
type Drawn = Row | { readonly kind: "entry"; readonly id: string; readonly depth: number } | { readonly kind: "plus"; readonly id: string };

/**
 * The list's rows with the field put in its slot: before the task it goes before, else at the end of its section; a
 * rename's in its card's place, the card hidden wherever the field stands (moved by the bar's place). Its level is no
 * deeper than one under the task above it.
 */
function withEntry(all: readonly Drawn[], list: ListId, field: Field | null): readonly Drawn[] {
	if (!field) return all;
	const entry = field.at;
	const { list: where, section, before } = entry;
	const renamed = field.renaming;
	const here = where === list && entry.at === undefined;
	if (here && renamed !== null && before === renamed) {
		const own = all.findIndex((row) => row.id === renamed);
		if (own >= 0) return [...all.slice(0, own), { kind: "entry", id: "entry", depth: entry.depth ?? 0 }, ...all.slice(own + 1)];
	}
	const rows = renamed === null || !all.some((row) => row.id === renamed) ? all : all.filter((row) => row.id !== renamed);
	if (!here) return rows;
	let at = before === null ? -1 : rows.findIndex((row) => row.id === before);
	if (at < 0) {
		const head = section === null || section === undefined ? -1 : rows.findIndex((row) => row.id === section);
		const from = head + 1;
		const next = rows.findIndex((row, i) => i >= from && row.kind === "section");
		at = next < 0 ? rows.length : next;
	}
	const above = rows[at - 1];
	const depth = Math.min(entry.depth ?? 0, above?.kind === "task" ? above.depth + 1 : 0);
	const slot: Drawn = { kind: "entry", id: "entry", depth };
	return [...rows.slice(0, at), slot, ...rows.slice(at)];
}
