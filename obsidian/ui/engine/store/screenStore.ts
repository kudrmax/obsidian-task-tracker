import { DESIGN } from "../../design";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Destination, Edge, ListId, MenuItem, Now, ScreenData, ScreenPort } from "../port";
import { share } from "./share";

/** Where the ribbon stands: Inbox–Soon, Soon–the day, the day–its calendar. */
export type Stop = "inbox" | "soon" | "calendar";
export const STOPS: readonly Stop[] = ["inbox", "soon", "calendar"];

/** The one gesture that holds the pointer (spec, «Which gesture holds the pointer»). */
export type Gesture = "drag" | "ribbon" | "resize" | "zoom";

/** Where the calendar was zoomed to: an hour's height, or the whole day whatever the calendar's height. */
export type Zoom = number | "wholeDay";

/** An open layer (spec, «Layers and focus»): the task's menu, with what the port offers in it. */
export type Layer = { readonly kind: "menu"; readonly id: string; readonly items: readonly MenuItem[] };

export interface ScreenState {
	/** What the screen draws: the last read, or a drop's preview until its write is read back. */
	readonly shown: ScreenData;
	/** The last read: the order the rows glide by (Motion's `layoutDependency`, stage 0 «Integration findings» 3). */
	readonly read: ScreenData;
	/**
	 * The days the screen turned away from, as they stood, by their offset: each region still sliding out draws its own
	 * day, however fast the strokes came. The last few only: a region is gone within one slide.
	 */
	readonly left: Readonly<Record<number, { readonly shown: ScreenData; readonly read: ScreenData }>>;
	/** The shown day, in days from today, and the way it last turned (the day's slide). */
	readonly dayOffset: number;
	readonly dayWay: -1 | 0 | 1;
	readonly stop: Stop;
	readonly gesture: Gesture | null;
	/** The task carried now. */
	readonly lifted: string | null;
	/** The level the carried task would take where it stands now (its swipes there, `SwipeLevel`); null: its own. */
	readonly liftedDepth: number | null;
	/** Data came while a drag or its write held the screen still: read once they end. */
	readonly pending: boolean;
	/** The present minute from today's start, ticking each minute (spec, «Time»). */
	readonly now: Now;
	readonly layer: Layer | null;
	/** The new task's field: where it stands (the slot a typed task is written to), open while not null. */
	readonly entry: Destination | null;
	/** Where the carried plus would open the field: a list and the index among its rows, where they part for it. */
	readonly plusAt: { readonly into: ListId; readonly index: number } | null;
	/** Where the carried plus would open the field on the calendar: a minute of the shown day, where its place stands. */
	readonly plusMinute: number | null;
	/**
	 * Whether a carried card may scroll the room it is over (F162, the plugin's `AutoScroll`): only once it has headed into
	 * the room's edge and stayed there a quarter second; heading away, it stops.
	 */
	readonly scrollArmed: boolean;
	/** The calendar's zoom (spec, «Time scale»): kept on the device by the host. */
	readonly zoom: Zoom;
	/** The calendar's selected task: its two dots show, to resize it (F102); a tap elsewhere lets it go. */
	readonly selected: string | null;
	/** The task being resized by a dot, and which: its moving edge's time shows on a pill. */
	readonly resizing: { readonly id: string; readonly edge: "start" | "end" } | null;
	/** Counts the fields opened: each new one (after Enter) is a fresh, empty field. */
	readonly entrySeq: number;
	/** Tasks new in the last read: their rows come in; a row merely scrolled into sight does not. */
	readonly fresh: ReadonlySet<string>;
	/** A task to bring into sight in its list, once per `seq`. */
	readonly reveal: { readonly id: string; readonly seq: number } | null;
}

