import { closestCenter, type CollisionDetection, DndContext, defaultDropAnimationSideEffects, getFirstCollision, pointerWithin, rectIntersection, type UniqueIdentifier, useDndContext, useDroppable, type DragEndEvent, type DragMoveEvent, type DragOverEvent, DragOverlay, type DragStartEvent, type DropAnimation, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Destination, ListId, Row } from "../port";
import { DESIGN } from "../../design";
import { useScreen, useScreenApi } from "../store";
import { descendantsOf, projectDepth, type Slot, slotOf } from "./tree";

/**
 * Drag and drop (spec, «The owners»): one `DndContext` per screen, one `DragOverlay`, one `onDragEnd` that makes one write
 * through the port. Classic dnd-kit used as stage 0 settled it («Recommended configuration», «Integration findings»,
 * «Drop flicker»): the default measuring, the overlay in a portal to the view's own `document.body` with its card given
 * its id as a prop, sortable items keeping their identity, closest corners for the lists.
 */

/** The mouse lifts a card once it moved this far; the finger once it held still this long (the plugin's long press) within this tolerance. */
const MOUSE_DISTANCE_PX = 4;
const LONG_PRESS_MS = 250;
const LONG_PRESS_TOLERANCE_PX = 5;

/**
 * The copy let go flies into the card's place: short, translation only (stage 0, round four). While it flies it takes the
 * resting card's look and width (`is-dropping`, CSS over `--tc-duration-fly` and `--tc-ease-fly`), so it lands as the card
 * itself and nothing changes when it goes: dnd-kit's documented drop side effects; the card under it stays hidden meanwhile.
 */
const DROP_ANIMATION: DropAnimation = {
	duration: 180,
	easing: "cubic-bezier(0.2, 0, 0, 1)",
	sideEffects: defaultDropAnimationSideEffects({ className: { dragOverlay: "is-dropping" }, styles: { active: { opacity: "0" } } }),
};

/**
 * The carried card, told where the pointer took it from the card's left edge, so the plate is drawn around that point:
 * the pressing event and the lifted card's measured box are dnd-kit's own (`useDndContext`, as its `snapCenterToCursor`
 * modifier reads them).
 */
function Carried({ id, carried }: { readonly id: string; readonly carried: DragProps["carried"] }) {
	const { activatorEvent, activeNodeRect } = useDndContext();
	const at = activatorEvent ? getEventCoordinates(activatorEvent) : null;
	const grab = at && activeNodeRect ? at.x - activeNodeRect.left : 0;
	return <>{carried(id, grab)}</>;
}

export interface DragProps {
	/** The view's own document: the overlay goes on its body (a pop-out window has its own). */
	readonly doc: Document;
	/** How the carried card is drawn, by its task's id and where the pointer took it from the card's left edge. */
	readonly carried: (id: string, grab: number) => ReactNode;
	/** A tick under the finger as a card lifts: the host's haptics. */
	readonly onLift: () => void;
	readonly children: ReactNode;
}

