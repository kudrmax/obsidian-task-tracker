import type { CalendarSource, ProjectNote, ProjectsScreenState, SourceProblem } from "../../../core/application/contracts";
import type { DoorContext, DoorHost } from "../../../core/application/PhoneCalls";
import type { TaskIdState } from "../../../core/application/TaskIdentity";
import type { UndoState } from "../../../core/application/UndoSteps";

/** Every part of the replica (P3): what the door reads, as one immutable value. A new value is a new identity. */
export interface ReplicaState {
	readonly tasks: string | null;
	readonly settings: string;
	readonly history?: UndoState;
	readonly projectsScreen: ProjectsScreenState;
	readonly ids?: TaskIdState;
	readonly calendars: Partial<Record<CalendarSource, string | null>>;
	readonly projects: readonly ProjectNote[];
	readonly host: DoorHost;
	readonly feedProblems: Partial<Record<CalendarSource, SourceProblem>>;
	readonly projectsReady: boolean;
}

/** The calendar sources the plugin fetches itself: Google's. */
const FETCHED: readonly CalendarSource[] = ["google"];

export const EMPTY_REPLICA: ReplicaState = {
	tasks: null,
	settings: "",
	projectsScreen: {},
	calendars: {},
	projects: [],
	host: "obsidian",
	feedProblems: {},
	projectsReady: false,
};

/** The door's context over a replica at a moment. */
export function contextOf(state: ReplicaState, nowMs: number): DoorContext {
	return {
		tasks: state.tasks,
		settings: state.settings,
		nowMs,
		calendars: state.calendars,
		fetched: FETCHED,
		history: state.history,
		projects: state.projects,
		projectsScreen: state.projectsScreen,
		ids: state.ids,
		host: state.host,
		feedProblems: state.feedProblems,
		projectsReady: state.projectsReady,
	};
}

/**
 * The one replica every screen of the runtime shares: the tasks text, the settings, the undo history, the Projects screen,
 * the ids, the calendars' texts, the project notes and the host's facts. It changes only by `update`, and only when a part
 * is really another value, so its identity is what views are memoised by.
 */
export class Replica {
	private current: ReplicaState;
	private readonly listeners = new Set<() => void>();

	constructor(initial: Partial<ReplicaState> = {}) {
		this.current = { ...EMPTY_REPLICA, ...initial };
	}

	get state(): ReplicaState {
		return this.current;
	}

	context(nowMs: number): DoorContext {
		return contextOf(this.current, nowMs);
	}

	/** Takes the parts given; tells the listeners once when any of them is another value. */
	update(parts: Partial<ReplicaState>): void {
		const before = this.current;
		const changed = (Object.keys(parts) as (keyof ReplicaState)[]).filter((key) => parts[key] !== before[key]);
		if (changed.length === 0) return;
		this.current = { ...before, ...Object.fromEntries(changed.map((key) => [key, parts[key]])) };
		for (const listener of [...this.listeners]) listener();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
