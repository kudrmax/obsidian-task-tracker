import { createStore, type StoreApi } from "zustand/vanilla";
import {
	type CalendarEvent,
	type CalendarService,
	type Clock,
	type DayOpening,
	type DayEvents,
	dayTitle,
	type DayService,
	type DropColumn,
	type FunnelPlace,
	type FunnelView,
	NO_DAY_EVENTS,
	projectNodeOf,
	type ProjectsView,
	type TaskItem,
	type TaskService,
	type TaskSpan,
	type UndoService,
} from "../../../core/application/contracts";
import type { LocalDate } from "../types";
import type { ShownSettings, ShownSettingsStore } from "../viewSettings";
import { type ColumnModel, columnModel, EMPTY_COLUMN, projectsModel, shared } from "./columnModel";

/** What the screen reads and writes through: the core's services and the device's settings of the view. */
export interface ScreenServices {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly undo: UndoService;
	readonly calendars: CalendarService;
	readonly settings: Pick<ShownSettingsStore, "get" | "set" | "onChange">;
	readonly clock: Clock;
}

/** Where the screen is mounted: the plugin's own leaf, or the block at the end of a project's note. */
export type ScreenPlace = { readonly kind: "main" } | { readonly kind: "note"; readonly path: () => string };

export const FUNNEL_LISTS: readonly DropColumn[] = ["inbox", "backlog", "soon", "day"];

/** A list the screen draws: a funnel's, or the node's tasks by project. */
export type ShownList = DropColumn | "projects";

export interface ScreenState {
	/** `loading` until the first read; `missing` with no tasks file. */
	readonly phase: "loading" | "ready" | "missing";
	readonly date: LocalDate;
	readonly dayTitle: string;
	readonly funnel: FunnelView | null;
	/** The place the ribbon stands at: the core's (`FunnelView.place`), or the one a swipe or the wheel just chose. */
	readonly place: FunnelPlace;
	/** Every task drawn, by id; an item read the same as before keeps its object, so only a changed card re-renders. */
	readonly items: Readonly<Record<string, TaskItem>>;
	readonly columns: Readonly<Record<ShownList, ColumnModel>>;
	/** The day's timeline, by id, in the core's order. */
	readonly slotted: readonly string[];
	readonly projects: ProjectsView | null;
	readonly listNames: Readonly<Record<DropColumn | "done", string>>;
	readonly events: DayEvents;
	readonly settings: ShownSettings;
	readonly canUndo: boolean;
	/** The present minute from the shown day's start while it is today (the now line); null on another day. */
	readonly now: number | null;
}

export interface ScreenActions {
	/** Reads the view, the lists and the timeline afresh for the shown day. */
	refresh(): Promise<void>;
	refreshEvents(): Promise<void>;
	/** The ribbon stands at `place`: kept on the device by the core. */
	setPlace(place: FunnelPlace): void;
	/** A swipe, the wheel or an arrow one step back or on (`DayService.stepFunnel`): another place, or another day at the calendar. */
	step(shift: -1 | 1): boolean;
	/** The day the day column and the timeline show. */
	showDay(date: LocalDate): void;
	/** A day back or on, the day's arrows. */
	stepDay(days: -1 | 1): void;
	toToday(): void;
	/** The divider let go: the list's share kept on the device. */
	saveShare(share: number): void;
	undo(): Promise<void>;
	createFile(): Promise<void>;
	/** A card's folder mark tapped: the project chosen in the filter. */
	chooseProject(name: string): Promise<void>;
	/** A minute may have passed: the now line follows. */
	tickNow(): void;
	/** Reads of the core the timeline draws by, for the shown day. */
	spanOf(item: TaskItem): TaskSpan;
	eventSpan(event: CalendarEvent): { readonly start: number; readonly end: number };
	isPast(event: CalendarEvent): boolean;
	/** The clock's hour of the timeline's line `index` hours after the day's start. */
	hourAt(index: number): number;
	openAt(date: LocalDate): DayOpening;
	/** Minutes since midnight by the clock: the now line's pill. */
	clockMinute(): number;
	/** Stops following the services. */
	dispose(): void;
}

export type ScreenStore = StoreApi<ScreenState & ScreenActions>;

/**
 * The screen's one store: what the core reads for the screen, kept with structural sharing (a selector sees a change only
 * where the data changed), and the actions that write through the core and read again. Changes from outside (the file
 * edited, Sync, another tab, the settings) are pushed in from outside React.
 */
