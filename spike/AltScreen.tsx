import { PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { move } from "@dnd-kit/helpers";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo, useRef } from "react";
import { useStore } from "zustand";
import type { DropFrom } from "../core/application/contracts";
import { counters } from "./Screen";
import type { ColumnId, ScreenState, ScreenStore } from "./store";

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
	const use = <T,>(selector: (s: ScreenState) => T) => useStore(store, selector);
	const origin = useRef<DropFrom | null>(null);
	const active = use((s) => s.dragging);
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
			<DragOverlay>{active ? <div data-overlay={active} className="tcs-card is-overlay">{store.getState().faces[active]?.title}</div> : null}</DragOverlay>
		</DragDropProvider>
	);
}

function AltColumn({ col, store }: { col: ColumnId; store: ScreenStore }) {
	const all = useStore(store, (s) => (s.shown ?? s.columns)[col]);
	const mounted = useStore(store, (s) => s.mounted);
	const ids = useMemo(() => (Number.isFinite(mounted) ? all.slice(0, mounted) : all), [all, mounted]);
	const truth = useStore(store, (s) => s.columns[col]);
	return (
		<div className="tcs-column" data-col={col}>
			<div className="tcs-column-title">
				{col} {ids.length}
			</div>
			<div className="tcs-column-scroll">
				<AnimatePresence initial={false} mode="popLayout">
					{ids.map((id, index) => (
						<AltCard key={id} id={id} index={index} col={col} order={truth} store={store} />
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}

const AltCard = memo(function AltCard({ id, index, col, order, store }: { id: string; index: number; col: ColumnId; order: readonly string[]; store: ScreenStore }) {
	counters.card.set(id, (counters.card.get(id) ?? 0) + 1);
	const { ref, isDragging } = useSortable({ id, index, group: col, type: "item", accept: "item" });
	const title = useStore(store, (s) => s.faces[id]?.title);
	return (
		<motion.div className="tcs-card-outer" layout={!isDragging} layoutId={isDragging ? undefined : id} layoutDependency={order} transition={SPRING}>
			<div ref={ref} className={`tcs-card-inner ${isDragging ? "is-placeholder" : ""}`} data-id={id}>
				<div className="tcs-card">{title}</div>
			</div>
		</motion.div>
	);
});
