import {
	type CollisionDetection,
	closestCorners,
	pointerWithin,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	MeasuringStrategy,
	MouseSensor,
	TouchSensor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type { Modifier } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { useDrag, useGesture } from "@use-gesture/react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "motion/react";
import { createContext, memo, useContext, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { App } from "obsidian";
import { swipeLanding, type DropFrom } from "../core/application/contracts";
import { EmbeddedEditor, type EditorHost } from "../obsidian/ui/markdown/EmbeddedEditor";
import { type ColumnId, type ScreenState, type ScreenStore } from "./store";

/** Render counters the CDP scripts read: how often each component drew. */
export const counters = { card: new Map<string, number>(), column: new Map<string, number>(), block: new Map<string, number>(), face: new Map<string, number>(), screen: 0, editorMounts: 0 };
const count = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);

export interface Host {
	readonly store: ScreenStore;
	readonly app: App | null;
	readonly editorHost: EditorHost;
	readonly win: Window;
	readonly root: HTMLElement;
	readonly width: number;
	readonly phone: boolean;
	readonly dayStartHour: number;
}

const HostContext = createContext<Host | null>(null);
const useHost = () => useContext(HostContext)!;
function useScreen<T>(selector: (s: ScreenState) => T): T {
	return useStore(useHost().store, selector);
}

const SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
const PLACES = 3;

export function SpikeScreen(host: Host) {
	counters.screen++;
	return (
		<HostContext.Provider value={host}>
			<div className={`tcs-screen ${host.phone ? "is-phone" : ""}`} onTouchStart={keepFromObsidian} onTouchMove={keepFromObsidian} onTouchEnd={keepFromObsidian} onTouchCancel={keepFromObsidian}>
				<Toolbar />
				<Ribbon />
			</div>
		</HostContext.Provider>
	);
}

/** Obsidian's phone opens its side drawers on a sideways swipe: the screen's touches stay the screen's (as the current host does). */
const keepFromObsidian = (e: { stopPropagation(): void }) => e.stopPropagation();

function Toolbar() {
	const host = useHost();
	const reads = useScreen((s) => s.reads);
	useScreen((s) => s.tick);
	return (
		<div className="tcs-toolbar">
			<Menu />
			{host.app ? <EditorField /> : null}
			<span className="tcs-stat" data-reads={reads}>
				reads {reads}
			</span>
		</div>
	);
}

/** Obsidian's own editor: made once, kept through every render of its parent. */
function EditorField() {
	const host = useHost();
	const el = useRef<HTMLDivElement>(null);
	const [text, setText] = useState("");
	useEffect(() => {
		let editor: EmbeddedEditor | null = null;
		editor = new EmbeddedEditor(host.app!, host.editorHost, "", el.current!, "", { onChange: () => setText(editor?.value ?? "") });
		counters.editorMounts++;
		(host.win as unknown as { tcsEditor: EmbeddedEditor }).tcsEditor = editor;
		return () => editor?.destroy();
	}, [host.app, host.editorHost, host.win]);
	return (
		<div className="tcs-editor-wrap">
			<div className="tcs-editor" ref={el} />
			<span className="tcs-echo" data-text={text}>
				{text.length}
			</span>
		</div>
	);
}

function Menu() {
	const host = useHost();
	const [open, setOpen] = useState(false);
	const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: setOpen, placement: "bottom-start", middleware: [offset(6), flip(), shift({ padding: 8 })], whileElementsMounted: autoUpdate });
	const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context), useRole(context, { role: "menu" })]);
	const run = (action: (s: ScreenState) => unknown) => {
		setOpen(false);
		void action(host.store.getState());
	};
	return (
		<>
			<button className="tcs-menu-button" ref={refs.setReference} {...getReferenceProps()}>
				Menu
			</button>
			{open ? (
				<FloatingPortal root={host.root}>
					<div className="tcs-menu" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
						<button onClick={() => run((s) => s.moveFirstInboxToSoon())}>First Inbox task to Soon</button>
						<button onClick={() => run((s) => s.moveLastSoonToInbox())}>Last Soon task to Inbox</button>
						<button onClick={() => run((s) => s.setPlace((s.place + 1) % PLACES))}>Next place</button>
					</div>
				</FloatingPortal>
			) : null}
		</>
	);
}

/** The time grid wins under the pointer; elsewhere the sortable lists' closest corners (dnd-kit's documented composition). */
const collision: CollisionDetection = (args) => {
	const within = pointerWithin(args);
	const grid = within.find((c) => c.id === "timeline");
	return grid ? [grid] : closestCorners(args);
};

