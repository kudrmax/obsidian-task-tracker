import { PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { CollisionPriority } from "@dnd-kit/abstract";
import { DragDropProvider, DragOverlay, useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "motion/react";
import { memo, useRef } from "react";
import { useStore } from "zustand";
import type { DropFrom } from "../core/application/contracts";
import { counters } from "./Screen";
import type { ColumnId, ScreenStore } from "./store";

/**
 * The same three columns on @dnd-kit/react (the new line of dnd-kit), to compare against the classic one: whether a drag
 * start, a drag frame and a drop stay under 16 ms with ~240 cards.
 */
const SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
const LISTS: readonly ColumnId[] = ["inbox", "backlog", "soon"];

/** A mouse drags after 5 px, a finger after a 250 ms press it holds within 5 px: the classic spike's sensors. */
const sensors = [
	PointerSensor.configure({
		activationConstraints: (event) =>
			event.pointerType === "touch" ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })] : [new PointerActivationConstraints.Distance({ value: 5 })],
	}),
];

export function AltScreen({ store }: { store: ScreenStore }) {
	const origin = useRef<DropFrom | null>(null);
	return (
		<DragDropProvider
			sensors={sensors}
			onDragStart={({ operation }) => {
				const s = store.getState();
				const id = String(operation.source?.id);
				origin.current = (LISTS.find((col) => s.columns[col].includes(id)) ?? "inbox") as DropFrom;
				s.setShown({ ...s.columns });
				s.setDragging(id);
			}}
			onDragOver={(event) => {
				const s = store.getState();
				if (!s.shown) return;
				const shown = { inbox: s.shown.inbox, backlog: s.shown.backlog, soon: s.shown.soon };
				const next = move(shown as unknown as Record<string, string[]>, event);
				if (next !== (shown as unknown)) s.setShown({ ...s.shown, ...next });
			}}
			onDragEnd={(event) => {
				const s = store.getState();
				const id = String(event.operation.source?.id);
				if (event.canceled || !s.shown) {
					s.setShown(null);
					s.setDragging(null);
					return;
				}
				const col = LISTS.find((c) => s.shown![c].includes(id))!;
				const list = s.shown[col];
				const next = list[list.indexOf(id) + 1];
				const prev = list[list.indexOf(id) - 1];
				const group = (next ? s.items[next]?.group : undefined) ?? (prev ? s.items[prev]?.group : undefined) ?? null;
				s.setDragging(null);
				void s.drop(id, origin.current!, { kind: "place", column: col, place: { kind: "task", group, before: next ? s.items[next].key : null } });
			}}
		>
			<div className="tcs-page" style={{ width: "100%" }}>
				{LISTS.map((col) => (
					<AltColumn key={col} col={col} store={store} />
				))}
			</div>
			<DragOverlay>
				<AltLifted store={store} />
			</DragOverlay>
		</DragDropProvider>
	);
}

function AltLifted({ store }: { store: ScreenStore }) {
	const active = useStore(store, (s) => s.dragging);
	const title = useStore(store, (s) => (s.dragging ? s.faces[s.dragging]?.title : null));
	return active ? (
		<div data-overlay={active} className="tcs-card is-overlay">
			{title}
		</div>
	) : null;
}

const ROW_PX = 33;

/** A column, virtualized like the classic one, with the column itself a low-priority droppable (the multiple-lists guide). */
const AltColumn = memo(function AltColumn({ col, store }: { col: ColumnId; store: ScreenStore }) {
	const all = useStore(store, (s) => (s.shown ?? s.columns)[col]);
	const truth = useStore(store, (s) => s.columns[col]);
	const scroller = useRef<HTMLDivElement | null>(null);
	const { ref: dropRef } = useDroppable({ id: `col:${col}`, type: "column", accept: "item", collisionPriority: CollisionPriority.Low });
	const v = useVirtualizer({ count: all.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_PX, overscan: 3, getItemKey: (i) => all[i] });
	const items = v.getVirtualItems();
	return (
		<div className="tcs-column" data-col={col}>
			<div className="tcs-column-title">
				{col} {all.length}
			</div>
			<div
				className="tcs-column-scroll"
				ref={(el) => {
					scroller.current = el;
					dropRef(el);
				}}
			>
				<div style={{ height: v.getTotalSize(), position: "relative" }}>
					<div style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${items[0]?.start ?? 0}px)` }}>
						<AnimatePresence initial={false} mode="popLayout">
							{items.map((item) => (
								<AltCard key={all[item.index]} id={all[item.index]} index={item.index} col={col} order={truth} store={store} />
							))}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
});

/** A row: Motion's layout only while nothing is dragged, so Motion never moves an element dnd-kit is moving. */
const AltCard = memo(function AltCard({ id, index, col, order, store }: { id: string; index: number; col: ColumnId; order: readonly string[]; store: ScreenStore }) {
	counters.card.set(id, (counters.card.get(id) ?? 0) + 1);
	const { ref, isDragging } = useSortable({ id, index, group: col, type: "item", accept: "item" });
	const title = useStore(store, (s) => s.faces[id]?.title);
	const withMotion = useStore(store, (s) => s.altMotion);
	const quiet = useStore(store, (s) => s.altQuiet);
	const dragOn = useStore(store, (s) => !s.altQuiet && s.dragging !== null);
	const body = (
		<div ref={ref} className={`tcs-card-inner ${isDragging ? "is-placeholder" : ""}`} data-id={id}>
			<div className="tcs-card">{title}</div>
		</div>
	);
	if (!withMotion) return <div className="tcs-card-outer">{body}</div>;
	return (
		<motion.div className="tcs-card-outer" layout={dragOn ? false : "position"} layoutId={dragOn || quiet ? undefined : id} layoutDependency={order} transition={SPRING}>
			{body}
		</motion.div>
	);
});