export function Drag({ doc, carried, onLift, children }: DragProps) {
	const api = useScreenApi();
	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }), useSensor(TouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX } }));
	const [active, setActive] = useState<string | null>(null);

	/**
	 * Which target the pointer is over, as dnd-kit's «multiple containers» example decides it: what is under the pointer,
	 * else what the card overlaps in its own list; over a list itself, its card nearest the carried one; in the card's own list first. Right after the card moved into
	 * another list, the target stays as it was until that list is drawn, so the card never swings back and forth between
	 * two lists at their border.
	 */
	const lastOver = useRef<UniqueIdentifier | null>(null);
	const justMoved = useRef(false);
	const lists = useScreen((s) => s.shown.lists);
	useEffect(() => {
		justMoved.current = false;
	}, [lists]);
	const collision: CollisionDetection = useCallback((args) => {
		const underPointer = pointerWithin(args);
		/** Where two lists meet, the pointer is in both: the card stays in its own until the pointer has left it. */
		const own = String(args.active.data.current?.sortable?.containerId ?? "");
		const ofOwn = (hit: { readonly id: UniqueIdentifier; readonly data?: { readonly droppableContainer?: { readonly data: { readonly current?: { readonly sortable?: { readonly containerId: UniqueIdentifier } } } } } }) => hit.id === `${LIST_TARGET}${own}` || hit.data?.droppableContainer?.data.current?.sortable?.containerId === own;
		const inOwn = underPointer.filter(ofOwn);
		/** Between the lists, under no list at all, the card stays in its own: only the pointer inside another list moves it there. */
		const hits = inOwn.length > 0 ? inOwn : underPointer.length > 0 ? underPointer : rectIntersection(args).filter(ofOwn);
		let overId = getFirstCollision(hits, "id");
		if (overId !== null) {
			const items = args.droppableContainers.find((c) => c.id === overId)?.data.current?.items as readonly string[] | undefined;
			if (items && items.length > 0) overId = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => c.id !== overId && items.includes(String(c.id))) })[0]?.id ?? overId;
			lastOver.current = overId;
			return [{ id: overId }];
		}
		if (justMoved.current) lastOver.current = args.active.id;
		return lastOver.current !== null ? [{ id: lastOver.current }] : [];
	}, []);

	/** Where the card was lifted, and at which level: let go there, nothing is written. */
	const [origin, setOrigin] = useState<(Slot & { readonly container: string; readonly depth: number }) | null>(null);

	/**
	 * The level the carried card takes where it stands now, from the pointer's sideways move since the lift (dnd-kit's
	 * «Sortable tree»), among the rows of the list it is in, its own subtasks folded away.
	 */
	const rowsOf = (list: string) => api.getState().shown.lists[list as ListId]?.rows ?? [];
	const projected = (lifted: Sortable, over: Sortable | null, offsetX: number): number | null => {
		const container = containerOf(lifted);
		if (container === null) return null;
		const id = String(lifted.id);
		const rows = rowsOf(container);
		const under = descendantsOf(rows, id);
		const visible = under.size === 0 ? rows : rows.filter((row) => !under.has(row.id));
		return projectDepth(visible, id, over ? String(over.id) : id, offsetX, DESIGN.subtaskIndent, liftedDepth.current);
	};
	/**
	 * How far the pointer moved sideways since the lift, within the list the card is over now: a card carried into the next
	 * column has moved by the column's width, which is no indent. The rows of a list all start at its left edge (the indent
	 * is the card's own margin), so a row's box is where its list starts. Where the lifted card's list starts is kept from
	 * the first move: dnd-kit measures the card again once it stands in
	 * another list, so its own box no longer says where it was lifted.
	 */
	const liftedLeft = useRef<number | null>(null);
	/** The carried card's depth when lifted: its level is projected from it, never from where a preview put it meanwhile. */
	const liftedDepth = useRef(0);
	const sideways = (active: { readonly rect: { readonly current: { readonly initial: { readonly left: number } | null } } }, over: { readonly rect: { readonly left: number } } | null, deltaX: number): number => {
		liftedLeft.current ??= active.rect.current.initial?.left ?? null;
		return liftedLeft.current === null || !over ? deltaX : deltaX - (over.rect.left - liftedLeft.current);
	};
	/** The level a card takes as it comes into another list at `index` of its rows: as the projection there would give it. */
	const crossingDepth = (rows: readonly Row[], index: number, offsetX: number): number => {
		const above = rows[index - 1];
		const below = rows[index];
		const deepest = above?.kind === "task" ? above.depth + 1 : 0;
		const shallowest = below?.kind === "task" ? below.depth : 0;
		return Math.max(shallowest, Math.min(deepest, liftedDepth.current + Math.round(offsetX / DESIGN.subtaskIndent)));
	};
	const move = ({ active: lifted, over, delta }: DragMoveEvent) => {
		api.getState().setLiftedDepth(projected(lifted, over, sideways(lifted, over, delta.x)));
	};

	const start = ({ active: lifted }: DragStartEvent) => {
		const screen = api.getState();
		if (!screen.claim("drag")) return;
		screen.lift(String(lifted.id));
		setActive(String(lifted.id));
		liftedLeft.current = null;
		const container = containerOf(lifted);
		const rows = container === null ? [] : rowsOf(container);
		const own = rows.find((row) => row.id === String(lifted.id));
		liftedDepth.current = own?.kind === "task" ? own.depth : 0;
		setOrigin(container === null ? null : { container, ...slotOf(rows, itemsOf(lifted), String(lifted.id)), depth: liftedDepth.current });
		onLift();
	};
	/**
	 * Over another list, the card moves into it at once, as dnd-kit's «multiple containers» example does: the screen draws
	 * the port's preview of the card there, and that list's cards part around its place.
	 */
	const overList = ({ active: lifted, over, delta }: DragOverEvent) => {
		const into = crossing(lifted, over);
		if (!into) return;
		const rows = rowsOf(into.list);
		const id = String(lifted.id);
		const order = [...into.order.slice(0, into.index), id, ...into.order.slice(into.index)];
		const to: Destination = { list: into.list as ListId, ...slotOf(rows, order, id), dayOffset: api.getState().dayOffset, depth: crossingDepth(rows, into.index, sideways(lifted, over, delta.x)) };
		justMoved.current = true;
		api.getState().carryInto(id, to);
	};
	const end = ({ active: lifted, over, delta }: DragEndEvent) => {
		setActive(null);
		const id = String(lifted.id);
		const container = containerOf(lifted);
		if (container === null) return api.getState().drop(id, null);
		const depth = projected(lifted, over, sideways(lifted, over, delta.x)) ?? 0;
		const slot = slotOf(rowsOf(container), orderAfter(lifted, over), id);
		const still = origin !== null && origin.container === container && origin.section === slot.section && origin.before === slot.before && origin.depth === depth;
		api.getState().drop(id, still ? null : { list: container as ListId, ...slot, dayOffset: api.getState().dayOffset, depth });
	};
	const cancel = () => {
		if (active) api.getState().drop(active, null);
		setActive(null);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={start} onDragMove={move} onDragOver={overList} onDragEnd={end} onDragCancel={cancel} autoScroll={AUTO_SCROLL}>
			{children}
			{createPortal(
				<DragOverlay className="tc-overlay" dropAnimation={DROP_ANIMATION}>
					{active ? <Carried id={active} carried={carried} /> : null}
				</DragOverlay>,
				doc.body,
			)}
		</DndContext>
	);
}

