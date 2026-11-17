import {
	type CollisionDetection,
	closestCorners,
	pointerWithin,
	DndContext,
	type DragEndEvent,
	type DragMoveEvent,
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
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import { autoUpdate, flip, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDrag, useGesture } from "@use-gesture/react";
import useEmblaCarousel from "embla-carousel-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { AnimatePresence, motion, type MotionValue, useMotionValue, useSpring, useTransform } from "motion/react";
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Lethargy } from "lethargy";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { App } from "obsidian";
import { swipeLanding, type DropFrom } from "../core/application/contracts";
import { EmbeddedEditor, type EditorHost } from "../obsidian/ui/markdown/EmbeddedEditor";
import { type ColumnId, type ScreenState, type ScreenStore } from "./store";

/** Render counters the CDP scripts read: how often each component drew. */
export const counters = { card: new Map<string, number>(), wrapper: new Map<string, number>(), dropArea: new Map<string, number>(), column: new Map<string, number>(), block: new Map<string, number>(), face: new Map<string, number>(), screen: 0, editorMounts: 0 };
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

/** A stroke whose deltas stop this long has ended without a fling; its speed is read over the last `SPEED_WINDOW_MS`. */
const STROKE_QUIET_MS = 120;
const SPEED_WINDOW_MS = 50;
const SAME_STROKE_MS = 250;

/** Embla's scroll `duration` (its own unit, 20–60 in its docs; lower is quicker): short, for a decisive landing. */
const EMBLA_DURATION = 20;

/** The ribbon's landing: short and decisive, critically damped (about 250 ms to settle within a pixel). */
const RIBBON_SPRING = { stiffness: 1400, damping: 75, mass: 1 };

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

/**
 * What is under the pointer decides (dnd-kit's documented composition of `pointerWithin` and `closestCorners`): the time
 * grid, else a card, else the nearest card of the column the pointer is in; nothing outside any target. A block's overlay
 * is as wide as the timeline, so its corners must not choose a list on another place.
 */
const collision: CollisionDetection = (args) => {
	const within = pointerWithin(args);
	const grid = within.find((c) => c.id === "timeline");
	if (grid) return [grid];
	const cards = within.filter((c) => !String(c.id).startsWith("col:"));
	if (cards.length) return cards;
	const column = within.find((c) => String(c.id).startsWith("col:"));
	if (column) {
		const list = `list:${String(column.id).slice(4)}`;
		const near = closestCorners({ ...args, droppableContainers: args.droppableContainers.filter((d) => d.data.current?.sortable?.containerId === list) });
		return near.length ? near : [column];
	}
	return [];
};

/**
 * Over the time grid the overlay's top rides the pointer, so the time a person aims at with the pointer is the time the
 * card's top shows; it follows every pixel, the snap is the landing's (the preview), not the overlay's. A dnd-kit
 * modifier from the activator's coordinates, as its own `snapCenterToCursor` is built.
 */
const topAtPointerOnGrid: Modifier = ({ transform, draggingNodeRect, over, activatorEvent }) => {
	if (!draggingNodeRect || !over || over.id !== "timeline" || !activatorEvent) return transform;
	const at = getEventCoordinates(activatorEvent);
	if (!at) return transform;
	return { x: over.rect.left + BLOCK_LEFT - draggingNodeRect.left, y: transform.y + at.y - draggingNodeRect.top, scaleX: 1, scaleY: 1 };
};

/** Where a block's left edge stands in the timeline (`.tcs-block { left }`), and how much narrower than the timeline it is. */
const BLOCK_LEFT = 44;
const BLOCK_INSET = 50;

function containerOf(shown: Readonly<Record<ColumnId, readonly string[]>>, id: string): ColumnId | null {
	if (id.startsWith("col:")) return id.slice(4) as ColumnId;
	for (const col of Object.keys(shown) as ColumnId[]) if (shown[col].includes(id)) return col;
	return null;
}

