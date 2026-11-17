import { createStore, type StoreApi } from "zustand/vanilla";
import type { DropColumn, DropFrom, DropTo, TaskItem, TaskService } from "../core/application/contracts";
import type { LocalDate } from "../core/domain/Task";

export type ColumnId = DropColumn;
export const COLUMNS: readonly ColumnId[] = ["inbox", "backlog", "soon", "day"];

/** What a card draws: only these fields re-render it. */
export interface CardFace {
	readonly title: string;
	readonly status: string;
	readonly tint: string | null;
	readonly progress: number;
}

export interface ScreenState {
	readonly date: LocalDate;
	readonly items: Readonly<Record<string, TaskItem>>;
	readonly faces: Readonly<Record<string, CardFace>>;
	/** The order the file has, as read. */
	readonly columns: Readonly<Record<ColumnId, readonly string[]>>;
	/** The order shown while a drag carries a card, until the next read. */
	readonly shown: Readonly<Record<ColumnId, readonly string[]>> | null;
	readonly slotted: readonly string[];
	readonly reads: number;
	readonly hourPx: number;
	readonly place: number;
	readonly listWidth: number;
	readonly dragging: string | null;
	readonly lastWriteMs: number;
	readonly lastReadMs: number;

	refresh(): Promise<void>;
	setShown(shown: Record<ColumnId, readonly string[]> | null): void;
	setDragging(id: string | null): void;
	drop(id: string, from: DropFrom, to: DropTo): Promise<void>;
	moveFirstInboxToSoon(): Promise<void>;
	moveLastSoonToInbox(): Promise<void>;
	togglePriority(id: string): Promise<void>;
	resize(id: string, minute: number): Promise<void>;
	/** The card's span while its end is held at `minute`, snapped: the core's. */
	/** Where the card stands on the day's timeline, minutes from the day's start: the core's. */
	spanOf(id: string): { readonly start: number; readonly end: number | null } | null;
	stretch(id: string, minute: number): { readonly start: number; readonly end: number } | null;
	/** Let go on the time grid: the card stands at once where the core's `dropSpan` puts it, then the write. */
	dropAtTime(id: string, from: DropFrom, minute: number): Promise<void>;
	/** Cards let go on the grid whose write has not been read back yet, at the span the core gives them. */
	landed: Readonly<Record<string, { readonly start: number; readonly end: number | null }>>;
	/** The pointer is over the time grid: the overlay then plays no drop animation, the card is already in its slot. */
	overGrid: boolean;
	setOverGrid(over: boolean): void;
	tick: number;
	/** Measurement only: each column mounts at most this many cards, what a virtualized list would keep mounted. */
	mounted: number;
	/** Columns virtualized with TanStack Virtual. */
	virtual: boolean;
	/** dnd-kit's droppable measuring strategy. */
	measuring: "always" | "whileDragging" | "beforeDragging";
	/** Ids the last read brought that the read before did not have: they enter with an animation, a row scrolled into view does not. */
	added: ReadonlySet<string>;
	onlyCurrent: boolean;
	/** The @dnd-kit/react view's rows with Motion or as plain elements. */
	altMotion: boolean;
	/** The @dnd-kit/react rows keep Motion's layout through a drag, without a shared layout id (no re-render at the lift). */
	altQuiet: boolean;
	configure(patch: Partial<Pick<ScreenState, "virtual" | "measuring" | "onlyCurrent" | "altMotion" | "altQuiet">>): void;
	setMounted(n: number): void;
	/** The ribbon on @use-gesture with the core's landing, or on CSS scroll-snap: the two variants checked. */
	ribbon: "gesture" | "snap";
	setRibbon(mode: "gesture" | "snap"): void;
	bump(): void;
	setHourPx(px: number): void;
	setPlace(place: number): void;
	setListWidth(px: number): void;
}

export type ScreenStore = StoreApi<ScreenState>;

