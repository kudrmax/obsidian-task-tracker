import { DESIGN } from "../../design";
import { createStore, type StoreApi } from "zustand/vanilla";
import { LAYER_MS } from "../layers/motion";
import type { Destination, Edge, EntryBar, EntryDraft, EntryField, ListId, MenuAction, MenuFrom, MenuModel, Now, PlaceId, MenuStatusId, ScreenData, ScreenPort } from "../port";
import { share } from "./share";

/** Where the ribbon stands: Inbox–Soon, Soon–the day, the day–its calendar. */
export type Stop = "inbox" | "soon" | "calendar";
export const STOPS: readonly Stop[] = ["inbox", "soon", "calendar"];
/** The lists the ribbon shows at each stop. */
export const STOP_LISTS: Readonly<Record<Stop, readonly ListId[]>> = { inbox: ["inbox", "soon"], soon: ["soon", "day"], calendar: ["day"] };
/** Whether a stop shows a list, and the stop the ribbon turns to for a list it doesn't show: the screen's columns, not a task's. */
const SHOWS: Readonly<Record<Stop, Readonly<Record<ListId, boolean>>>> = { inbox: { inbox: true, soon: true, day: false }, soon: { inbox: false, soon: true, day: true }, calendar: { inbox: false, soon: false, day: true } };
const STOP_OF: Readonly<Record<ListId, Stop>> = { inbox: "inbox", soon: "soon", day: "soon" };

const NO_DRAFT: EntryDraft = { level: null, projects: [], descriptionLine: null, section: false };

/** The one gesture that holds the pointer (spec, «Which gesture holds the pointer»). */
export type Gesture = "drag" | "ribbon" | "resize" | "zoom";

/** Where the calendar was zoomed to: an hour's height, or the whole day whatever the calendar's height. */
export type Zoom = number | "wholeDay";

/** A page of a task's menu: the menu itself, the month to pick a day in, the Reminder kinds. */
export type MenuPage = "menu" | "picker" | "reminders";

/** What a menu asks before it acts (Won't do, Stop, Delete), in place of what was pressed. */
export type Asking = MenuStatusId | "delete";

/** A panel of the field's bar: the flag's levels, the projects, the places, the month of Date. */
export type BarPanelKind = "priority" | "project" | "where" | "date";

/**
 * An open layer (spec, «Layers and focus»): the menu of a task or an event, with what the port offers in it, opened from a
 * list's card, a calendar's block or a block's stack; the page it shows and the question it asks, if any.
 */
export interface Layer {
	readonly kind: "menu";
	readonly id: string;
	readonly from: MenuFrom;
	readonly model: MenuModel;
	readonly page: MenuPage;
	readonly asking: Asking | null;
	/** A subtask's menu opened from a calendar menu's stack: the task whose copy and stack stay drawn, and the stack's cards. */
	readonly stack: { readonly of: string; readonly ids: readonly string[] } | null;
	/** The question last taken back by Cancel: what asked it takes the focus again. */
	readonly asked: Asking | null;
}

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
	/**
	 * The field a task is typed in, open while not null (the plugin's one quick entry): a new task's or a rename's, where it
	 * stands; in a list, on the calendar, or in an open menu's stack.
	 */
	readonly entry: EntryField | null;
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
	/** What the bar has set for the task being typed, and the text typed so far (a level's prefix lights the flag). */
	readonly draft: EntryDraft;
	readonly entryText: string;
	/** The bar's panel open over it: one at a time; every new field, or the field moved, opens with none. */
	readonly entryPanel: BarPanelKind | null;
	/** The open menu's block stands higher than its task (Decision 120): its copy is not over the task, so the task's dots go. */
	readonly menuLifted: boolean;
	/** Counts the fields opened: each new one (after Enter) is a fresh, empty field. */
	readonly entrySeq: number;
	/** Tasks new in the last read: their rows come in; a row merely scrolled into sight does not. */
	readonly fresh: ReadonlySet<string>;
	/** A card to take the keyboard's focus, once per `seq`: the one a rename ended on by a key (Decision 58). */
	readonly focusCard: { readonly id: string; readonly seq: number } | null;
	/** A task to bring into sight in its list, once per `seq`. */
	readonly reveal: { readonly id: string; readonly seq: number } | null;
}