/** The overlay's top on the time grid's own lines, `step` pixels apart: a dnd-kit modifier over the droppable's rect. */
const snapToGrid =
	(step: number): Modifier =>
	({ transform, draggingNodeRect, over }) => {
		if (!draggingNodeRect || !over || over.id !== "timeline") return transform;
		const top = draggingNodeRect.top + transform.y;
		const snapped = over.rect.top + Math.round((top - over.rect.top) / step) * step;
		return { ...transform, y: transform.y + snapped - top };
	};

function containerOf(shown: Readonly<Record<ColumnId, readonly string[]>>, id: string): ColumnId | null {
	if (id.startsWith("col:")) return id.slice(4) as ColumnId;
	for (const col of Object.keys(shown) as ColumnId[]) if (shown[col].includes(id)) return col;
	return null;
}

function Ribbon() {
	const host = useHost();
	const { store, width, win } = host;
	const place = useScreen((s) => s.place);
	const x = useSpring(-place * width, SPRING);
	const origin = useRef<DropFrom | null>(null);
	const [active, setActive] = useState<string | null>(null);
	const hourPx = useScreen((s) => s.hourPx);

	useEffect(() => x.set(-place * width), [place, width, x]);

	const settle = (moved: number, speed: number) => {
		const from = store.getState().place;
		const step = swipeLanding(moved, width, speed);
		const next = Math.max(0, Math.min(PLACES - 1, from + step));
		store.getState().setPlace(next);
		x.set(-next * width);
	};
	/** The ribbon moves at most one place either way of where the gesture began: use-gesture's bounds, rubber-banded. */
	const bounds = () => {
		const at = store.getState().place;
		return { left: -Math.min(PLACES - 1, at + 1) * width, right: -Math.max(0, at - 1) * width };
	};
	const bind = useGesture(
		{
			onDrag: ({ offset: [ox], velocity: [vx], direction: [dx], last, cancel, event }) => {
				if (store.getState().dragging || (event as PointerEvent).pointerType === "mouse") return cancel();
				if (last) settle(-store.getState().place * width - ox, -vx * dx);
				else x.jump(ox);
			},
			onWheel: ({ offset: [ox], velocity: [vx], direction: [dx], last }) => {
				if (store.getState().dragging) return;
				if (last) settle(ox - store.getState().place * width, vx * dx);
				else x.jump(-ox);
			},
		},
		{
			drag: { axis: "x", threshold: 10, filterTaps: true, from: () => [-store.getState().place * width, 0], bounds, rubberband: true },
			wheel: { axis: "x", from: () => [store.getState().place * width, 0], bounds: () => { const b = bounds(); return { left: -b.right, right: -b.left }; }, rubberband: true },
			window: win,
		},
	);

	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

	const onDragStart = ({ active }: DragStartEvent) => {
		const id = String(active.id);
		const s = store.getState();
		const node = host.root.querySelector(`[data-block="${id.slice(3)}"], [data-id="${id}"]`) as HTMLElement | null;
		(win as unknown as { tcsStart: unknown }).tcsStart = { initial: active.rect.current.initial?.top, node: node?.getBoundingClientRect().top, outer: (node?.parentElement as HTMLElement | null)?.style.transform };
		origin.current = id.startsWith("tl:") ? "timeline" : containerOf(s.columns, id);
		setActive(id);
		s.setShown({ ...s.columns });
		s.setDragging(id);
	};
	const onDragOver = ({ active, over }: DragOverEvent) => {
		const s = store.getState();
		if (!over || !s.shown || String(active.id).startsWith("tl:") || over.id === "timeline") return;
		const from = containerOf(s.shown, String(active.id));
		const to = containerOf(s.shown, String(over.id));
		if (!from || !to || from === to) return;
		const target = s.shown[to];
		const overIndex = target.indexOf(String(over.id));
		const at = overIndex < 0 ? target.length : overIndex;
		s.setShown({ ...s.shown, [from]: s.shown[from].filter((v) => v !== active.id), [to]: [...target.slice(0, at), String(active.id), ...target.slice(at)] });
	};
	const onDragEnd = function ({ active, over }: DragEndEvent) {
		const s = store.getState();
		const id = String(active.id);
		const taskId = id.startsWith("tl:") ? id.slice(3) : id;
		const from = origin.current!;
		setActive(null);
		if (over?.id === "timeline") {
			const top = active.rect.current.translated?.top ?? 0;
			(win as unknown as { tcsDrop: unknown }).tcsDrop = { top, overTop: over.rect.top, initial: active.rect.current.initial?.top, delta: (arguments[0] as DragEndEvent).delta, grid: (host.root.querySelector(".tcs-grid") as HTMLElement).getBoundingClientRect().top };
			s.setDragging(null);
			void s.dropAtTime(taskId, from, ((top - over.rect.top) / s.hourPx) * 60);
			return;
		}
		if (!over || !s.shown || id.startsWith("tl:")) {
			s.setShown(null);
			s.setDragging(null);
			return;
		}
		const col = containerOf(s.shown, id)!;
		let list = s.shown[col];
		const overIndex = list.indexOf(String(over.id));
		if (overIndex >= 0) list = arrayMove([...list], list.indexOf(id), overIndex);
		s.setShown({ ...s.shown, [col]: list });
		s.setDragging(null);
		const next = list[list.indexOf(id) + 1];
		const prev = list[list.indexOf(id) - 1];
		const group = (next ? s.items[next]?.group : undefined) ?? (prev ? s.items[prev]?.group : undefined) ?? null;
		void s.drop(taskId, from, { kind: "place", column: col, place: { kind: "task", group, before: next ? s.items[next].key : null } });
	};
	const onDragCancel = () => {
		setActive(null);
		store.getState().setShown(null);
		store.getState().setDragging(null);
	};

	const mode = useScreen((s) => s.ribbon);
	const snapRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = snapRef.current;
		if (el && Math.round(el.scrollLeft / width) !== place) el.scrollTo({ left: place * width, behavior: "smooth" });
	}, [mode, place, width]);
	const pages = (
		<>
			<Page>
				<Column col="inbox" />
				<Column col="backlog" />
				<Column col="soon" />
			</Page>
			<Page>
				<DayPlace />
			</Page>
			<Page>
				<div className="tcs-place-3">Place 3</div>
			</Page>
		</>
	);
	const step = hourPx / 4;
	const modifiers = [snapToGrid(step)];

	return (
		<DndContext sensors={sensors} collisionDetection={collision} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
			{mode === "snap" ? (
				<div className="tcs-ribbon-snap" ref={snapRef} onScrollEnd={(e) => store.getState().setPlace(Math.round(e.currentTarget.scrollLeft / width))}>
					<div className="tcs-track" style={{ width: width * PLACES }}>
						{pages}
					</div>
				</div>
			) : (
				<div className="tcs-ribbon" {...bind()}>
					<motion.div className="tcs-track" style={{ x, width: width * PLACES }}>
						{pages}
					</motion.div>
				</div>
			)}
			{createPortal(
				<DragOverlay modifiers={modifiers}>{active ? <div data-overlay={active.startsWith("tl:") ? active.slice(3) : active}><Face id={active.startsWith("tl:") ? active.slice(3) : active} overlay /></div> : null}</DragOverlay>,
				host.root.ownerDocument.body,
			)}
		</DndContext>
	);
}