/** The same value as before when nothing in it changed, so a selector sees no change (TanStack Query's structural sharing). */
function shareArray(prev: readonly string[] | undefined, next: readonly string[]): readonly string[] {
	if (prev && prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
	return next;
}

function faceOf(item: TaskItem): CardFace {
	return { title: item.card.title, status: item.status, tint: item.colors[0] ?? null, progress: item.subtasks.length };
}

function sameFace(a: CardFace | undefined, b: CardFace): boolean {
	return !!a && a.title === b.title && a.status === b.status && a.tint === b.tint && a.progress === b.progress;
}

export function createScreenStore(tasks: TaskService, today: () => LocalDate): ScreenStore {
	let readSeq = 0;
	const store = createStore<ScreenState>()((set, get) => ({
		date: today(),
		items: {},
		faces: {},
		columns: { inbox: [], backlog: [], soon: [], day: [] },
		shown: null,
		slotted: [],
		reads: 0,
		hourPx: 56,
		place: 0,
		listWidth: 220,
		dragging: null,
		lastWriteMs: 0,
		lastReadMs: 0,

		async refresh() {
			const seq = ++readSeq;
			const t0 = performance.now();
			const view = await tasks.screen(get().date);
			if (seq !== readSeq) return;
			const prev = get();
			const items: Record<string, TaskItem> = {};
			const faces: Record<string, CardFace> = {};
			const all = [...view.inbox, ...view.backlog, ...view.soon, ...view.day.list, ...view.day.slotted];
			for (const item of all) {
				items[item.id] = item;
				const face = faceOf(item);
				faces[item.id] = sameFace(prev.faces[item.id], face) ? prev.faces[item.id] : face;
			}
			const ids = (list: readonly TaskItem[]) => list.map((t) => t.id);
			set({
				items,
				faces,
				columns: {
					inbox: shareArray(prev.columns.inbox, ids(view.inbox)),
					backlog: shareArray(prev.columns.backlog, ids(view.backlog)),
					soon: shareArray(prev.columns.soon, ids(view.soon)),
					day: shareArray(prev.columns.day, ids(view.day.list)),
				},
				slotted: shareArray(prev.slotted, ids(view.day.slotted)),
				shown: prev.dragging ? prev.shown : null,
				reads: prev.reads + 1,
				landed: {},
				added: prev.reads === 0 ? new Set() : new Set(Object.keys(items).filter((id) => !prev.items[id])),
				lastReadMs: performance.now() - t0,
			});
		},
		setShown(shown) {
			set({ shown });
		},
		setDragging(dragging) {
			set(dragging ? { dragging, overGrid: false } : { dragging });
		},
		async drop(id, from, to) {
			const item = get().items[id];
			if (!item) return;
			const t0 = performance.now();
			await tasks.drop([{ key: item.key, from }], to, get().date);
			set({ lastWriteMs: performance.now() - t0 });
			await get().refresh();
		},
		async moveFirstInboxToSoon() {
			const id = get().columns.inbox[0];
			if (id) await get().drop(id, "inbox", { kind: "place", column: "soon", place: { kind: "task", group: null, before: get().items[get().columns.soon[0]]?.key ?? null } });
		},
		async moveLastSoonToInbox() {
			const soon = get().columns.soon;
			const id = soon[soon.length - 1];
			if (id) await get().drop(id, "soon", { kind: "place", column: "inbox", place: { kind: "task", group: null, before: get().items[get().columns.inbox[0]]?.key ?? null } });
		},
		async togglePriority(id) {
			const item = get().items[id];
			if (!item) return;
			const t0 = performance.now();
			await tasks.setPriority(item.key, item.priority ? null : "p1");
			set({ lastWriteMs: performance.now() - t0 });
			await get().refresh();
		},
		async resize(id, minute) {
			const item = get().items[id];
			if (!item) return;
			const t0 = performance.now();
			await tasks.resize(item.key, get().date, "end", tasks.snap(minute, get().hourPx, 9), 15);
			set({ lastWriteMs: performance.now() - t0 });
			await get().refresh();
		},
		spanOf(id) {
			const landed = get().landed[id];
			if (landed) return landed;
			const item = get().items[id];
			return item?.slot ? tasks.shownSpan(item, get().date) : null;
		},
		stretch(id, minute) {
			const item = get().items[id];
			return item ? tasks.stretch(item, get().date, "end", tasks.snap(minute, get().hourPx, 9)) : null;
		},
		async dropAtTime(id, from, minute) {
			const s = get();
			const item = s.items[id];
			if (!item) return;
			const start = tasks.snap(minute, s.hourPx, 9);
			const without = (ids: readonly string[]) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids);
			const shown = s.shown ?? s.columns;
			set({
				landed: { ...s.landed, [id]: tasks.dropSpan(item, from, start) },
				slotted: s.slotted.includes(id) ? s.slotted : [...s.slotted, id],
				shown: { inbox: without(shown.inbox), backlog: without(shown.backlog), soon: without(shown.soon), day: without(shown.day) },
				dragging: null,
			});
			await get().drop(id, from, { kind: "time", start });
		},
		landed: {},
		overGrid: false,
		setOverGrid(overGrid) {
			if (get().overGrid !== overGrid) set({ overGrid });
		},
		tick: 0,
		mounted: Infinity,
		virtual: true,
		measuring: "whileDragging",
		onlyCurrent: false,
		altMotion: true,
		altQuiet: false,
		added: new Set<string>(),
		configure(patch) {
			set(patch);
		},
		setMounted(mounted) {
			set({ mounted });
		},
		ribbon: "gesture",
		setRibbon(ribbon) {
			set({ ribbon });
		},
		bump() {
			set({ tick: get().tick + 1 });
		},
		setHourPx(hourPx) {
			set({ hourPx });
		},
		setPlace(place) {
			set({ place });
		},
		setListWidth(listWidth) {
			set({ listWidth });
		},
	}));
	tasks.onChange(() => void store.getState().refresh());
	return store;
}