interface Sortable {
	readonly id: string | number;
	readonly data: { readonly current?: { readonly sortable?: { readonly containerId: string | number; readonly items: readonly (string | number)[] } } | undefined };
}

/** The list (sortable container) a card stands in now; null when dnd-kit has none for it. */
function containerOf(card: Sortable): string | null {
	const at = card.data.current?.sortable;
	return at ? String(at.containerId) : null;
}

/** The ids of the list a card stands in, in their order now. */
function itemsOf(card: Sortable): readonly string[] {
	return (card.data.current?.sortable?.items ?? []).map(String);
}

/**
 * The order of the card's list once it is let go, as dnd-kit's sortable list puts it: `arrayMove` to the row under the
 * pointer within its own list; anywhere else, as it stands.
 */
function orderAfter(active: Sortable, over: Sortable | null): readonly string[] {
	const items = itemsOf(active);
	const own = containerOf(active);
	if (!over || over.id === active.id || own === null || containerOf(over) !== own) return items;
	return arrayMove([...items], items.indexOf(String(active.id)), items.indexOf(String(over.id)));
}

/**
 * A list scrolls under a card held near its top or bottom edge: dnd-kit's own auto-scroll, faster nearer the edge, up and
 * down only (the columns never slide under a carried card).
 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.15 } };

/** A list's own drop target, for when no row of it is under the pointer: an empty list, or past its last row. */
const LIST_TARGET = "list:";

/**
 * The carried card is over another list: where it goes there, as dnd-kit's «multiple containers» example puts it — at the
 * row under the pointer, or after it once the carried card's top is past that row's middle; over the list itself, at its
 * end. The other list's rows in their order, and the index the card takes among them. Null while it stays over its own.
 */
function crossing(active: Sortable & { readonly rect: { readonly current: { readonly translated: { readonly top: number } | null } } }, over: (Sortable & { readonly rect: { readonly top: number; readonly height: number } }) | null): { readonly list: string; readonly order: readonly string[]; readonly index: number } | null {
	const own = containerOf(active);
	if (!over || own === null) return null;
	const overId = String(over.id);
	if (overId.startsWith(LIST_TARGET)) {
		const list = overId.slice(LIST_TARGET.length);
		const order = ((over.data.current as { readonly items?: readonly string[] } | undefined)?.items ?? []).map(String);
		return list === own ? null : { list, order, index: order.length };
	}
	const list = containerOf(over);
	if (list === null || list === own) return null;
	const order = itemsOf(over);
	const below = (active.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
	return { list, order, index: order.indexOf(overId) + (below ? 1 : 0) };
}

/** A list's sortable tasks: `ids` keeps its identity between draws, or dnd-kit stops gliding (stage 0, finding 4). */
export function SortableList({ list, ids, children }: { readonly list: ListId; readonly ids: readonly string[]; readonly children: ReactNode }) {
	const { setNodeRef } = useDroppable({ id: `${LIST_TARGET}${list}`, data: { items: ids } });
	return (
		<SortableContext id={list} items={ids as string[]} strategy={verticalListSortingStrategy}>
			<div ref={setNodeRef} className="tc-list-target">
				{children}
			</div>
		</SortableContext>
	);
}

/**
 * A row of a list in dnd-kit's sortable list: the thin wrapper dnd-kit draws again around the memoized card (stage 0,
 * second round). A task's card is carried by it; lifted, it stays where the card will land, as the gap (spec, «Decided»).
 * A section's header and an empty section's plate move aside like cards but are not carried (`onTap` absent): a card goes
 * after them into their section.
 */
export const SortableRow = memo(function SortableRow({ id, onTap, children }: { readonly id: string; readonly onTap?: (target: Element) => void; readonly children: ReactNode }) {
	const carried = onTap !== undefined;
	const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: { draggable: !carried, droppable: false } });
	const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
	return (
		<div ref={setNodeRef} className={`tc-drag-source${isDragging ? " is-lifted" : ""}`} style={style} {...(carried ? attributes : {})} {...(carried ? listeners : {})} onClick={carried ? (event) => onTap(event.currentTarget) : undefined}>
			{children}
		</div>
	);
});
