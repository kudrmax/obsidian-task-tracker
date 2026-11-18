import { closestCenter, type CollisionDetection, DndContext, defaultDropAnimationSideEffects, getClientRect, getFirstCollision, type MeasuringConfiguration, pointerWithin, rectIntersection, type UniqueIdentifier, useDndContext, useDroppable, type DragEndEvent, type DragMoveEvent, type DragOverEvent, DragOverlay, type DragStartEvent, type DropAnimation, MouseSensor, PointerSensor, TouchSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
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

/** The plus is carried by this id: on its button, and as a row of the list it is over. */
export const PLUS = "plus";

/** Whether a touch starts on the plus: it moves at once, a card only after the long press. */
const onPlus = (event: Event): boolean => (event.target as Element | null)?.closest?.("[data-plus]") != null;

/**
 * Sensors as dnd-kit's custom sensors are made (a sensor's activators filter what may start it). A card is lifted by the
 * mouse or by the long press of a finger (touch events); the plus moves at once under a finger (the old plugin's F175),
 * started by the pointer events of a touch on it, so the two never listen to the same event (dnd-kit keeps one listener
 * per event name).
 */
class CardTouchSensor extends TouchSensor {
	static override activators = TouchSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1]) => !onPlus(event.nativeEvent) && activator.handler(event, options) }));
}
class PlusTouchSensor extends PointerSensor {
	static override activators = PointerSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1]) => event.nativeEvent.pointerType === "touch" && onPlus(event.nativeEvent) && activator.handler(event, options) }));
}
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
	/** How the carried plus is drawn. */
	readonly plus: ReactNode;
	/** A tick under the finger as a card lifts: the host's haptics. */
	readonly onLift: () => void;
	readonly children: ReactNode;
}

