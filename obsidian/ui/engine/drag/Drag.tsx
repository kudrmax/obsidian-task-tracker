import { closestCorners, DndContext, defaultDropAnimationSideEffects, useDndContext, type DragEndEvent, DragOverlay, type DragStartEvent, type DropAnimation, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { type CSSProperties, memo, type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import type { Destination, ListId } from "../port";
import { useScreenApi } from "../store";

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

	const start = ({ active: lifted }: DragStartEvent) => {
		const screen = api.getState();
		if (!screen.claim("drag")) return;
		screen.lift(String(lifted.id));
		setActive(String(lifted.id));
		onLift();
	};
	const end = ({ active: lifted, over }: DragEndEvent) => {
		setActive(null);
		api.getState().drop(String(lifted.id), destinationOf(lifted, over, api.getState().dayOffset));
	};
	const cancel = () => {
		if (active) api.getState().drop(active, null);
		setActive(null);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={start} onDragEnd={end} onDragCancel={cancel}>
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
	return (
		<SortableContext id={list} items={ids as string[]} strategy={verticalListSortingStrategy}>
			{children}
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