export interface ScreenActions {
	/** The ribbon one stop on (1) or back (-1); past the day's calendar, the days. */
	step(shift: -1 | 1): void;
	setStop(stop: Stop): void;
	/**
	 * The ribbon's place past the calendar as a finger lets it go (`offset` days from today): the day shown from now on, the
	 * day turned away from kept for its region still sliding out.
	 */
	showDay(offset: number): void;
	/** Reads the days `offsets` (other than the shown one) for regions a finger draws into sight, kept as the days turned away from are. */
	peekDays(offsets: readonly number[]): void;
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
	/**
	 * Opens the menu of the task or event `id`, opened `from` there (a list's card unless said). `reveal`: a tap, not a finger
	 * still held: a card partly out of its list's sight is scrolled into it first (the design's «Полная карточка»). It opens
	 * at once: no double click is waited out (Max, 2026-11-20: the wait felt like lag; double click withdrawn).
	 */
	openMenu(id: string, from?: MenuFrom, reveal?: boolean): void;
	closeLayer(): void;
	/** The open menu shows another page. */
	menuPage(page: MenuPage): void;
	/** The open menu asks before it acts (null: the question taken back, the menu as it was). */
	ask(what: Asking | null): void;
	/**
	 * A tap in the menu: it closes first, and once it has faded out the port writes what was tapped (F132: the action
	 * happens on the screen under the menu, after it).
	 */
	pick(action: MenuAction): void;
	/**
	 * Rename from the menu (F117, F108): the menu closes and in the same tap the card (a list's, a calendar's block) becomes
	 * the field, the new task's field with its bar; a card of a calendar menu's stack becomes it in the menu, which stays.
	 */
	startRename(): void;
	/**
	 * Add subtask from the menu (F124, F108): a list's card opens the new task's field under its last subtask, the menu
	 * closed in the same tap; a calendar's task types it at the end of its stack in the menu, which stays.
	 */
	startSubtask(): void;
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
	/** Opens a new task's field at `at`; null closes the field writing nothing (Escape), with the menu it stood in. */
	openEntry(at: Destination | null): void;
	/** The bar of `field` (the port's answer). */
	entryBar(field: EntryField, draft: EntryDraft, text: string): EntryBar;
	/** Opens a panel of the bar (null: closes it). */
	showEntryPanel(panel: BarPanelKind | null): void;
	/** The menu's block lifted from its task, or standing right over it. */
	liftMenu(lifted: boolean): void;
	/** Escape in the field: a panel open closes, and only it; else the field closes writing nothing (F181). */
	escapeEntry(): void;
	/** The field's text as typed. */
	typeEntry(text: string): void;
	/** A level's tile on the bar: set, or taken off when it was the one set. */
	draftLevel(prefix: string): void;
	/** A project's check on the bar's Project page: on beside the others, or off (the core's `toggleProject`). */
	toggleProject(name: string): void;
	/** No project: every project off. */
	clearProjects(): void;
	/** Description on the bar: the line under the title opens, holding what the port says (a renamed task's own description). */
	openDescription(): void;
	/** The description's line typed. */
	typeDescription(text: string): void;
	/** New section on the bar: the field writes a section's name instead of a task, or a task again. */
	toggleSection(): void;
	/**
	 * A place picked on the bar: the field goes to the end of that list or day, the ribbon and the day turning to show it;
	 * a list the screen can't bring into sight (`reach`, the layout's) keeps the field where it stands.
	 */
	entryPlace(choice: PlaceId, date: string | null, reach: readonly ListId[]): void;
	/** The plus tapped while the lists `shown` are on the screen: the field opens at the port's place for new tasks (F174). */
	plusTap(shown: readonly ListId[]): void;
	/** A mouse's double click on a list's free room: a new task's field at the list's end (F67, `docs/plugin/tasks.md`). */
	openAtEnd(list: ListId): void;
	/** The field one level deeper (1) or shallower (-1), as Tab and Shift+Tab do. */
	indentEntry(by: -1 | 1): void;
	/**
	 * Enter (`next`) or a tap elsewhere: the port says what the text writes and which field opens next (batch typing, a
	 * level out, a new task under a renamed one); a renamed card shows its new name at once (F298).
	 */
	commitEntry(text: string, next: boolean): void;
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
			/** An open menu shows its task as it now stands (a subtask typed into its stack, F108). */
			const layer = s.layer && s.layer.model.kind === "task" && next.cards[s.layer.id] ? { ...s.layer, model: port.menu(s.layer.id, s.layer.from) } : s.layer;
			set({ read: next, shown: share(s.shown, next), pending: false, fresh: fresh.size === 0 && s.fresh.size === 0 ? s.fresh : fresh, layer });
		};

		const write = (done: Promise<unknown>) => {
			writing++;
			void done.finally(() => {
				writing--;
				refresh();
			});
		};

		/** The day `dayOffset` shown: the one turned away from kept for its region still sliding out, a day already drawn in sight read again over what it drew. */
		const showDay = (dayOffset: number, dayWay: -1 | 0 | 1) => {
			const { dayOffset: from, shown, read, left } = get();
			if (dayOffset === from) return;
			const drawn = left[dayOffset];
			const fresh = port.read(dayOffset);
			const next = drawn ? share(drawn.read, fresh) : fresh;
			const kept = Object.entries(left).filter(([day]) => Math.abs(Number(day) - dayOffset) <= LEFT_KEPT);
			set({ left: { ...Object.fromEntries(kept), [from]: { shown, read } }, dayOffset, dayWay, read: next, shown: drawn ? share(drawn.shown, next) : next, fresh: new Set() });
		};
		const turnDay = (shift: -1 | 1) => showDay(get().dayOffset + shift, shift);
		/** The card `id` takes the focus back, as a menu closing gives it back (Decision 58). */
		const focusOn = (id: string) => set({ focusCard: { id, seq: (get().focusCard?.seq ?? 0) + 1 } });

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
			draft: NO_DRAFT,
			entryText: "",
			entryPanel: null,
			menuLifted: false,
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
			focusCard: null,

			step(shift) {
				const { stop, shown } = get();
				if (stop === "calendar" && (shift > 0 || !shown.day.isToday)) return turnDay(shift);
				const at = STOPS.indexOf(stop) + shift;
				if (at >= 0 && at < STOPS.length) set({ stop: STOPS[at] });
			},
			setStop(stop) {
				set({ stop });
			},
			showDay(offset) {
				showDay(offset, Math.sign(offset - get().dayOffset) as -1 | 0 | 1);
			},
			peekDays(offsets) {
				const { dayOffset, left } = get();
				const read = offsets
					.filter((day) => day !== dayOffset)
					.map((day): [number, { shown: ScreenData; read: ScreenData }] => {
						const had = left[day];
						const data = had ? share(had.read, port.read(day)) : port.read(day);
						return [day, had && had.read === data && had.shown === data ? had : { shown: data, read: data }];
					});
				if (read.every(([day, kept]) => left[day] === kept)) return;
				set({ left: { ...left, ...Object.fromEntries(read) } });
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
			openMenu(id, from = "list", reveal = false) {
				if (reveal) set({ reveal: { id, seq: (get().reveal?.seq ?? 0) + 1 } });
				const over = get().layer;
				const stack = from !== "stack" || !over ? null : (over.stack ?? (over.model.kind === "task" ? { of: over.id, ids: over.model.subtasks } : null));
				const model = port.menu(id, from);
				set({ layer: { kind: "menu", id, from, model, page: "menu", asking: null, asked: null, stack }, ...(from === "list" ? { selected: null } : {}) });
			},
			startRename() {
				const layer = get().layer;
				if (!layer) return;
				const { field, draft, text } = port.rename(layer.id, layer.from, get().dayOffset);
				set({ entry: field, draft, entryText: text, entrySeq: get().entrySeq + 1, entryPanel: null, layer: field.stack ? { ...layer, asking: null } : null });
			},
			startSubtask() {
				const layer = get().layer;
				if (!layer) return;
				if (layer.from === "calendar") return set({ entry: { at: { list: "day", before: null, dayOffset: get().dayOffset, under: layer.id }, renaming: null, stack: true }, draft: NO_DRAFT, entryText: "", entrySeq: get().entrySeq + 1, entryPanel: null, layer: { ...layer, asking: null } });
				set({ layer: null, entry: { at: port.subtaskPlace(layer.id, get().dayOffset), renaming: null, stack: false }, draft: NO_DRAFT, entryText: "", entrySeq: get().entrySeq + 1, entryPanel: null });
			},
			menuPage(page) {
				const layer = get().layer;
				if (layer && layer.page !== page) set({ layer: { ...layer, page, asking: null } });
			},
			ask(asking) {
				const layer = get().layer;
				if (layer && layer.asking !== asking) set({ layer: { ...layer, asking, asked: asking === null ? layer.asking : null } });
			},
			pick(action) {
				const layer = get().layer;
				if (!layer) return;
				set({ layer: null });
				let done: () => void = () => undefined;
				write(new Promise<void>((resolve) => (done = resolve)));
				window.setTimeout(() => void port.act(layer.id, action, layer.from).finally(done), LAYER_MS.close);
			},
			closeLayer() {
				if (get().layer) set({ layer: null, ...(get().entry?.stack ? { entry: null, draft: NO_DRAFT, entryText: "", entryPanel: null } : {}) });
			},
			openEntry(at) {
				set({ entry: at && { at, renaming: null, stack: false }, entrySeq: get().entrySeq + 1, entryPanel: null, layer: null, entryText: "", draft: NO_DRAFT });
			},
			entryBar(field, draft, text) {
				return port.entryBar(field, draft, text);
			},
			liftMenu(menuLifted) {
				if (get().menuLifted !== menuLifted) set({ menuLifted });
			},
			showEntryPanel(entryPanel) {
				if (get().entryPanel !== entryPanel) set({ entryPanel });
			},
			escapeEntry() {
				const { entryPanel, entry } = get();
				if (entryPanel !== null) return set({ entryPanel: null });
				get().openEntry(null);
				if (entry?.renaming && !entry.stack) focusOn(entry.renaming);
			},
			typeEntry(entryText) {
				if (get().entryText !== entryText) set({ entryText });
			},
			draftLevel(prefix) {
				const draft = get().draft;
				set({ draft: { ...draft, level: draft.level === prefix ? null : prefix } });
			},
			toggleProject(name) {
				const draft = get().draft;
				set({ draft: { ...draft, projects: draft.projects.includes(name) ? draft.projects.filter((p) => p !== name) : [...draft.projects, name] } });
			},
			clearProjects() {
				set({ draft: { ...get().draft, projects: [] } });
			},
			openDescription() {
				const { entry, draft } = get();
				if (entry && draft.descriptionLine === null) set({ draft: { ...draft, descriptionLine: port.entryDescription(entry) } });
			},
			typeDescription(description) {
				const draft = get().draft;
				if (draft.descriptionLine !== null && draft.descriptionLine !== description) set({ draft: { ...draft, descriptionLine: description } });
			},
			toggleSection() {
				const draft = get().draft;
				set({ draft: { ...draft, section: !draft.section }, entryPanel: null });
			},
			entryPlace(choice, date, reach) {
				const { entry, stop } = get();
				if (!entry) return;
				const to = port.entryPlace(entry, choice, date, reach);
				if (to.at.dayOffset !== get().dayOffset) get().showDay(to.at.dayOffset);
				const where = to.at.list;
				/** The field opens again at its new place, with what was typed (a new field brought into sight, F193). */
				set({ entry: to, entrySeq: get().entrySeq + 1, entryPanel: null, ...(SHOWS[stop][where] ? {} : { stop: STOP_OF[where] }) });
			},
			plusTap(shown) {
				get().openEntry(port.newTaskPlace(get().dayOffset, shown));
			},
			openAtEnd(list) {
				get().openEntry(port.listEnd(list, get().dayOffset));
			},
			indentEntry(by) {
				const entry = get().entry;
				const shift = by > 0 ? "indent" : "outdent";
				const offered = entry ? port.entryBar(entry, get().draft, get().entryText).bar.some((group) => group.actions.some((action) => action.id === shift && !action.disabled)) : false;
				if (entry && offered) set({ entry: { ...entry, at: { ...entry.at, under: undefined, depth: Math.max(0, (entry.at.depth ?? 0) + by) } } });
			},
			commitEntry(text, next) {
				const { entry, draft, shown } = get();
				if (!entry) return;
				const done = port.commit(entry, text, draft, next);
				const face = done.face;
				set({
					entry: done.next,
					draft: done.draft,
					entryText: "",
					entrySeq: get().entrySeq + 1, entryPanel: null,
					/** The new name on every card at once, until the write is read back (F298). */
					...(face ? { shown: { ...shown, cards: { ...shown.cards, [face.id]: face } } } : {}),
					/** A field in a menu's stack ends with the menu. */
					...(entry.stack && !done.next ? { layer: null } : {}),
				});
				if (done.write) write(done.write);
				if (next && entry.renaming && !entry.stack && !done.next) focusOn(entry.renaming);
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