export function Drag({ doc, carried, plus, onLift, children }: DragProps) {
	const api = useScreenApi();
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
		useSensor(CardTouchSensor, { activationConstraint: { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX } }),
		useSensor(PlusTouchSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
	);
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
		/** The plus over no list is no list's row: nothing is under it. */
		if (args.active.id === PLUS && underPointer.length === 0) return [];
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
	/**
	 * The carried plus comes into a list the way a card crosses into another (dnd-kit's «multiple containers»): it becomes
	 * that list's row at the place under the pointer, and from then on the rows part around it as they do for a card. Over
	 * no list, it is no list's row.
	 */
	const plusOver = (event: { readonly activatorEvent: Event; readonly delta: { readonly y: number }; readonly active: Sortable }, over: (Sortable & { readonly rect: { readonly top: number; readonly height: number } }) | null) => {
		if (!over) return api.getState().setPlusAt(null);
		const overId = String(over.id);
		const own = containerOf(event.active);
		const list = overId.startsWith(LIST_TARGET) ? overId.slice(LIST_TARGET.length) : containerOf(over);
		if (list === null || list === own) return;
		if (overId.startsWith(LIST_TARGET)) return api.getState().setPlusAt({ into: list as ListId, index: rowsOf(list).length });
		const order = itemsOf(over).filter((id) => id !== PLUS);
		const pointerY = (getEventCoordinates(event.activatorEvent)?.y ?? 0) + event.delta.y;
		const below = pointerY > over.rect.top + over.rect.height / 2;
		justMoved.current = true;
		api.getState().setPlusAt({ into: list as ListId, index: order.indexOf(overId) + (below ? 1 : 0) });
	};
	/** The plus let go in a list: the field opens where the rows parted for it, at the level its sideways place asks (the old plugin's F175). */
	const dropPlus = (event: DragEndEvent) => {
		const list = containerOf(event.active);
		const order = orderAfter(event.active, event.over);
		api.getState().setPlusAt(null);
		api.getState().release("drag");
		if (list === null) return;
		const rows = rowsOf(list);
		const index = order.indexOf(PLUS);
		const x = (getEventCoordinates(event.activatorEvent)?.x ?? 0) + event.delta.x;
		const box = event.over?.rect;
		const middle = box ? box.left + box.width / 2 : x;
		const wanted = x < middle ? 0 : 1 + Math.floor((x - middle) / DESIGN.subtaskIndent);
		const above = rows.find((row) => row.id === order[index - 1]);
		const depth = Math.min(wanted, above?.kind === "task" ? above.depth + 1 : 0);
		api.getState().openEntry({ list: list as ListId, ...slotOf(rows, order, PLUS), dayOffset: api.getState().dayOffset, depth });
	};
	const move = (event: DragMoveEvent) => {
		const { active: lifted, over, delta } = event;
		if (lifted.id === PLUS) return plusOver(event, over);
		api.getState().setLiftedDepth(projected(lifted, over, sideways(lifted, over, delta.x)));
	};

	const start = ({ active: lifted }: DragStartEvent) => {
		const screen = api.getState();
		if (!screen.claim("drag")) return;
		if (lifted.id === PLUS) {
			screen.openEntry(null);
			setActive(PLUS);
			return onLift();
		}
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
	const overList = (event: DragOverEvent) => {
		const { active: lifted, over, delta } = event;
		if (lifted.id === PLUS) return plusOver(event, over);
		const into = crossing(lifted, over);
		if (!into) return;
		const rows = rowsOf(into.list);
		const id = String(lifted.id);
		const order = [...into.order.slice(0, into.index), id, ...into.order.slice(into.index)];
		const to: Destination = { list: into.list as ListId, ...slotOf(rows, order, id), dayOffset: api.getState().dayOffset, depth: crossingDepth(rows, into.index, sideways(lifted, over, delta.x)) };
		justMoved.current = true;
		api.getState().carryInto(id, to);
	};
	const end = (event: DragEndEvent) => {
		const { active: lifted, over, delta } = event;
		setActive(null);
		if (lifted.id === PLUS) return dropPlus(event);
		const id = String(lifted.id);
		const container = containerOf(lifted);
		if (container === null) return api.getState().drop(id, null);
		const depth = projected(lifted, over, sideways(lifted, over, delta.x)) ?? 0;
		const slot = slotOf(rowsOf(container), orderAfter(lifted, over), id);
		const still = origin !== null && origin.container === container && origin.section === slot.section && origin.before === slot.before && origin.depth === depth;
		api.getState().drop(id, still ? null : { list: container as ListId, ...slot, dayOffset: api.getState().dayOffset, depth });
	};
	const cancel = () => {
		if (active === PLUS) {
			api.getState().setPlusAt(null);
			api.getState().release("drag");
		} else if (active) api.getState().drop(active, null);
		setActive(null);
	};

	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={start} onDragMove={move} onDragOver={overList} onDragEnd={end} onDragCancel={cancel} autoScroll={AUTO_SCROLL} measuring={MEASURING}>
			{children}
			{createPortal(
				<DragOverlay className="tc-overlay" dropAnimation={DROP_ANIMATION}>
					{active === PLUS ? plus : active ? <Carried id={active} carried={carried} /> : null}
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
 * Where a row stands for dnd-kit, as its measuring configuration lets an app say (`measuring.droppable.measure`): its
 * place in the list's layout, never where a glide has it this frame. A row glides by Motion on its list item, so the item
 * is measured without its transform, as dnd-kit measures a row without its own (`getClientRect`, `ignoreTransform`); the
 * place the rows part at then holds still under the pointer while they glide.
 */
const MEASURING: MeasuringConfiguration = {
	droppable: {
		measure: (element) => {
			const item = element.parentElement?.classList.contains("tc-list-item") ? element.parentElement : element;
			return getClientRect(item, { ignoreTransform: true });
		},
	},
};

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
export const SortableRow = memo(function SortableRow({ id, onTap, gap = false, children }: { readonly id: string; readonly onTap?: (target: Element) => void; readonly gap?: boolean; readonly children: ReactNode }) {
	const carried = onTap !== undefined;
	const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: { draggable: !carried, droppable: false } });
	const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition };
	return (
		<div ref={setNodeRef} className={`tc-drag-source${isDragging || gap ? " is-lifted" : ""}`} style={style} {...(carried ? attributes : {})} {...(carried ? listeners : {})} onClick={carried ? (event) => onTap(event.currentTarget) : undefined}>
			{children}
		</div>
	);
});

/**
 * The plus as dnd-kit carries it: dragged it moves at once; tapped, it does what its `onTap` says. While it is carried, its
 * own place shows as a dashed ring (the old plugin's F176), and let go back over it nothing opens.
 */
export function CarriedPlus({ onTap, children, ring }: { readonly onTap: () => void; readonly children: ReactNode; readonly ring: ReactNode }) {
	const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: PLUS });
	return (
		<>
			{isDragging ? ring : null}
			<button ref={setNodeRef} type="button" data-plus="" className={`tc-btn is-round is-accent tc-plus${isDragging ? " is-hidden" : ""}`} {...attributes} {...listeners} onClick={onTap}>
				{children}
			</button>
		</>
	);
}
