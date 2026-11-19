import { closestCenter, type CollisionDetection, DndContext, defaultDropAnimationSideEffects, getClientRect, getFirstCollision, type MeasuringConfiguration, pointerWithin, rectIntersection, type UniqueIdentifier, useDndContext, useDroppable, type DragEndEvent, type DragMoveEvent, type DragOverEvent, DragOverlay, type DragStartEvent, type DropAnimation, MouseSensor, PointerSensor, TouchSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, type SortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { type CSSProperties, memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Destination, ListId, Row } from "../port";
import { useScreen, useScreenApi } from "../store";
import { descendantsOf, finalOrder, levelAt, levelBetween, spotKey, shiftOf, type Slot, slotOf, SwipeLevel } from "./tree";

/**
 * Drag and drop (spec, «The owners»): one `DndContext` per screen, one `DragOverlay`, one `onDragEnd` that makes one write
 * through the port. Classic dnd-kit used as stage 0 settled it («Recommended configuration», «Integration findings»,
 * «Drop flicker»): the default measuring, the overlay in a portal to the view's own `document.body` with its card given
 * its id as a prop, sortable items keeping their identity; the target is what is under the pointer, else the row nearest
 * the carried card in its own list (`pointerWithin`, `closestCenter`).
 */

/** The mouse lifts a card once it moved this far; the finger once it held still this long (the plugin's long press) within this tolerance. */
const MOUSE_DISTANCE_PX = 4;

/** The plus is carried by this id: on its button, and as a row of the list it is over. */
export const PLUS = "plus";
/** The plus, or the calendar's new place: either opens a new task's field where it is let go. */
const isPlus = (id: UniqueIdentifier): boolean => id === PLUS || id === NEW_SLOT;

/** Whether a touch starts on the plus: it moves at once, a card only after the long press. */
const onPlus = (event: Event): boolean => (event.target as Element | null)?.closest?.("[data-plus]") != null;

/**
 * Empty time on the calendar is carried as a new task's place (F101): a long press there (the mouse: a drag) lifts it at
 * that minute, it follows the finger by the snap step, and let go the new task's field opens where it stands. A press on
 * something of its own there (a block, an event, a dot, a field) is that thing's.
 */
export const NEW_SLOT = "new-slot";
const ownPress = (event: Event, context: SensorContext | undefined): boolean => context?.active.id === NEW_SLOT && (event.target as Element | null)?.closest?.("[data-own-press]") != null;
/** What dnd-kit tells a sensor's activator besides the event: the draggable it would lift. */
type SensorContext = { readonly active: { readonly id: UniqueIdentifier } };

/**
 * Sensors as dnd-kit's custom sensors are made (a sensor's activators filter what may start it). A card is lifted by the
 * mouse or by the long press of a finger (touch events); the plus moves at once under a finger (the old plugin's F175),
 * started by the pointer events of a touch on it, so the two never listen to the same event (dnd-kit keeps one listener
 * per event name).
 */
class CardTouchSensor extends TouchSensor {
	static override activators = TouchSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1], context?: SensorContext) => !onPlus(event.nativeEvent) && !ownPress(event.nativeEvent, context) && activator.handler(event, options) }));
}
class CardMouseSensor extends MouseSensor {
	static override activators = MouseSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1], context?: SensorContext) => !ownPress(event.nativeEvent, context) && activator.handler(event, options) }));
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

/** Where the pointer took the carried task, from its box's top left corner. */
export interface Grab {
	readonly x: number;
	readonly y: number;
}

/** What the carried task lands as: its level, whether it is a block of the calendar, and the box of its place (dnd-kit's measure); null before measured. */
export interface Landing {
	readonly level: number;
	readonly block: boolean;
	readonly width: number | null;
	readonly height: number | null;
}