export interface ScreenActions {
	/** The ribbon one stop on (1) or back (-1); past the day's calendar, the days. */
	step(shift: -1 | 1): void;
	setStop(stop: Stop): void;
	/** Takes the pointer for `gesture` unless another holds it; whether it got it. A drag takes it from the ribbon (its long press already proved the ribbon still, dnd-kit's activation constraint), never from a pinch or a resize. */
	claim(gesture: Gesture): boolean;
	release(gesture: Gesture): void;
	lift(id: string): void;
	/** The carried task's level where it would land, as its swipes there set it. */
	setLiftedDepth(depth: number | null): void;
	/** The carried task drawn in another list while carried: the port's preview of it there (dnd-kit's «multiple containers»). */
	carryInto(id: string, to: Destination): void;
	/** Whether `to` takes the carried task (the port's answer): a place that refuses opens no place. */
	takes(id: string, to: Destination): boolean;
	/** The carried task's place back where it was taken: the screen as read, as over a place that refuses it. */
	carryHome(): void;
	/** The carried task let go at `to` (null: cancelled, or let go where nothing takes it). */
	drop(id: string, to: Destination | null): void;
	openMenu(id: string): void;
	closeLayer(): void;
	act(id: string, item: string): void;
	setPlusAt(at: { readonly into: ListId; readonly index: number } | null): void;
	setPlusMinute(minute: number | null): void;
	setZoom(zoom: Zoom): void;
	/** The edge the carried card heads into (`room:edge`; null: none): a new one waits a quarter second before it may scroll. */
	scrollToward(edge: string | null): void;
	/** A minute of the day as the clock writes it (the port's): «14:15». */
	clockOf(minute: number): string;
	/** Selects a task on the calendar (null: none). */
	select(id: string | null): void;
	/** A dot taken: the menu closes and the task is drawn as the port stretches it while the dot is pulled (`resizeTo`). */
	startResize(id: string, edge: Edge): void;
	resizeTo(id: string, edge: Edge, minute: number): void;
	/**
	 * The dot let go at `minute` (null: the pull cancelled, the task put back): what the port says it writes, written;
	 * `least`, the minutes of the shortest length kept. Whether anything was written.
	 */
	endResize(id: string, edge: Edge, minute: number | null, least: number): boolean;
	/** Opens the new task's field at `at`, or at the port's place for new tasks; null closes it. */
	openEntry(at?: Destination | null): void;
	/** The field one level deeper (1) or shallower (-1), as Tab and Shift+Tab do. */
	indentEntry(by: -1 | 1): void;
	/**
	 * The typed text written as a task where the field stands. With `next`, a new empty field opens right under it (batch
	 * typing); empty text ends typing instead (a subtask's field steps one level out first).
	 */
	commitEntry(text: string, next: boolean): Promise<void>;
	/** Starts following the port and the clock; returns the stop. Called by the screen as it mounts. */
	start(): () => void;
}

export type Screen = ScreenState & ScreenActions;
export type ScreenStore = StoreApi<Screen>;

const MINUTE_MS = 60_000;
/** How long a carried card stays at a room's edge it headed into before the room scrolls under it (F162: a quarter second). */
const SCROLL_DWELL_MS = 250;
/** Days kept for regions sliding out: as many as fast strokes can leave sliding at once. */
const LEFT_KEPT = 4;

/** Gestures during which data that arrives waits (spec, principle 5): what the finger holds stays still under it. */
const HOLDING: readonly (Gesture | null)[] = ["drag", "resize"];