function Page({ children }: { children: ReactNode }) {
	const { width } = useHost();
	return (
		<div className="tcs-page" style={{ width }}>
			{children}
		</div>
	);
}

function Column({ col }: { col: ColumnId }) {
	count(counters.column, col);
	const all = useScreen((s) => (s.shown ?? s.columns)[col]);
	const mounted = useStore(useHost().store, (s) => s.mounted);
	const ids = useMemo(() => (Number.isFinite(mounted) ? all.slice(0, mounted) : all), [all, mounted]);
	const truth = useScreen((s) => s.columns[col]);
	const { setNodeRef } = useDroppable({ id: `col:${col}` });
	return (
		<div className="tcs-column" data-col={col}>
			<div className="tcs-column-title">
				{col} {ids.length}
			</div>
			<div className="tcs-column-scroll" ref={setNodeRef}>
				<SortableContext items={ids as unknown as string[]} strategy={verticalListSortingStrategy}>
					<AnimatePresence initial={false} mode="popLayout">
						{ids.map((id) => (
							<Card key={id} id={id} order={truth} />
						))}
					</AnimatePresence>
				</SortableContext>
			</div>
		</div>
	);
}

/** A card: the outer element is Motion's (layout, enter, exit), the inner one dnd-kit's (sorting transform). */
const Card = memo(function Card({ id, order }: { id: string; order: readonly string[] }) {
	count(counters.card, id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	return (
		<motion.div
			className="tcs-card-outer"
			layout={!isDragging}
			layoutId={isDragging ? undefined : id}
			layoutDependency={order}
			initial={isDragging ? false : { opacity: 0, scale: 0.96 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={isDragging ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }}
			transition={SPRING}
		>
			<div ref={setNodeRef} className={`tcs-card-inner ${isDragging ? "is-placeholder" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }} data-id={id} {...attributes} {...listeners}>
				<Face id={id} />
			</div>
		</motion.div>
	);
});

const Face = memo(function Face({ id, overlay }: { id: string; overlay?: boolean }) {
	count(counters.face, id);
	const face = useScreen((s) => s.faces[id]);
	if (!face) return null;
	return (
		<div className={`tcs-card ${overlay ? "is-overlay" : ""} ${face.status === "done" ? "is-done" : ""}`} style={face.tint ? { borderLeftColor: face.tint } : undefined}>
			{face.title}
		</div>
	);
});

function DayPlace() {
	const { width, win, store } = useHost();
	const listWidth = useScreen((s) => s.listWidth);
	const w = useMotionValue(listWidth);
	const bind = useDrag(
		({ offset: [ox], last }) => {
			w.set(ox);
			if (last) store.getState().setListWidth(ox);
		},
		{ from: () => [w.get(), 0], bounds: { left: 120, right: width - 120 }, axis: "x", window: win },
	);
	return (
		<div className="tcs-day">
			<motion.div className="tcs-day-list" style={{ width: w }}>
				<Column col="day" />
			</motion.div>
			<div className="tcs-divider" {...bind()} />
			<Timeline />
		</div>
	);
}

function Timeline() {
	const { store, win } = useHost();
	const ids = useScreen((s) => s.slotted);
	const hourPx = useScreen((s) => s.hourPx);
	const dayStartHour = useHost().dayStartHour;
	const { setNodeRef, isOver } = useDroppable({ id: "timeline" });
	const scroller = useRef<HTMLDivElement>(null);
	useGesture(
		{
			onPinch: ({ offset: [scale] }) => store.getState().setHourPx(Math.round(56 * scale)),
		},
		{ target: scroller, pinch: { scaleBounds: { min: 0.5, max: 4 }, from: () => [store.getState().hourPx / 56, 0] }, eventOptions: { passive: false }, window: win },
	);
	return (
		<div className="tcs-timeline" ref={scroller}>
			<div className={`tcs-grid ${isOver ? "is-over" : ""}`} ref={setNodeRef} style={{ height: 24 * hourPx }}>
				{Array.from({ length: 24 }, (_, h) => (
					<div key={h} className="tcs-hour" style={{ top: h * hourPx, height: hourPx }}>
						{(h + dayStartHour) % 24}:00
					</div>
				))}
				{ids.map((id) => (
					<Block key={id} id={id} hourPx={hourPx} />
				))}
			</div>
		</div>
	);
}

const Block = memo(function Block({ id, hourPx }: { id: string; hourPx: number }) {
	count(counters.block, id);
	const { store, win } = useHost();
	const slot = useScreen(useShallow((s) => ({ shown: s.items[id]?.slot != null, start: s.spanOf(id)?.start ?? 0, end: s.spanOf(id)?.end ?? null })));
	const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `tl:${id}` });
	const [held, setHeld] = useState<{ start: number; end: number } | null>(null);
	const end = slot.end ?? slot.start + 15;
	const bind = useDrag(
		({ movement: [, my], last }) => {
			const minute = end + (my / hourPx) * 60;
			if (last) {
				setHeld(null);
				void store.getState().resize(id, minute);
			} else setHeld(store.getState().stretch(id, minute));
		},
		{ axis: "y", window: win },
	);
	if (!slot.shown) return null;
	const span = held ?? { start: slot.start, end };
	return (
		<motion.div
			className={`tcs-block ${isDragging ? "is-placeholder" : ""}`}
			layout={held ? false : "position"}
			layoutDependency={`${slot.start}-${slot.end}`}
			transition={SPRING}
			style={{ top: (span.start / 60) * hourPx, height: Math.max(14, ((span.end - span.start) / 60) * hourPx) }}
		>
			<div className="tcs-block-body" ref={setNodeRef} data-block={id} {...listeners} {...attributes}>
				<Face id={id} />
			</div>
			<div className="tcs-block-handle" data-handle={id} {...bind()} />
		</motion.div>
	);
});