/**
 * The carried card, told where the pointer took it and what it lands as, so the plate is drawn around that point and,
 * let go, flies in as the task where it lands: the pressing event, the lifted box and the place's box are dnd-kit's own
 * (`useDndContext`, as its `snapCenterToCursor` modifier reads them).
 */
function Carried({ id, carried }: { readonly id: string; readonly carried: DragProps["carried"] }) {
	const { activatorEvent, activeNodeRect, active } = useDndContext();
	/**
	 * What it lands as, kept as it stood when it was let go: the drop clears the carried state at once, while the copy still
	 * flies into its place, and the copy keeps the shape it flies to.
	 */
	const level = useScreen((s) => (s.lifted === null ? null : (s.liftedDepth ?? 0)));
	const landing = useRef<Landing>({ level: 0, block: false, width: null, height: null });
	if (level !== null) landing.current = { level, block: active?.data.current?.sortable?.containerId === CALENDAR, width: activeNodeRect?.width ?? null, height: activeNodeRect?.height ?? null };
	/**
	 * Where the pointer took the task is a fact of the lift: kept from the first measure of the lifted box. dnd-kit measures
	 * the task again wherever it stands later (in another list it is another row), and that box no longer says where it was
	 * taken.
	 */
	const grab = useRef<Grab | null>(null);
	const at = activatorEvent ? getEventCoordinates(activatorEvent) : null;
	if (grab.current === null && at && activeNodeRect) grab.current = { x: at.x - activeNodeRect.left, y: at.y - activeNodeRect.top };
	return <>{carried(id, grab.current ?? { x: 0, y: 0 }, landing.current)}</>;
}

export interface DragProps {
	/** The view's own document: the overlay goes on its body (a pop-out window has its own). */
	readonly doc: Document;
	/**
	 * How the carried task is drawn, by its id, where the pointer took it, and what it lands as: let go, it flies into its
	 * place in the shape of the task there, indent, width and all, or as the block on the calendar.
	 */
	readonly carried: (id: string, grab: Grab, landing: Landing) => ReactNode;
	/** How the carried plus is drawn. */
	readonly plus: ReactNode;
	/** A tick under the finger as a card lifts: the host's haptics. */
	readonly onLift: () => void;
	readonly children: ReactNode;
}

