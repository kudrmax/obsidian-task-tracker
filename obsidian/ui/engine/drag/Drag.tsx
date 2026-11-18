import { closestCenter, type CollisionDetection, DndContext, defaultDropAnimationSideEffects, getFirstCollision, pointerWithin, rectIntersection, type UniqueIdentifier, useDndContext, useDroppable, type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent, type DropAnimation, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Destination, ListId } from "../port";
import { useScreen, useScreenApi } from "../store";

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

	/** Where the card was lifted: let go there, nothing is written. */
	const [origin, setOrigin] = useState<SortablePlace | null>(null);

	const start = ({ active: lifted }: DragStartEvent) => {
		const screen = api.getState();
		if (!screen.claim("drag")) return;
		screen.lift(String(lifted.id));
		setActive(String(lifted.id));
		setOrigin(placeOf(lifted));
		onLift();
	};
	/**
	 * Over another list, the card moves into it at once, as dnd-kit's «multiple containers» example does: the screen draws
	 * the port's preview of the card there, and that list's cards part around its place.
	 */
	const overList = ({ active: lifted, over }: DragOverEvent) => {
		const to = crossing(lifted, over, api.getState().dayOffset);
		if (!to) return;
		justMoved.current = true;
		api.getState().carryInto(String(lifted.id), to);
	};
	const end = ({ active: lifted, over }: DragEndEvent) => {
		setActive(null);
		const to = destinationOf(lifted, over, api.getState().dayOffset);
		const here = placeOf(lifted);
		const still = to === null && here !== null && origin !== null && here.container === origin.container && here.before === origin.before;
		api.getState().drop(String(lifted.id), to ?? (still || here === null ? null : { list: here.container as ListId, before: here.before, dayOffset: api.getState().dayOffset }));
	};
	const cancel = () => {
		if (active) api.getState().drop(active, null);
		setActive(null);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={start} onDragOver={overList} onDragEnd={end} onDragCancel={cancel}>
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

/** Where a card stands among a sortable container's items: the container (a list), and the item after it (null: its end). */
interface SortablePlace {
	readonly container: string;
	readonly before: string | null;
}

function placeOf(card: Sortable): SortablePlace | null {
	const at = card.data.current?.sortable;
	if (!at) return null;
	const items = at.items.map(String);
	return { container: String(at.containerId), before: items[items.indexOf(String(card.id)) + 1] ?? null };
}

/** A list's own drop target, for when no card of it is under the pointer: an empty list, or past its last card. */
const LIST_TARGET = "list:";

/**
 * The carried card is over another list: where it goes there, as dnd-kit's «multiple containers» example puts it — before
 * the card under the pointer, or after it once the carried card's top is past that card's middle; over the list itself,
 * at its end. Null while it stays over its own list.
 */
function crossing(active: Sortable & { readonly rect: { readonly current: { readonly translated: { readonly top: number } | null } } }, over: (Sortable & { readonly rect: { readonly top: number; readonly height: number } }) | null, dayOffset: number): Destination | null {
	const from = active.data.current?.sortable;
	if (!over || !from) return null;
	const overId = String(over.id);
	if (overId.startsWith(LIST_TARGET)) {
		const list = overId.slice(LIST_TARGET.length);
		return list === String(from.containerId) ? null : { list: list as ListId, before: null, dayOffset };
	}
	const to = over.data.current?.sortable;
	if (!to || to.containerId === from.containerId) return null;
	const items = to.items.map(String);
	const below = (active.rect.current.translated?.top ?? 0) > over.rect.top + over.rect.height / 2;
	const at = items.indexOf(overId) + (below ? 1 : 0);
	return { list: String(to.containerId) as ListId, before: items[at] ?? null, dayOffset };
}

/**
 * Where a card let go lands, as dnd-kit's sortable list puts it (`arrayMove` over the list's items): before the task that
 * follows it in the new order, at the list's end after the last. Over its own place, or over another list, it lands
 * nowhere (drags between lists are E1's).
 */
function destinationOf(active: Sortable, over: Sortable | null, dayOffset: number): Destination | null {
	const from = active.data.current?.sortable;
	const to = over?.data.current?.sortable;
	if (!over || !from || !to || from.containerId !== to.containerId || over.id === active.id) return null;
	const items = from.items.map(String);
	const at = items.indexOf(String(over.id));
	const order = arrayMove(items, items.indexOf(String(active.id)), at);
	return { list: from.containerId as ListId, before: order[at + 1] ?? null, dayOffset };
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
 * A task's card as a drag source: the thin wrapper dnd-kit draws again around the memoized card (stage 0, second round).
 * Lifted, it stays where the card will land, as the gap (spec, «Decided»).
 */
export const SortableRow = memo(function SortableRow({ id, onTap, children }: { readonly id: string; readonly onTap: (target: Element) => void; readonly children: ReactNode }) {
	const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
	const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
	return (
		<div ref={setNodeRef} className={`tc-drag-source${isDragging ? " is-lifted" : ""}`} style={style} {...attributes} {...listeners} onClick={(event) => onTap(event.currentTarget)}>
			{children}
		</div>
	);
});
