import { createStore, type StoreApi } from "zustand/vanilla";
import type { Destination, MenuItem, Now, ScreenData, ScreenPort } from "../port";
import { share } from "./share";

/** Where the ribbon stands: Inbox–Soon, Soon–the day, the day–its calendar. */
export type Stop = "inbox" | "soon" | "calendar";
export const STOPS: readonly Stop[] = ["inbox", "soon", "calendar"];

/** The one gesture that holds the pointer (spec, «Which gesture holds the pointer»). */
export type Gesture = "drag" | "ribbon";

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
	/** Data came while a drag or its write held the screen still: read once they end. */
	readonly pending: boolean;
	/** The present minute from today's start, ticking each minute (spec, «Time»). */
	readonly now: Now;
	readonly layer: Layer | null;
	readonly adding: boolean;
	/** Tasks new in the last read: their rows come in; a row merely scrolled into sight does not. */
	readonly fresh: ReadonlySet<string>;
	/** A task to bring into sight in its list, once per `seq`. */
	readonly reveal: { readonly id: string; readonly seq: number } | null;
}

export interface ScreenActions {
	/** The ribbon one stop on (1) or back (-1); past the day's calendar, the days. */
	step(shift: -1 | 1): void;
	setStop(stop: Stop): void;
	/** Takes the pointer for `gesture` unless another holds it; whether it got it. A drag always gets it: its long press already proved no other gesture moved (dnd-kit's activation constraint). */
	claim(gesture: Gesture): boolean;
	release(gesture: Gesture): void;
	lift(id: string): void;
	/** The carried task let go at `to` (null: cancelled, or let go where nothing takes it). */
	drop(id: string, to: Destination | null): void;
	openMenu(id: string): void;
	closeLayer(): void;
	act(id: string, item: string): void;
	setAdding(adding: boolean): void;
	add(text: string): Promise<void>;
	/** Starts following the port and the clock; returns the stop. Called by the screen as it mounts. */
	start(): () => void;
}

export type Screen = ScreenState & ScreenActions;
export type ScreenStore = StoreApi<Screen>;

const MINUTE_MS = 60_000;
/** Days kept for regions sliding out: as many as fast strokes can leave sliding at once. */
const LEFT_KEPT = 4;

/** One store per mounted screen, over its port (spec, «Screen state»). */
export function createScreenStore(port: ScreenPort): ScreenStore {
	/** Writes of the screen's own not yet read back: their reads come together once the last is in. */
	let writing = 0;
	const first = port.read(0);
	return createStore<Screen>()((set, get) => {
		/** The port's data again; held while a drag or a drop's write keeps the screen still (spec, principle 5). */
		const refresh = () => {
			const s = get();
			if (s.gesture === "drag" || writing > 0) {
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
			pending: false,
			now: port.now(),
			layer: null,
			adding: false,
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
				if (held !== null && held !== gesture && gesture !== "drag") return false;
				if (held !== gesture) set({ gesture });
				return true;
			},
			release(gesture) {
				if (get().gesture !== gesture) return;
				set({ gesture: null });
				if (get().pending) refresh();
			},
			lift(id) {
				set({ lifted: id, layer: null });
			},
			drop(id, to) {
				if (to) {
					set({ shown: share(get().shown, port.preview(id, to)) });
					write(port.move(id, to));
				}
				set({ lifted: null });
				get().release("drag");
			},
			openMenu(id) {
				set({ layer: { kind: "menu", id, items: port.menu(id) } });
			},
			closeLayer() {
				if (get().layer) set({ layer: null });
			},
			act(id, item) {
				set({ layer: null });
				write(port.act(id, item));
			},
			setAdding(adding) {
				set({ adding, layer: null });
			},
			async add(text) {
				const added = port.add(text, "inbox", get().dayOffset);
				write(added);
				const id = await added;
				set({ adding: false, reveal: { id, seq: (get().reveal?.seq ?? 0) + 1 } });
			},
			start() {
				const off = port.subscribe(refresh);
				let timer = 0;
				const tick = () => {
					set({ now: port.now() });
					timer = window.setTimeout(tick, MINUTE_MS - (Date.now() % MINUTE_MS));
				};
				tick();
				refresh();
				return () => {
					off();
					window.clearTimeout(timer);
				};
			},
		};
	});
}
