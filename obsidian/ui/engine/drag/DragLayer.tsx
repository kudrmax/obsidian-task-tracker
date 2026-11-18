import {
	type ClientRect,
	type CollisionDetection,
	DndContext,
	type DragMoveEvent,
	DragOverlay,
	type DragStartEvent,
	type DropAnimation,
	defaultDropAnimationSideEffects,
	MeasuringStrategy,
	MouseSensor,
	pointerWithin,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { getEventCoordinates } from "@dnd-kit/utilities";
import { type ReactNode, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { acceptsDrop, carriedMiddle, type DropColumn, levelAt, placeAt } from "../../../../core/application/contracts";
import { DESIGN, LAYOUT } from "../../design";
import { useHost, useScreen } from "../ScreenContext";
import { Carried } from "./Carried";
import type { Aim, Lifted } from "./dragState";
import { DragGeometry, GeometryContext } from "./geometry";
import { liftBlock, liftCard } from "./lifting";
import { placedOf } from "./listDrag";

/** What a draggable tells the layer at the lift: which card, block, section or the plus it is. */
export type DragSource = { readonly kind: "card"; readonly column: DropColumn; readonly id: string } | { readonly kind: "block"; readonly id: string };

/** The carried copy settles into its place quickly and without a bounce; its width narrows to the card's as it lands. */
const DROP_MS = 180;
const DROP_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/**
 * What is under the pointer decides (dnd-kit's documented `pointerWithin`): a column's title before the list under it,
 * the timeline, a list; nothing outside every target.
 */
const underPointer: CollisionDetection = (args) => {
	const within = pointerWithin(args);
	const rank = (id: string) => (id.startsWith("title:") ? 0 : id === "timeline" ? 1 : 2);
	return [...within].sort((a, b) => rank(String(a.id)) - rank(String(b.id))).slice(0, 1);
};

/**
 * The screen's one `DndContext` (stage 0's configuration): mouse and touch sensors (a long press on the phone), measuring
 * while dragging, the carried copy in `DragOverlay` portalled to the view's own body. Where a card would land is the core's
 * on every pointer frame (`placeAt`, `levelAt`, `acceptsDrop`); the layer only reads where things stand and dispatches.
 */
export function DragLayer({ children }: { readonly children: ReactNode }) {
	const { store, win, haptics } = useHost();
	const longPressMs = useScreen((s) => s.settings.longPressMs);
	const aimKind = useScreen((s) => s.drag?.aim.kind ?? null);
	const geometry = useMemo(() => new DragGeometry(), []);
	const start = useRef<{ x: number; y: number } | null>(null);
	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: LAYOUT.dragStartDistance } }),
		useSensor(TouchSensor, { activationConstraint: { delay: longPressMs, tolerance: LAYOUT.pressTolerance } }),
	);

	const lift = ({ active, activatorEvent }: DragStartEvent) => {
		const source = active.data.current as DragSource | undefined;
		if (!source) return;
		const state = store.getState();
		const lifted: Lifted | null = source.kind === "card" ? liftCard(state, source.column, source.id) : liftBlock(state, source.id);
		if (!lifted) return;
		start.current = getEventCoordinates(activatorEvent);
		state.lift(lifted);
		haptics.tap();
	};

	const aimAt = ({ active, over, delta }: DragMoveEvent): Aim => {
		const drag = store.getState().drag;
		const carried = active.rect.current.translated;
		if (!drag || drag.lifted.kind !== "task" || !over || !carried) return { kind: "home" };
		const from = drag.lifted.from;
		const id = String(over.id);
		if (id.startsWith("title:")) {
			const column = id.slice("title:".length) as DropColumn;
			return acceptsDrop(column, [from]) ? { kind: "title", column } : { kind: "home" };
		}
		if (id === "timeline") {
			const timeline = geometry.timeline();
			if (!timeline || !acceptsDrop("timeline", [from])) return { kind: "home" };
			const minute = timeline.minuteAt(carried.top, over.rect.top);
			return { kind: "time", start: store.getState().snap(minute, timeline.hourPx) };
		}
		const column = id.slice("list:".length) as DropColumn;
		const shape = geometry.list(column);
		if (!shape || !acceptsDrop(column, [from])) return { kind: "home" };
		const pointer = start.current ? { x: start.current.x + delta.x, y: start.current.y + delta.y } : { x: carried.left, y: carried.top };
		return { kind: "gap", column, gap: gapIn(shape, column, over.rect, carried, pointer) };
	};

	/** The gap the core places the carried card in: its middle's height in the list, its left edge's depth, the gap held at its edge. */
	const gapIn = (shape: NonNullable<ReturnType<DragGeometry["list"]>>, column: DropColumn, list: ClientRect, carried: ClientRect, pointer: { x: number; y: number }) => {
		const drag = store.getState().drag;
		const room = drag?.aim.kind === "gap" && drag.aim.column === column ? drag.aim.gap : null;
		const { cards, heads, shift } = placedOf(shape.entries, shape.measured, store.getState().settings.cardGap);
		const grab = pointer.y - carried.top;
		const middle = carriedMiddle(pointer.y - list.top + shape.scrollTop - shape.padTop, grab, carried.height);
		const level = levelAt(carried.left, { left: list.left, width: list.width }, DESIGN.subtaskIndent);
		return placeAt(cards, middle, level, shift, room, heads, room, LAYOUT.dropHysteresis);
	};

	const dropAnimation: DropAnimation | null =
		aimKind === "title" || aimKind === "time"
			? null
			: {
					duration: DROP_MS,
					easing: DROP_EASING,
					keyframes: ({ transform, dragOverlay, active }) => [
						{ transform: `translate3d(${transform.initial.x}px, ${transform.initial.y}px, 0)`, width: `${dragOverlay.rect.width}px` },
						{ transform: `translate3d(${transform.final.x}px, ${transform.final.y}px, 0)`, width: `${active.rect.width}px` },
					],
					sideEffects: (params) => {
						const hide = defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })(params);
						return () => {
							hide?.();
							store.getState().landed();
						};
					},
				};
	const measuring = useMemo(() => ({ droppable: { strategy: MeasuringStrategy.WhileDragging } }), []);
	const lifted = useScreen((s) => (s.drag?.lifted.kind === "task" ? s.drag.lifted : null));

	return (
		<GeometryContext.Provider value={geometry}>
			<DndContext
				sensors={sensors}
				collisionDetection={underPointer}
				measuring={measuring}
				autoScroll={{ threshold: { x: 0, y: 0.15 }, acceleration: 8 }}
				onDragStart={lift}
				onDragMove={(event) => store.getState().aim(aimAt(event))}
				onDragEnd={() => {
					const drop = store.getState().drag?.aim.kind;
					void store.getState().release();
					if (drop === "title" || drop === "time") store.getState().landed();
					else haptics.tap();
				}}
				onDragCancel={() => store.getState().cancel()}
			>
				{children}
				{createPortal(<DragOverlay className="tc-overlay" dropAnimation={dropAnimation}>{lifted ? <Carried lifted={lifted} /> : null}</DragOverlay>, win.document.body)}
			</DndContext>
		</GeometryContext.Provider>
	);
}