function Ribbon() {
	const host = useHost();
	const { store } = host;
	const place = useScreen((s) => s.place);
	const origin = useRef<DropFrom | null>(null);
	const active = useScreen((s) => s.dragging);
	const overGrid = useScreen((s) => s.overGrid);
	const preview = useScreen((s) => s.preview);
	const hourPx = useScreen((s) => s.hourPx);
	const gridWidth = useScreen((s) => s.gridWidth);

	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));

	const onDragStart = ({ active }: DragStartEvent) => {
		const id = String(active.id);
		const s = store.getState();
		origin.current = id.startsWith("tl:") ? "timeline" : containerOf(s.columns, id);
		s.setShown({ ...s.columns });
		s.setDragging(id);
	};
	const onDragOver = ({ active, over }: DragOverEvent) => {
		const s = store.getState();
		s.setOverGrid(over?.id === "timeline");
		if (!over || !s.shown || String(active.id).startsWith("tl:") || over.id === "timeline") return;
		const from = containerOf(s.shown, String(active.id));
		const to = containerOf(s.shown, String(over.id));
		if (!from || !to || from === to) return;
		const target = s.shown[to];
		const overIndex = target.indexOf(String(over.id));
		const at = overIndex < 0 ? target.length : overIndex;
		s.setShown({ ...s.shown, [from]: s.shown[from].filter((v) => v !== active.id), [to]: [...target.slice(0, at), String(active.id), ...target.slice(at)] });
	};
	/** Minutes from the day's start at the overlay's top on the grid (the pointer, by the modifier). */
	const minuteOnGrid = (active: DragEndEvent["active"], over: NonNullable<DragEndEvent["over"]>) => (over.data.current as { minuteAt(y: number): number }).minuteAt(active.rect.current.translated?.top ?? 0);
	const onDragMove = ({ active, over }: DragMoveEvent) => {
		const s = store.getState();
		const id = String(active.id);
		s.setPreview(over?.id === "timeline" ? { id: id.startsWith("tl:") ? id.slice(3) : id, from: origin.current!, minute: minuteOnGrid(active, over) } : null);
	};
	const onDragEnd = function ({ active, over }: DragEndEvent) {
		const s = store.getState();
		const id = String(active.id);
		const taskId = id.startsWith("tl:") ? id.slice(3) : id;
		const from = origin.current!;
		s.setPreview(null);
		if (over?.id === "timeline") {
			void s.dropAtTime(taskId, from, minuteOnGrid(active, over));
			return;
		}
		if (over && id.startsWith("tl:")) {
			const col = containerOf(s.shown ?? s.columns, String(over.id));
			if (col) {
				void s.dropFromTimeline(taskId, col, String(over.id).startsWith("col:") ? null : String(over.id));
				return;
			}
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
		store.getState().setPreview(null);
		store.getState().setOverGrid(false);
		store.getState().setShown(null);
		store.getState().setDragging(null);
	};

	const mode = useScreen((s) => s.ribbon);
	const progress = useMotionValue(place === 2 ? 1 : 0);
	const pages = useMemo(
		() => (
			<>
				<Page index={0} span={0.5}>
					<div className="tcs-stack">
						<Column col="inbox" />
						<Column col="backlog" />
					</div>
				</Page>
				<Page index={1} span={0.5}>
					<Column col="soon" />
				</Page>
				<Page index={2} span={1}>
					<DayPlace />
				</Page>
			</>
		),
		[],
	);
	const measuringMode = useScreen((s) => s.measuring);
	const measuring = useMemo(() => ({ droppable: { strategy: MEASURING[measuringMode] } }), [measuringMode]);
	const modifiers = useMemo(() => [topAtPointerOnGrid], []);

	return (
		<DndContext sensors={sensors} collisionDetection={collision} measuring={measuring} modifiers={modifiers} onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
			<DayProgress.Provider value={progress}>{mode === "embla" ? <EmblaRibbon pages={pages} progress={progress} /> : <LethargyRibbon pages={pages} progress={progress} />}</DayProgress.Provider>
			{createPortal(
				<DragOverlay className="tcs-overlay" dropAnimation={overGrid ? null : DROP}>
					{active ? <Lifted active={active} block={overGrid && preview ? { width: gridWidth - BLOCK_INSET, height: Math.max(18, (((preview.end ?? preview.start + 15) - preview.start) / 60) * hourPx) } : null} /> : null}
				</DragOverlay>,
				host.root.ownerDocument.body,
			)}
		</DndContext>
	);
}