export function createScreenStore(services: ScreenServices, where: ScreenPlace, wide: () => boolean): ScreenStore {
	const { tasks, days, undo, calendars, settings, clock } = services;
	const nowOn = (date: LocalDate): number | null => {
		const open = days.openAt(date);
		return open.kind === "now" ? open.minute : null;
	};
	let reads = 0;
	let eventReads = 0;
	const listNames = () => ({ inbox: tasks.listName("inbox"), backlog: tasks.listName("backlog"), soon: tasks.listName("soon"), day: "", done: tasks.listName("done") });
	const today = days.today();

	const store = createStore<ScreenState & ScreenActions>()((set, get) => {
		const titleOf = (date: LocalDate) => dayTitleOf(days, date);
		const readView = (): Promise<FunnelView | null> => (where.kind === "note" ? tasks.projectNoteView(where.path(), wide()) : tasks.funnelView(wide()));

		return {
			phase: "loading",
			date: today,
			dayTitle: titleOf(today),
			funnel: null,
			place: tasks.firstPlace(),
			items: {},
			columns: { inbox: EMPTY_COLUMN, backlog: EMPTY_COLUMN, soon: EMPTY_COLUMN, day: EMPTY_COLUMN, projects: EMPTY_COLUMN },
			slotted: [],
			projects: null,
			listNames: listNames(),
			events: NO_DAY_EVENTS,
			settings: settings.get(),
			canUndo: undo.canUndo(),
			now: nowOn(today),

			async refresh() {
				const read = ++reads;
				const date = get().date;
				const funnel = await readView();
				const node = funnel?.filter?.node ?? null;
				const byProject = funnel?.view.source === "projectsScreen";
				const [screen, projects] = await Promise.all([tasks.screen(date, node), byProject ? tasks.projectsScreen(node ?? "all") : Promise.resolve(null)]);
				if (read !== reads) return;
				const prev = get();
				const lists: Record<DropColumn, readonly TaskItem[]> = { inbox: screen.inbox, backlog: screen.backlog, soon: screen.soon, day: screen.day.list };
				const items: Record<string, TaskItem> = {};
				const keep = (item: TaskItem) => {
					items[item.id] = shared(prev.items[item.id], item);
					item.subtasks.forEach(keep);
				};
				for (const list of [...Object.values(lists), screen.day.slotted, projects?.sections.flatMap((section) => section.rows.map((row) => row.item)) ?? []]) list.forEach(keep);
				const plates = funnel?.view.plates;
				const columns = Object.fromEntries(
					FUNNEL_LISTS.map((column) => {
						const sections = tasks.columnSections(column, date);
						const model = columnModel(lists[column], sections ? screen.sections[sections.list] : null, plates?.[column] ?? null);
						return [column, shared(prev.columns[column], model)];
					}),
				) as Record<ShownList, ColumnModel>;
				columns.projects = shared(prev.columns.projects, projects ? projectsModel(projects) : EMPTY_COLUMN);
				set({
					phase: screen.missing ? "missing" : "ready",
					funnel: shared(prev.funnel ?? undefined, funnel),
					place: prev.phase === "loading" && funnel ? funnel.place : prev.place,
					items,
					columns,
					slotted: shared(prev.slotted, screen.day.slotted.map((item) => item.id)),
					projects: shared(prev.projects ?? undefined, projects),
					listNames: shared(prev.listNames, listNames()),
					dayTitle: titleOf(date),
				});
			},

			async refreshEvents() {
				const read = ++eventReads;
				const ask = calendars.events(get().date, "open");
				if (ask.cached) set({ events: ask.cached });
				const fresh = ask.fresh ? await ask.fresh() : null;
				if (fresh && read === eventReads) set({ events: fresh });
			},

			setPlace(place) {
				if (place === get().place) return;
				set({ place });
				void tasks.setFunnelPlace(place);
			},

			step(shift) {
				const { place, date } = get();
				const to = days.stepFunnel({ mode: place, date }, shift);
				if (!to || to.mode === "done") return false;
				if (to.mode !== place) get().setPlace(to.mode);
				if (to.date !== date) get().showDay(to.date);
				return true;
			},

			showDay(date) {
				set({ date, dayTitle: titleOf(date), now: nowOn(date), events: calendars.events(date, "open").cached ?? NO_DAY_EVENTS });
				void get().refresh();
				void get().refreshEvents();
			},

			stepDay(shift) {
				get().showDay(days.step(get().date, shift));
			},

			toToday() {
				get().showDay(days.today());
			},

			saveShare(share) {
				void settings.set({ listShare: share });
			},

			async undo() {
				if (undo.canUndo()) await undo.undo();
			},

			async createFile() {
				await tasks.createFile();
				await get().refresh();
			},

			async chooseProject(name) {
				await tasks.selectProjectNode(projectNodeOf(name));
				await get().refresh();
			},

			tickNow() {
				const now = nowOn(get().date);
				if (now !== get().now) set({ now });
			},

			spanOf: (item) => tasks.shownSpan(item, get().date),
			eventSpan: (event) => days.boundary().clipToDay(get().date, event.start, event.end),
			isPast: (event) => calendars.isPast(event),
			hourAt: (index) => days.boundary().hourAt(index),
			openAt: (date) => days.openAt(date),
			clockMinute: () => {
				const at = clock.now();
				return at.getHours() * 60 + at.getMinutes();
			},

			dispose() {
				for (const stop of unsubscribe) stop();
			},
		};
	});

	const unsubscribe = [
		tasks.onChange(() => void store.getState().refresh()),
		undo.onChange(() => store.setState({ canUndo: undo.canUndo() })),
		settings.onChange(() => {
			store.setState({ settings: settings.get() });
			void store.getState().refresh();
		}),
		calendars.onChange(() => void store.getState().refreshEvents()),
		/** Another hour for the day's start opens today afresh; a day that ended reads the lists anew (yesterday's unfinished in Now). */
		days.onDayChange((change) => (change === "moved" ? store.getState().showDay(days.today()) : void store.getState().refresh())),
	];
	return store;
}

function dayTitleOf(days: DayService, date: LocalDate): string {
	return dayTitle(date, days.relation(date), days.today());
}