export function Drag({ doc, carried, plus, onLift, children }: DragProps) {
	const api = useScreenApi();
	const sensors = useSensors(
		useSensor(CardMouseSensor, { activationConstraint: { distance: MOUSE_DISTANCE_PX } }),
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
	/** Where the pointer is, as dnd-kit gives it to the collision detection. */
	const pointer = useRef<{ readonly x: number; readonly y: number } | null>(null);
	const justMoved = useRef(false);
	const lists = useScreen((s) => s.shown.lists);
	const plusAt = useScreen((s) => s.plusAt);
	/** The other list is drawn with the card (or the plus) in it: from now on the pointer decides again. */
	useEffect(() => {
		justMoved.current = false;
	}, [lists, plusAt]);
	const collision: CollisionDetection = useCallback((args) => {
		pointer.current = args.pointerCoordinates;
		const underPointer = pointerWithin(args);
		/** Over the calendar the target is the calendar itself: the card's place there is at the minute under its top, among no rows. */
		const onCalendar = underPointer.some((hit) => hit.id === CALENDAR_TARGET || hit.id === CALENDAR_ROOM);
		if (onCalendar) {
			lastOver.current = CALENDAR_TARGET;
			return [{ id: CALENDAR_TARGET }];
		}
		/** The plus back over its ring (where the button stood as it was lifted) is over nothing: let go there, nothing opens (the old plugin's F176). */
		const ring = args.active.rect.current.initial;
		const at = args.pointerCoordinates;
		if (args.active.id === PLUS && ring && at && at.x >= ring.left && at.x <= ring.right && at.y >= ring.top && at.y <= ring.bottom) return [];
		/** The calendar's new place stays the calendar's: off it, it stands where it last stood there. */
		if (args.active.id === NEW_SLOT) return [];
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
	const [origin, setOrigin] = useState<(Slot & { readonly container: string; readonly depth: number; readonly at: number | null }) | null>(null);
	/** The minute the carried card's place stands at on the calendar, while it stands there. */
	const carriedAt = useRef<number | null>(null);
	/** A block's start when it was lifted, and the minute its top read there (null until first read over the calendar). */
	const liftAt = useRef<number | null>(null);
	/** How far under the carried task's top the pointer took it, once dnd-kit has measured the task. */
	const grabbedAt = useRef<number | null>(null);
	const homeTop = useRef<number | null>(null);
	/** The carried card is over a place that refuses it: its place is home, its level its own, and let go it flies back. */
	const refusedNow = useRef(false);

	const rowsOf = (list: string) => api.getState().shown.lists[list as ListId]?.rows ?? [];
	/** The carried card's (or plus's) level on the place it stands at, by its sideways swipes there (`SwipeLevel`). */
	const swipe = useRef(new SwipeLevel(null, 0, 0, 0));
	const sideLevel = (event: { readonly activatorEvent: Event; readonly delta: { readonly x: number } }, spot: string, allowed: (wanted: number) => number): number => swipe.current.at((getEventCoordinates(event.activatorEvent)?.x ?? 0) + event.delta.x, performance.now(), spot, allowed);
	/** The level the carried plus's field would take where the plus stands now among its list's rows: drawn by its place. */
	const plusLevel = (plus: Sortable, over: Sortable | null, wanted: number): number | null => {
		const container = containerOf(plus);
		if (container === null) return null;
		const rows = rowsOf(container);
		const byId = new Map(rows.map((row) => [row.id, row]));
		const order = itemsOf(plus).map((id): Row => byId.get(id) ?? { kind: "task", id, depth: 0 });
		return levelAt(order, PLUS, over ? String(over.id) : PLUS, wanted);
	};
	/** The level the carried card takes where it stands now, among the rows of its list, its own subtasks folded away. */
	const projected = (lifted: Sortable, over: Sortable | null, wanted: number): number | null => {
		const container = containerOf(lifted);
		if (container === null) return null;
		const id = String(lifted.id);
		const rows = rowsOf(container);
		const under = descendantsOf(rows, id);
		const visible = under.size === 0 ? rows : rows.filter((row) => !under.has(row.id));
		return levelAt(visible, id, over ? String(over.id) : id, wanted);
	};
	/**
	 * The carried plus comes into a list the way a card crosses into another (dnd-kit's «multiple containers»): it becomes
	 * that list's row at the place under the pointer, and from then on the rows part around it as they do for a card. Over
	 * no list, it is no list's row.
	 */
	const plusOver = (event: { readonly activatorEvent: Event; readonly delta: { readonly x: number; readonly y: number }; readonly active: Sortable & { readonly rect: { readonly current: { readonly translated: { readonly top: number } | null } } } }, over: (Sortable & { readonly rect: { readonly top: number; readonly height: number }; readonly data: { readonly current?: unknown } }) | null) => {
		if (over?.id === CALENDAR_TARGET) {
			api.getState().setPlusAt(null);
			/**
			 * The new task's place stands with its top at the pointer: where the finger is, the field opens. The pointer as
			 * the collision detection last read it, in the window's terms as the canvas's measure is (the event's delta counts
			 * the calendar's scroll once more for something carried in from outside it).
			 */
			const top = pointer.current?.y;
			const minute = top === undefined ? null : ((over.data.current as CalendarData | undefined)?.minuteAt(top - over.rect.top) ?? null);
			if (minute !== null) api.getState().setPlusMinute(minute);
			return;
		}
		if (event.active.id === NEW_SLOT) return;
		api.getState().setPlusMinute(null);
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
	/** The plus let go in a list: the field opens where the rows parted for it, at the level its swipes there set. */
	const dropPlus = (event: DragEndEvent) => {
		const list = containerOf(event.active);
		const order = orderAfter(event.active, event.over);
		const minute = api.getState().plusMinute;
		api.getState().setPlusAt(null);
		api.getState().setPlusMinute(null);
		api.getState().release("drag");
		if (minute !== null) return api.getState().openEntry({ list: "day", before: null, dayOffset: api.getState().dayOffset, at: minute });
		/** Let go over nothing (its ring, between the columns), the plus opens nothing. */
		if (list === null || event.over === null || event.active.id === NEW_SLOT) return;
		const rows = rowsOf(list);
		const index = order.indexOf(PLUS);
		const near = (id: string | undefined) => rows.find((row) => row.id === id);
		const depth = sideLevel(event, spotKey(list, order, PLUS), (wanted) => levelBetween(near(order[index - 1]), near(order[index + 1]), wanted));
		api.getState().openEntry({ list: list as ListId, ...slotOf(rows, order, PLUS), dayOffset: api.getState().dayOffset, depth });
	};
	/**
	 * Over a place that refuses the card, its place goes back where it was taken (the screen as read): let go there, it
	 * flies back and nothing is written.
	 */
	const refused = () => {
		refusedNow.current = true;
		carriedAt.current = origin?.at ?? null;
		const before = api.getState().shown;
		api.getState().carryHome();
		if (api.getState().shown !== before) justMoved.current = true;
		api.getState().setLiftedDepth(origin?.depth ?? null);
	};
	/**
	 * Over the calendar the card's place is its block, at the minute the calendar reads under the carried plate's top (its
	 * time scale and scroll are its own): the screen draws the port's preview of the task there, as it does in a list.
	 */
	const overCalendar = (event: { readonly activatorEvent: Event; readonly active: Sortable & { readonly rect: { readonly current: { readonly translated: { readonly top: number } | null; readonly initial: { readonly top: number } | null } } } }, over: { readonly rect: { readonly top: number }; readonly data: { readonly current?: unknown } }) => {
		const id = String(event.active.id);
		const minuteAt = (over.data.current as CalendarData | undefined)?.minuteAt;
		/** The carried task's top: the pointer less where it took the task (both in the window's terms, as the canvas's measure). */
		const initial = event.active.rect.current.initial?.top;
		if (grabbedAt.current === null && initial !== undefined) grabbedAt.current = (getEventCoordinates(event.activatorEvent)?.y ?? 0) - initial;
		const top = pointer.current === null || grabbedAt.current === null ? undefined : pointer.current.y - grabbedAt.current;
		if (!minuteAt || top === undefined) return;
		/** A block taken from a stack stands below its time: its top read where it was taken is its own start, so brought back there it writes nothing. */
		if (liftAt.current !== null && homeTop.current === null && initial !== undefined) homeTop.current = minuteAt(initial - over.rect.top);
		const read = minuteAt(top - over.rect.top);
		const at = read !== null && read === homeTop.current ? liftAt.current : read;
		if (at === null) return;
		if (at === carriedAt.current && containerOf(event.active) === CALENDAR) {
			refusedNow.current = false;
			return;
		}
		const to: Destination = { list: "day", before: null, dayOffset: api.getState().dayOffset, at };
		if (!api.getState().takes(id, to)) return refused();
		refusedNow.current = false;
		if (containerOf(event.active) !== CALENDAR) justMoved.current = true;
		carriedAt.current = at;
		api.getState().carryInto(id, to);
	};
	/** The column the pointer is over, for the auto-scroll's quarter-second wait: the calendar, or a list (its row's or its own). */
	const columnOf = (over: DragMoveEvent["over"]): string | null => {
		if (!over) return null;
		const id = String(over.id);
		if (id === CALENDAR_TARGET || id === CALENDAR_ROOM) return CALENDAR;
		if (id.startsWith(LIST_TARGET)) return id.slice(LIST_TARGET.length);
		return containerOf(over as unknown as Sortable);
	};
	const move = (event: DragMoveEvent) => {
		const { active: lifted, over } = event;
		api.getState().scrollOver(columnOf(over));
		if (isPlus(lifted.id)) {
			plusOver(event, over);
			if (lifted.id === NEW_SLOT || over?.id === CALENDAR_TARGET) return;
		} else if (over?.id === CALENDAR_TARGET) overCalendar(event, over);
		if (refusedNow.current) return;
		const container = containerOf(lifted);
		if (container === null) return api.getState().setLiftedDepth(null);
		if (container === CALENDAR) return api.getState().setLiftedDepth(0);
		const allowed = (wanted: number) => (lifted.id === PLUS ? plusLevel(lifted, over, wanted) : projected(lifted, over, wanted)) ?? 0;
		api.getState().setLiftedDepth(sideLevel(event, spotKey(container, orderAfter(lifted, over), String(lifted.id)), allowed));
	};

	const start = (event: DragStartEvent) => {
		const { active: lifted } = event;
		const screen = api.getState();
		if (!screen.claim("drag")) return;
		justMoved.current = false;
		lastOver.current = null;
		refusedNow.current = false;
		const liftX = getEventCoordinates(event.activatorEvent)?.x ?? 0;
		grabbedAt.current = null;
		swipe.current = new SwipeLevel(null, 0, liftX, performance.now());
		if (isPlus(lifted.id)) {
			screen.openEntry(null);
			screen.select(null);
			setActive(String(lifted.id));
			return onLift();
		}
		screen.lift(String(lifted.id));
		setActive(String(lifted.id));
		const container = containerOf(lifted);
		const rows = container === null ? [] : rowsOf(container);
		const own = rows.find((row) => row.id === String(lifted.id));
		const depth = own?.kind === "task" ? own.depth : 0;
		const under = descendantsOf(rows, String(lifted.id));
		if (container !== null) swipe.current = new SwipeLevel(spotKey(container, itemsOf(lifted).filter((other) => !under.has(other)), String(lifted.id)), depth, liftX, performance.now());
		const block = container === CALENDAR ? (screen.shown.day.blocks.find((b) => b.id === String(lifted.id)) ?? null) : null;
		carriedAt.current = block?.start ?? null;
		liftAt.current = block?.start ?? null;
		homeTop.current = null;
		setOrigin(container === null ? null : { container, ...slotOf(rows, itemsOf(lifted), String(lifted.id)), depth, at: block?.start ?? null });
		onLift();
	};
	/**
	 * Over another list, the card moves into it at once, as dnd-kit's «multiple containers» example does: the screen draws
	 * the port's preview of the card there, and that list's cards part around its place.
	 */
	const overList = (event: DragOverEvent) => {
		const { active: lifted, over } = event;
		api.getState().scrollOver(columnOf(over));
		if (isPlus(lifted.id)) return plusOver(event, over);
		if (over?.id === CALENDAR_TARGET) return overCalendar(event, over);
		const into = crossing(lifted, over);
		if (!into) {
			/** Back over its own list the card is no longer refused: its place goes where the pointer is, as in any list. */
			if (over && (containerOf(over) === containerOf(lifted) || String(over.id) === `${LIST_TARGET}${containerOf(lifted)}`)) refusedNow.current = false;
			return;
		}
		const rows = rowsOf(into.list);
		const id = String(lifted.id);
		const order = [...into.order.slice(0, into.index), id, ...into.order.slice(into.index)];
		const to: Destination = { list: into.list as ListId, ...slotOf(rows, order, id), dayOffset: api.getState().dayOffset, depth: sideLevel(event, spotKey(into.list, order, id), (wanted) => levelBetween(rows[into.index - 1], rows[into.index], wanted)) };
		if (!api.getState().takes(id, to)) return refused();
		refusedNow.current = false;
		carriedAt.current = null;
		justMoved.current = true;
		api.getState().carryInto(id, to);
	};
	const end = (event: DragEndEvent) => {
		const { active: lifted, over } = event;
		setActive(null);
		if (isPlus(lifted.id)) return dropPlus(event);
		const id = String(lifted.id);
		const container = containerOf(lifted);
		if (container === null || refusedNow.current) return api.getState().drop(id, null);
		if (container === CALENDAR) {
			const at = carriedAt.current;
			const to: Destination | null = at === null ? null : { list: "day", before: null, dayOffset: api.getState().dayOffset, at };
			const still = to === null || (origin !== null && origin.container === CALENDAR && origin.at === at) || !api.getState().takes(id, to);
			return api.getState().drop(id, still ? null : to);
		}
		const depth = sideLevel(event, spotKey(container, orderAfter(lifted, over), id), (wanted) => projected(lifted, over, wanted) ?? 0);
		const slot = slotOf(rowsOf(container), orderAfter(lifted, over), id);
		const still = origin !== null && origin.container === container && origin.section === slot.section && origin.before === slot.before && origin.depth === depth;
		const to: Destination = { list: container as ListId, ...slot, dayOffset: api.getState().dayOffset, depth };
		api.getState().drop(id, still || !api.getState().takes(id, to) ? null : to);
	};
	const cancel = () => {
		if (active !== null && isPlus(active)) {
			api.getState().setPlusAt(null);
			api.getState().setPlusMinute(null);
			api.getState().release("drag");
		} else if (active) api.getState().drop(active, null);
		setActive(null);
	};

	const armed = useScreen((s) => s.scrollArmed);
	const autoScroll = useMemo(() => ({ ...AUTO_SCROLL, enabled: armed }), [armed]);
	return (
		<DndContext sensors={sensors} collisionDetection={collision} onDragStart={start} onDragMove={move} onDragOver={overList} onDragEnd={end} onDragCancel={cancel} autoScroll={autoScroll} measuring={MEASURING}>
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
 * down only (the columns never slide under a carried card); enabled once the card has stood over the column a quarter
 * second (`scrollArmed`, F162).
 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.15 } };

/** The calendar's blocks as dnd-kit's container: a carried block stands among them, and a card carried onto it joins them. */
export const CALENDAR = "calendar";
/** The calendar's drop target: its canvas of hours, inside the room it scrolls in, so dnd-kit's auto-scroll scrolls that room. */
const CALENDAR_TARGET = "calendar:";
/** The room the calendar scrolls in, a droppable only for dnd-kit to measure it: it stands still on the screen while its hours scroll. */
const CALENDAR_ROOM = "calendar-room:";

/** What the calendar tells the drag: the start a carried task's top at `top` on the screen takes; null before the room is measured. */
interface CalendarData {
	readonly minuteAt: (y: number) => number;
}

/**
 * The calendar as a drop target: `room` goes on the element it scrolls in (a droppable only for the pointer to be over the
 * calendar and for dnd-kit's auto-scroll to scroll it), `canvas` on its hours inside it. `minuteAt` turns a height under
 * the canvas's top (dnd-kit's measure of the canvas as it stands, scrolled) into a start by the calendar's time scale.
 */
export function useCalendarDrop(minuteAt: (y: number) => number): { readonly room: (element: HTMLElement | null) => void; readonly canvas: (element: HTMLElement | null) => void } {
	const room = useDroppable({ id: CALENDAR_ROOM });
	const canvas = useDroppable({ id: CALENDAR_TARGET, data: { minuteAt } satisfies CalendarData });
	return { room: room.setNodeRef, canvas: canvas.setNodeRef };
}

/** The calendar's empty time as the new task's place a long press lifts (`NEW_SLOT`): its node and listeners go on the calendar's canvas. */
export function useNewSlot(): { readonly ref: (element: HTMLElement | null) => void; readonly listeners: ReturnType<typeof useDraggable>["listeners"] } {
	const { setNodeRef, listeners } = useDraggable({ id: NEW_SLOT });
	return { ref: setNodeRef, listeners };
}

/** The calendar's blocks as dnd-kit's «multiple containers» container: its items stand still, each block placed by its minute. */
export function CalendarBlocks({ ids, children }: { readonly ids: readonly string[]; readonly children: ReactNode }) {
	return (
		<SortableContext id={CALENDAR} items={ids as string[]} strategy={STAND_STILL}>
			{children}
		</SortableContext>
	);
}

/** A placed row never animates a change of its index: its own box glides. */
const STAY = () => false;

/** The calendar's blocks never part: each stands at its minute. */
const STAND_STILL: SortingStrategy = () => null;

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
	const strategy = useMemo(() => finalOrderStrategy(ids), [ids]);
	return (
		<SortableContext id={list} items={ids as string[]} strategy={strategy}>
			{children}
		</SortableContext>
	);
}

/**
 * A list's own drop target, for when no row of it is under the pointer: the whole room the list scrolls in, the empty
 * room under its last card included (Decision 27: a block carried under Today's last card stays on the calendar
 * otherwise). Goes on the list's scroller.
 */
export function useListTarget(list: ListId, ids: readonly string[]): (element: HTMLElement | null) => void {
	return useDroppable({ id: `${LIST_TARGET}${list}`, data: { items: ids } }).setNodeRef;
}

/**
 * A row of a list in dnd-kit's sortable list: the thin wrapper dnd-kit draws again around the memoized card (stage 0,
 * second round). A task's card is carried by it; lifted, it stays where the card will land, as the gap (spec, «Decided»).
 * A section's header moves aside like cards but is not carried (`onTap` absent): a card goes after it into its section.
 * A calendar's block is `placed`: its box says where it stands, so dnd-kit never moves it (its box glides by CSS).
 */
export const SortableRow = memo(function SortableRow({ id, onTap, gap = false, placed = false, children }: { readonly id: string; readonly onTap?: (target: Element) => void; readonly gap?: boolean; readonly placed?: boolean; readonly children: ReactNode }) {
	const carried = onTap !== undefined;
	const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id, disabled: { draggable: !carried, droppable: false }, animateLayoutChanges: placed ? STAY : undefined });
	const style: CSSProperties = placed ? {} : { transform: CSS.Translate.toString(transform), transition };
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

/** A row counts as this tall while it is not mounted (a card and its gap at the default size). */
const ROW_ESTIMATE_PX = 37;

/**
 * dnd-kit's sorting strategy for a list, as its strategies are written (`SortingStrategy`): each row moves to where the
 * list's final order puts it once the carried card is let go where it stands (`finalOrder`), the rows in flow one under
 * another, so what the rows show while the card is held is what the list will be. Headers move aside like cards: under
 * an empty section's header the card's place opens as it does anywhere.
 */
function finalOrderStrategy(ids: readonly string[]): SortingStrategy {
	let key = "";
	let final: readonly string[] = ids;
	return ({ activeIndex, overIndex, index, rects, activeNodeRect }) => {
		if (activeIndex < 0) return null;
		const nextKey = `${activeIndex}:${overIndex}`;
		if (nextKey !== key) {
			key = nextKey;
			final = finalOrder(ids, activeIndex, overIndex);
		}
		const id = ids[index];
		const heightOf = (other: string) => {
			const at = ids.indexOf(other);
			return rects[at]?.height ?? (at === activeIndex ? activeNodeRect?.height : undefined) ?? ROW_ESTIMATE_PX;
		};
		const y = shiftOf(id, ids, final, heightOf);
		return y === 0 ? null : { x: 0, y, scaleX: 1, scaleY: 1 };
	};
}