/** One store per mounted screen, over its port (spec, «Screen state»); `zoom`, the calendar's zoom the host kept. */
export function createScreenStore(port: ScreenPort, zoom: Zoom = DESIGN.hourPx): ScreenStore {
	/** Writes of the screen's own not yet read back: their reads come together once the last is in. */
	let writing = 0;
	/** The screen as it stood when the carried task was lifted: its place's home, a drop's in-flight write drawn in it. */
	let home: ScreenData | null = null;
	/** The edge a carried card heads into, and the wait before its room may scroll. */
	let scrollEdge: string | null = null;
	let scrollWait = 0;
	const first = port.read(0);
	return createStore<Screen>()((set, get) => {
		/** The port's data again; held while a drag or a drop's write keeps the screen still (spec, principle 5). */
		const refresh = () => {
			const s = get();
			if (HOLDING.includes(s.gesture) || writing > 0) {
				if (!s.pending) set({ pending: true });
				return;
			}
			const next = share(s.read, port.read(s.dayOffset));
			const known = s.read.cards;
			const fresh = new Set(Object.keys(next.cards).filter((id) => !(id in known)));
			set({ read: next, shown: share(s.shown, next), pending: false, fresh: fresh.size === 0 && s.fresh.size === 0 ? s.fresh : fresh });
		};

		const write = (done: Promise<unknown>) => {
			writing++;
			void done.finally(() => {
				writing--;
				refresh();
			});
		};

		const turnDay = (shift: -1 | 1) => {
			const { dayOffset: from, shown, read } = get();
			const dayOffset = from + shift;
			const next = port.read(dayOffset);
			const kept = Object.entries(get().left).filter(([day]) => Math.abs(Number(day) - dayOffset) <= LEFT_KEPT);
			set({ left: { ...Object.fromEntries(kept), [from]: { shown, read } }, dayOffset, dayWay: shift, read: next, shown: next, fresh: new Set() });
		};

		return {
			shown: first,
			read: first,
			left: {},
			dayOffset: 0,
			dayWay: 0,
			stop: "calendar",
			gesture: null,
			lifted: null,
			liftedDepth: null,
			pending: false,
			now: port.now(),
			layer: null,
			entry: null,
			entrySeq: 0,
			plusAt: null,
			plusMinute: null,
			zoom,
			scrollArmed: false,
			scrollToward(edge) {
				if (edge === scrollEdge) return;
				scrollEdge = edge;
				window.clearTimeout(scrollWait);
				if (get().scrollArmed) set({ scrollArmed: false });
				if (edge !== null) scrollWait = window.setTimeout(() => set({ scrollArmed: true }), SCROLL_DWELL_MS);
			},
			selected: null,
			resizing: null,
			setPlusMinute(plusMinute) {
				if (get().plusMinute !== plusMinute) set({ plusMinute });
			},
			setZoom(next) {
				if (get().zoom !== next) set({ zoom: next });
			},
			clockOf(minute) {
				return port.clockAt(minute);
			},
			select(id) {
				if (get().selected !== id) set({ selected: id });
			},
			startResize(id, edge) {
				home = get().shown;
				set({ resizing: { id, edge }, layer: null });
			},
			resizeTo(id, edge, minute) {
				set({ shown: share(get().shown, port.stretched(id, get().dayOffset, edge, minute)) });
			},
			endResize(id, edge, minute, least) {
				const to = minute === null ? null : port.resized(id, get().dayOffset, edge, minute, least);
				if (to) {
					set({ shown: share(get().shown, port.preview(id, to)) });
					write(port.move(id, to));
				} else get().carryHome();
				home = null;
				set({ resizing: null });
				get().release("resize");
				return to !== null;
			},
			setPlusAt(at) {
				const was = get().plusAt;
				if (was === at || (was && at && was.into === at.into && was.index === at.index)) return;
				set({ plusAt: at });
			},
			fresh: new Set(),
			reveal: null,

			step(shift) {
				const { stop, shown } = get();
				if (stop === "calendar" && (shift > 0 || !shown.day.isToday)) return turnDay(shift);
				const at = STOPS.indexOf(stop) + shift;
				if (at >= 0 && at < STOPS.length) set({ stop: STOPS[at] });
			},
			setStop(stop) {
				set({ stop });
			},
			claim(gesture) {
				const held = get().gesture;
				/** A drag takes the pointer from the ribbon (its long press proved the ribbon still), never from a pinch or a resize. */
				if (held !== null && held !== gesture && (gesture !== "drag" || held === "zoom" || held === "resize")) return false;
				if (held !== gesture) set({ gesture });
				return true;
			},
			release(gesture) {
				if (get().gesture !== gesture) return;
				if (gesture === "drag") get().scrollToward(null);
				set({ gesture: null });
				if (get().pending) refresh();
			},
			lift(id) {
				home = get().shown;
				set({ lifted: id, liftedDepth: null, layer: null, selected: null });
			},
			setLiftedDepth(liftedDepth) {
				if (get().liftedDepth !== liftedDepth) set({ liftedDepth });
			},
			takes(id, to) {
				return port.takes(id, to);
			},
			carryHome() {
				const back = home ?? get().read;
				if (get().shown !== back) set({ shown: back });
			},
			carryInto(id, to) {
				set({ shown: share(get().shown, port.preview(id, to)) });
			},
			drop(id, to) {
				if (to) {
					set({ shown: share(get().shown, port.preview(id, to)) });
					write(port.move(id, to));
				} else get().carryHome();
				home = null;
				set({ lifted: null, liftedDepth: null });
				get().release("drag");
			},
			openMenu(id) {
				set({ layer: { kind: "menu", id, items: port.menu(id) }, selected: null });
			},
			closeLayer() {
				if (get().layer) set({ layer: null });
			},
			act(id, item) {
				set({ layer: null });
				write(port.act(id, item));
			},
			openEntry(at) {
				set({ entry: at === null ? null : (at ?? port.newTaskPlace(get().dayOffset)), entrySeq: get().entrySeq + 1, layer: null });
			},
			indentEntry(by) {
				const entry = get().entry;
				if (entry) set({ entry: { ...entry, depth: Math.max(0, (entry.depth ?? 0) + by) } });
			},
			async commitEntry(text, next) {
				const entry = get().entry;
				if (!entry) return;
				if (text.trim() === "") {
					const depth = entry.depth ?? 0;
					set({ entry: next && depth > 0 ? { ...entry, depth: depth - 1 } : null });
					return;
				}
				/** A field on the calendar takes one task: its minute is that task's. */
				const again = next && entry.at === undefined;
				set({ entry: again ? entry : null, entrySeq: get().entrySeq + 1 });
				const added = port.add(text, entry);
				write(added);
				await added;
			},
			start() {
				const off = port.subscribe(refresh);
				let timer = 0;
				/** Each minute the clock moves and the screen reads again: what rides the now line moves with it, what is over fades. */
				const tick = () => {
					set({ now: port.now() });
					refresh();
					timer = window.setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS));
				};
				tick();
				return () => {
					off();
					window.clearTimeout(timer);
				};
			},
		};
	});
}