const MEASURING = { always: MeasuringStrategy.Always, whileDragging: MeasuringStrategy.WhileDragging, beforeDragging: MeasuringStrategy.BeforeDragging } as const;

/**
 * The card in the overlay, by the id it is given: dnd-kit keeps the overlay's last children through its drop animation,
 * so nothing in them may follow the store's lifted id, which the drop clears at once.
 */
const Lifted = memo(function Lifted({ active, block }: { active: string; block: { width: number; height: number } | null }) {
	const id = active.startsWith("tl:") ? active.slice(3) : active;
	if (block)
		return (
			<div data-overlay={id} className="tcs-block tcs-block-overlay" style={{ width: block.width, height: block.height }}>
				<div className="tcs-block-body">
					<Face id={id} />
				</div>
			</div>
		);
	return (
		<div data-overlay={id}>
			<Face id={id} overlay />
		</div>
	);
});

/** The overlay settles into the card's place quickly and without changing size; the card is there the frame it ends. */
const DROP = { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" };

/** Where each place stands on the ribbon: Inbox–Soon at 0, Soon–Now half a window on, Now–calendar a whole window on. */
const placeOffsets = (width: number) => [0, width / 2, width];

/** How far the ribbon stands from Soon–Now towards Now–calendar, 0..1: the day list's width follows it. */
const DayProgress = createContext<MotionValue<number> | null>(null);

const progressOf = (offset: number, width: number) => Math.max(0, Math.min(1, (offset - width / 2) / (width / 2)));

/**
 * B: the ribbon on @use-gesture with Lethargy telling a trackpad stroke from its momentum tail. A stroke draws the ribbon
 * with it (one place at most); at the first inertial delta (or when the deltas stop) the fingers have lifted and the
 * core's `swipeLanding` decides; a short spring lands it; the tail moves nothing. Touch: use-gesture's drag.
 */
function LethargyRibbon({ pages, progress }: { pages: ReactNode; progress: MotionValue<number> }) {
	const { store, width, win } = useHost();
	const place = useScreen((s) => s.place);
	const offsets = placeOffsets(width);
	const x = useSpring(-offsets[place], RIBBON_SPRING);
	useEffect(() => x.on("change", (v) => progress.set(progressOf(-v, width))), [x, progress, width]);
	useEffect(() => x.set(-placeOffsets(width)[place]), [place, width, x]);
	const stability = useScreen((s) => s.lethargyStability);
	const lethargy = useMemo(() => new Lethargy(stability), [stability]);
	const stroke = useRef<{ dir: number; from: number; moved: number; samples: [number, number][]; lifted: boolean; liftedAt: number } | null>(null);
	const quiet = useRef(0);
	const fingerSpeed = useRef(0);
	const bounds = () => {
		const at = store.getState().place;
		return { left: -offsets[Math.min(PLACES - 1, at + 1)], right: -offsets[Math.max(0, at - 1)] };
	};
	const settle = (moved: number, speed: number) => {
		const from = store.getState().place;
		const neighbour = offsets[Math.min(PLACES - 1, from + Math.sign(moved || 1))] - offsets[from] || width / 2;
		const step = swipeLanding(moved, Math.abs(neighbour), speed);
		const next = Math.max(0, Math.min(PLACES - 1, from + step));
		store.getState().setPlace(next);
		x.set(-offsets[next]);
		return step;
	};
	const lift = (why: string) => {
		const s = stroke.current;
		if (!s || s.lifted) return;
		s.lifted = true;
		s.liftedAt = s.samples[s.samples.length - 1]?.[0] ?? 0;
		win.clearTimeout(quiet.current);
		const last = s.samples[s.samples.length - 1]?.[0] ?? 0;
		const recent = s.samples.filter(([t]) => t >= last - SPEED_WINDOW_MS);
		const span = Math.max(16, last - (recent[0]?.[0] ?? last) + 8);
		const speed = recent.reduce((sum, [, d]) => sum + d, 0) / span;
		const step = settle(s.moved, speed);
		store.getState().logSwipe({ dir: s.dir, moved: Math.round(s.moved), speed: +speed.toFixed(2), step, why, events: s.samples.length, at: performance.now() });
	};
	const wheelStroke = (e: WheelEvent) => {
		if (e.ctrlKey || e.metaKey || store.getState().dragging) return;
		if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
		e.preventDefault();
		const intent = lethargy.check({ deltaY: -e.deltaX });
		const dir = Math.sign(e.deltaX);
		let s = stroke.current;
		/** No hand makes two swipes the same way this close: deltas that way right after a decision are its stroke's. */
		const sameStroke = s?.lifted && s.dir === dir && e.timeStamp - s.liftedAt < SAME_STROKE_MS;
		if (intent && !sameStroke && (!s || s.lifted || s.dir !== dir)) {
			if (s && !s.lifted) lift("reverse");
			s = stroke.current = { dir, from: store.getState().place, moved: 0, samples: [], lifted: false, liftedAt: 0 };
		}
		if (!s || s.lifted) return;
		if (!intent) return lift("inertia");
		s.moved += e.deltaX;
		s.samples.push([e.timeStamp, e.deltaX]);
		const b = bounds();
		x.jump(Math.max(b.left, Math.min(b.right, -offsets[s.from] - s.moved)));
		win.clearTimeout(quiet.current);
		quiet.current = win.setTimeout(() => lift("quiet"), STROKE_QUIET_MS);
	};
	const bind = useGesture(
		{
			onDrag: ({ offset: [ox], velocity: [vx], direction: [dx], last, cancel, event }) => {
				if (store.getState().dragging || (event as PointerEvent).pointerType === "mouse") return cancel();
				/** The finger's speed as it let go is the last move's: the release event itself carries no movement of its own. */
				if (!last) fingerSpeed.current = -vx * dx;
				if (last) {
					const moved = -offsets[store.getState().place] - ox;
					const step = settle(moved, fingerSpeed.current);
					store.getState().logSwipe({ dir: Math.sign(moved), moved: Math.round(moved), speed: +fingerSpeed.current.toFixed(2), step, why: "touch", events: 0, at: performance.now() });
				}
				else x.jump(ox);
			},
			onWheel: ({ event }) => wheelStroke(event as WheelEvent),
		},
		{
			drag: { axis: "x", threshold: 10, filterTaps: true, from: () => [-offsets[store.getState().place], 0], bounds, rubberband: true },
			wheel: { eventOptions: { passive: false } },
			window: win,
		},
	);
	return (
		<div className="tcs-ribbon" {...bind()}>
			<motion.div className="tcs-track" style={{ x }}>
				{pages}
			</motion.div>
		</div>
	);
}

/**
 * A: the ribbon as Embla Carousel with its wheel-gestures plugin, as their docs set one step per swipe: snaps at the
 * places, `skipSnaps: false`, `containScroll`, a short `duration`. Embla decides where a swipe lands (its own release
 * force); the core's `swipeLanding` cannot be plugged in. A mouse drag is the cards', not the ribbon's: Embla takes only
 * the plugin's synthetic mouse events and touch.
 */
function EmblaRibbon({ pages, progress }: { pages: ReactNode; progress: MotionValue<number> }) {
	const { store, width } = useHost();
	const watchDrag = useCallback((_api: unknown, evt: MouseEvent | TouchEvent) => !store.getState().dragging && !(evt.type.startsWith("mouse") && evt.isTrusted), [store]);
	const [ref, api] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps", skipSnaps: false, duration: EMBLA_DURATION, startIndex: store.getState().place, watchDrag }, [WheelGesturesPlugin({ forceWheelAxis: "x" })]);
	useEffect(() => {
		if (!api) return;
		const onScroll = () => progress.set(progressOf(api.scrollProgress() * width, width));
		const onSelect = () => {
			const before = store.getState().place;
			const next = api.selectedScrollSnap();
			if (next !== before) {
				store.getState().logSwipe({ dir: next - before, moved: 0, speed: 0, step: next - before, why: "embla", events: 0, at: performance.now() });
				store.getState().setPlace(next);
			}
		};
		api.on("scroll", onScroll).on("select", onSelect).on("reInit", onScroll);
		onScroll();
		const off = store.subscribe((s, prev) => {
			if (s.place !== prev.place && api.selectedScrollSnap() !== s.place) api.scrollTo(s.place);
			/**
			 * A card lifted by a long press: Embla had already taken the touch (its `watchDrag` is asked only at the press),
			 * so it is told to let go (`reInit` with `watchDrag: false`, its documented switch) and back after the drop;
			 * otherwise the ribbon moves under the sortable lists and dnd-kit re-sorts without end.
			 */
			if (!!s.dragging !== !!prev.dragging) api.reInit({ watchDrag: s.dragging ? false : watchDrag, startIndex: api.selectedScrollSnap() });
		});
		return () => {
			api.off("scroll", onScroll).off("select", onSelect).off("reInit", onScroll);
			off();
		};
	}, [api, store, progress, width]);
	return (
		<div className="tcs-ribbon tcs-embla" ref={ref}>
			<div className="tcs-track">{pages}</div>
		</div>
	);
}

/** Measurement only: with `onlyCurrent` a page away from the shown place mounts nothing, to see what the other places cost a drag. */
function Page({ index, span, children }: { index: number; span: number; children: ReactNode }) {
	const { width: full } = useHost();
	const width = full * span;
	const away = useScreen((s) => s.onlyCurrent && s.place !== index);
	return (
		<div className="tcs-page" style={{ width }}>
			{away ? null : children}
		</div>
	);
}

const ROW_PX = 33;

/**
 * A column: its rows built here, handed as children to the parts that follow the drag (droppable, sortable context), so
 * a drag re-renders those parts and the thin sortable wrappers, never the rows. Virtualized with TanStack Virtual when
 * the store says so (the documented fixed-size list, all ids in the SortableContext, the mounted ones rendered).
 */
const Column = memo(function Column({ col }: { col: ColumnId }) {
	count(counters.column, col);
	const all = useScreen((s) => (s.shown ?? s.columns)[col]);
	const truth = useScreen((s) => s.columns[col]);
	const virtual = useScreen((s) => s.virtual);
	const scroller = useRef<HTMLDivElement | null>(null);
	const v = useVirtualizer({ count: all.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_PX, overscan: 3, getItemKey: (i) => all[i], enabled: virtual });
	const rows = virtual ? v.getVirtualItems().map((item) => all[item.index]) : all;
	const offset = virtual ? (v.getVirtualItems()[0]?.start ?? 0) : 0;
	const { store } = useHost();
	const alive = useCallback((id: string) => id in store.getState().items, [store]);
	const list = (
		<AnimatePresence initial={false} mode="popLayout" custom={alive}>
			{rows.map((id) => (
				<Row key={id} id={id} order={truth} />
			))}
		</AnimatePresence>
	);
	return (
		<div className="tcs-column" data-col={col}>
			<div className="tcs-column-title">
				{col} {all.length}
			</div>
			<DropArea col={col} scroller={scroller}>
				<SortableContext id={`list:${col}`} items={all as unknown as string[]} strategy={verticalListSortingStrategy}>
					{virtual ? (
						<div style={{ height: v.getTotalSize(), position: "relative" }}>
							<div style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${offset}px)` }}>{list}</div>
						</div>
					) : (
						list
					)}
				</SortableContext>
			</DropArea>
		</div>
	);
});

/** The column's scroller as dnd-kit's droppable: re-renders with the drag, its children (the rows) do not. */
function DropArea({ col, scroller, children }: { col: ColumnId; scroller: { current: HTMLDivElement | null }; children: ReactNode }) {
	count(counters.dropArea, col);
	const { setNodeRef } = useDroppable({ id: `col:${col}` });
	const ref = useCallback(
		(el: HTMLDivElement | null) => {
			scroller.current = el;
			setNodeRef(el);
		},
		[scroller, setNodeRef],
	);
	return (
		<div className="tcs-column-scroll" ref={ref}>
			{children}
		</div>
	);
}

/**
 * How a row leaves, decided when it leaves (AnimatePresence's `custom`): a task still on the screen has moved, its row
 * goes at once (the card is already at its new place); a task gone from the screen fades.
 */
const rowVariants = (id: string) => ({
	gone: (alive: (id: string) => boolean) => (alive(id) ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96 }),
});

/** A row: Motion's element (layout on the reads, enter for a task new in the last read), the drag's state from the store. */
const Row = memo(function Row({ id, order }: { id: string; order: readonly string[] }) {
	count(counters.card, id);
	const lifted = useScreen((s) => s.dragging === id);
	const fresh = useScreen((s) => s.added.has(id));
	const variants = useMemo(() => rowVariants(id), [id]);
	return (
		<motion.div
			className="tcs-card-outer"
			layout={lifted ? false : "position"}
			layoutId={id}
			layoutCrossfade={false}
			layoutDependency={order}
			initial={fresh ? { opacity: 0, scale: 0.96 } : false}
			animate={{ opacity: 1, scale: 1 }}
			variants={variants}
			exit="gone"
			transition={SPRING}
		>
			<SortableCard id={id} />
		</motion.div>
	);
});

/** The thin sortable wrapper: dnd-kit's transform and listeners around the memoized face; the part a drag re-renders. */
function SortableCard({ id }: { id: string }) {
	count(counters.wrapper, id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	return (
		<div ref={setNodeRef} className={`tcs-card-inner ${isDragging ? "is-placeholder" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }} data-id={id} {...attributes} {...listeners}>
			<Face id={id} />
		</div>
	);
}

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
	const progress = useContext(DayProgress)!;
	/** At Soon–Now the day list is half the window, at Now–calendar the divider's width; in between it follows the ribbon. */
	const dayWidth = useTransform(() => width / 2 + (w.get() - width / 2) * progress.get());
	const bind = useDrag(
		({ offset: [ox], last }) => {
			w.set(ox);
			if (last) store.getState().setListWidth(ox);
		},
		{ from: () => [w.get(), 0], bounds: { left: 120, right: width - 120 }, axis: "x", window: win },
	);
	return (
		<div className="tcs-day">
			<motion.div className="tcs-day-list" style={{ width: dayWidth }}>
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
	const scroller = useRef<HTMLDivElement | null>(null);
	const grid = useRef<HTMLDivElement>(null);
	/**
	 * The droppable is the timeline as seen (its scroller), not the whole day's grid, which reaches far above and below the
	 * visible part; the minute under a point is read from the grid's place as it stands at that moment.
	 */
	const data = useMemo(() => ({ minuteAt: (y: number) => ((y - (grid.current?.getBoundingClientRect().top ?? 0)) / store.getState().hourPx) * 60 }), [store]);
	const { setNodeRef } = useDroppable({ id: "timeline", data });
	const { width } = useHost();
	const listWidth = useScreen((s) => s.listWidth);
	useEffect(() => {
		const el = scroller.current;
		if (el) store.getState().setGridWidth(el.clientWidth);
	}, [store, width, listWidth]);
	const scrollerRef = useCallback(
		(el: HTMLDivElement | null) => {
			scroller.current = el;
			setNodeRef(el);
		},
		[setNodeRef],
	);
	/** The minute under the pointer when a zoom step began and where the pointer stood in the scroller: kept in place. */
	const anchor = useRef<{ minute: number; offset: number } | null>(null);
	useGesture(
		{
			onPinch: ({ offset: [scale], origin: [, oy], first, memo }) => {
				const el = scroller.current;
				if (!el) return memo;
				/** Fixed for the whole gesture (use-gesture's `memo`), so no step's rounding carries into the next. */
				const fixed = first || !memo ? { minute: ((el.scrollTop + (oy - el.getBoundingClientRect().top)) / store.getState().hourPx) * 60, offset: oy - el.getBoundingClientRect().top } : memo;
				anchor.current = fixed;
				store.getState().setHourPx(56 * scale);
				return fixed;
			},
		},
		{ target: scroller, pinch: { scaleBounds: { min: 0.5, max: 4 }, from: () => [store.getState().hourPx / 56, 0] }, eventOptions: { passive: false }, window: win },
	);
	/** Pointer-anchored zoom: the time under the pointer stays under it (scrollTop set before the frame is painted). */
	useLayoutEffect(() => {
		const el = scroller.current;
		const a = anchor.current;
		if (!el || !a) return;
		el.scrollTop = (a.minute / 60) * hourPx - a.offset;
		anchor.current = null;
	}, [hourPx]);
	return (
		<div className="tcs-timeline" ref={scrollerRef}>
			<div className="tcs-grid" ref={grid} style={{ height: 24 * hourPx }}>
				{Array.from({ length: 24 }, (_, h) => (
					<div key={h} className="tcs-hour" style={{ top: h * hourPx, height: hourPx }}>
						{(h + dayStartHour) % 24}:00
					</div>
				))}
				<Preview hourPx={hourPx} />
				<NowLine hourPx={hourPx} />
				{ids.map((id) => (
					<Block key={id} id={id} hourPx={hourPx} />
				))}
			</div>
		</div>
	);
}

/** The red line at the present minute (docs/plugin/screen.md, «Линия «сейчас»»), from the core's `openAt`; it moves every minute. */
function NowLine({ hourPx }: { hourPx: number }) {
	const { store, win } = useHost();
	const now = useScreen((s) => s.now);
	useEffect(() => {
		const id = win.setInterval(() => store.getState().tickNow(), 15000);
		store.getState().tickNow();
		return () => win.clearInterval(id);
	}, [store, win]);
	if (now === null) return null;
	return <div className="tcs-now" style={{ top: (now / 60) * hourPx }} />;
}

/** Where the card will land, the core's span for the snapped minute under the pointer, drawn as the block will stand. */
function Preview({ hourPx }: { hourPx: number }) {
	const span = useScreen((s) => s.preview);
	if (!span) return null;
	const end = span.end ?? span.start + 15;
	return <div className="tcs-block tcs-block-preview" style={{ top: (span.start / 60) * hourPx, height: Math.max(18, ((end - span.start) / 60) * hourPx) }} />;
}

const Block = memo(function Block({ id, hourPx }: { id: string; hourPx: number }) {
	count(counters.block, id);
	const { store, win } = useHost();
	const slot = useScreen(useShallow((s) => ({ shown: s.items[id]?.slot != null || id in s.landed, start: s.spanOf(id)?.start ?? 0, end: s.spanOf(id)?.end ?? null, read: `${s.items[id]?.slot?.date}-${s.items[id]?.slot?.start}-${s.items[id]?.slot?.end}` })));
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
			layoutDependency={slot.read}
			transition={SPRING}
			style={{ top: (span.start / 60) * hourPx, height: Math.max(18, ((span.end - span.start) / 60) * hourPx) }}
		>
			<div className="tcs-block-body" ref={setNodeRef} data-block={id} {...listeners} {...attributes}>
				<Face id={id} />
			</div>
			<div className="tcs-block-handle" data-handle={id} {...bind()} />
		</motion.div>
	);
});
