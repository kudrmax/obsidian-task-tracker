import type { EventsReason } from "../../core/application/contracts";
import { tasksFilePath } from "../../core/application/documentText";
import type { Clock, Projects, Timers } from "../../core/application/ports";
import type { DoorAnswer } from "../../core/application/PhoneCalls";
import type { TaskCalendarSettings } from "../../core/settings";
import type { StoreRuntime } from "./dispatch/Program";
import { type Need, ViewAnswers, type Views } from "./dispatch/ViewAnswers";
import { type Notices, type RuntimeEvent, RuntimeEvents } from "./events";
import { ActionLog } from "./lifecycle/ActionLog";
import { MinuteClock, minuteOf } from "./lifecycle/MinuteClock";
import { type CalendarFeed, CalendarLane, type CalendarTexts } from "./network/CalendarLane";
import { PendingLog } from "./persistence/PendingLog";
import { ProjectsScreenLink, type ProjectsScreenSource } from "./persistence/ProjectsScreenLink";
import { Rebaser } from "./persistence/Rebaser";
import { SettingsLink, type SettingsSource } from "./persistence/SettingsLink";
import type { TasksVault } from "./persistence/TasksVault";
import { TasksWriter } from "./persistence/TasksWriter";
import { type Door, InProcessDoor, resultOf } from "./replica/Door";
import { hostOf, type HostReadiness, Readiness } from "./replica/HostFacts";
import { Replica } from "./replica/Replica";
import { type CallOutcome, ReplicaCalls } from "./replica/ReplicaCalls";
import { HostSession } from "./HostSession";

export type { CallOutcome, Need, Views, RuntimeEvent, HostReadiness };
export type { Cmd, Program, Scheduler } from "./dispatch/Program";
export { Store, type StoreOptions } from "./dispatch/Store";
export { HostSession };
export { sectionRef, type SectionRef } from "./replica/refs";

export interface RuntimeDeps<S extends TaskCalendarSettings> {
	readonly vault: TasksVault;
	readonly settings: SettingsSource<S>;
	readonly projectsScreen: ProjectsScreenSource;
	/** The notes that had the project tag, and whether the host has read them all (`VaultProjects`). */
	readonly projects: Required<Pick<Projects, "list" | "ready" | "onChange">>;
	readonly isIosApp: boolean;
	readonly feeds: readonly CalendarFeed[];
	readonly calendarTexts: CalendarTexts;
	/** The phone's export of its calendars, asked first by a refresh (`WorkCalendarSetup.export`). */
	readonly work: { export(): void };
	readonly clock: Clock;
	readonly timers: Timers;
	readonly notices: Notices;
	readonly door?: Door;
}

/**
 * The plugin's runtime (P3, P7, P8): the one replica every screen shares, the door calls over it, the pending calls and
 * their replay, the persistence queue, the network lane, Obsidian's events and the action log. Screens reach the core
 * only through it. It builds the replica once the host is ready, and on unload its persistence queue runs on until empty.
 */
export class Runtime<S extends TaskCalendarSettings = TaskCalendarSettings> implements StoreRuntime {
	readonly replica: Replica;
	readonly log: ActionLog;
	readonly calendars: CalendarLane;
	private readonly events = new RuntimeEvents();
	private readonly pending = new PendingLog();
	private readonly calls: ReplicaCalls;
	private readonly writer: TasksWriter;
	private readonly settings: SettingsLink<S>;
	private readonly projectsScreen: ProjectsScreenLink;
	private readonly viewAnswers: ViewAnswers;
	private readonly clock: MinuteClock;
	private readonly readiness: Readiness;
	private readonly stops: (() => void)[] = [];
	private readonly built: Promise<void>;
	private settleBuilt!: { resolve: () => void; reject: (e: unknown) => void };
	private disposed = false;
	private carryOwner: object | null = null;

	constructor(private readonly deps: RuntimeDeps<S>) {
		const door = deps.door ?? new InProcessDoor();
		const now = () => deps.clock.now().getTime();
		this.log = new ActionLog(now);
		this.replica = new Replica({ host: hostOf(deps.isIosApp), fetched: deps.feeds.map((f) => f.name) });
		const failed = (e: unknown) => this.failed(e);
		this.settings = new SettingsLink(deps.settings, this.replica, failed);
		this.projectsScreen = new ProjectsScreenLink(deps.projectsScreen, this.replica);
		const rebaser = new Rebaser({ door, replica: this.replica, log: this.pending, now, events: this.events, notices: deps.notices, keepProjectsScreen: (s) => this.projectsScreen.save(s) });
		this.writer = new TasksWriter({ vault: deps.vault, replica: this.replica, log: this.pending, rebaser, path: () => this.tasksPath(), failed });
		this.calls = new ReplicaCalls(door, this.replica, this.pending, now, {
			tasksChanged: () => this.writer.schedule(),
			settingsChanged: (text, handed) => this.settings.save(text, handed),
			projectsScreenChanged: (state) => this.projectsScreen.save(state),
		});
		this.viewAnswers = new ViewAnswers({ state: () => this.replica.state, minute: () => minuteOf(now()), read: (m, a) => this.calls.read(m, a) });
		this.calendars = new CalendarLane({ replica: this.replica, read: (m, a) => this.calls.read(m, a), feeds: deps.feeds, texts: deps.calendarTexts, work: deps.work, timers: deps.timers, now, failed });
		this.clock = new MinuteClock({
			timers: deps.timers,
			now,
			today: () => resultOf<string>(this.calls.read("days.today", []), "days.today"),
			minute: () => this.events.emit({ kind: "minute" }),
			newDay: () => this.call("tasks.normalize", []),
			failed,
		});
		this.built = new Promise((resolve, reject) => (this.settleBuilt = { resolve, reject }));
		this.built.catch(() => undefined);
		this.readiness = new Readiness(() => {
			this.build().catch((e: unknown) => this.failed(e));
		});
	}

	/** The host told a fact of its readiness: the replica is built once the layout is ready and the metadata cache resolved. */
	hostReady(fact: HostReadiness): void {
		this.log.record(`host ${fact}`);
		this.readiness.arrive(fact);
	}

	/** Resolves once the replica is built (the file read and tidied), or the runtime unloaded first; rejects if building failed. */
	ready(): Promise<void> {
		return this.built;
	}

	call(method: string, args: readonly unknown[]): CallOutcome {
		return this.calls.call(method, args);
	}

	read(method: string, args: readonly unknown[]): DoorAnswer {
		return this.calls.read(method, args);
	}

	views(needs: readonly Need[]): Views {
		return this.viewAnswers.views(needs);
	}

	subscribe(listener: (event: RuntimeEvent | null) => void): () => void {
		const offReplica = this.replica.onChange(() => listener(null));
		const offEvents = this.events.on(listener);
		return () => {
			offReplica();
			offEvents();
		};
	}

	/** A value the screen writes (the list share, the zoom, the tree's width…): a per-key patch, device keys to the device. */
	updateSettings(patch: Partial<S>): void {
		const handed = this.replica.state.settings;
		this.settings.save(JSON.stringify({ ...JSON.parse(handed === "" ? "{}" : handed), ...patch }), handed);
	}

	/** Resolves once nothing more can be written now: every write landed, or the queue waits on a failure (`stuck`). */
	persisted(): Promise<void> {
		return this.writer.drained();
	}

	/** What the tasks file's writes wait on (a disk error, a missing folder) until the next call, file event or settings change; null for nothing. */
	get stuck(): unknown {
		return this.writer.stuck;
	}

	/** The calendars asked for a reason (open, peek, refresh); `byHand` for Max's Refresh now, which asks the phone to export first. */
	refreshCalendars(reason: EventsReason, byHand = false): Promise<void> {
		return this.calendars.refresh(reason, byHand);
	}

	/** A host's own view of the runtime (the leaf, a note's block, the settings tab): its teardown ends only what it started. */
	openHost(): HostSession {
		return new HostSession({
			log: this.log,
			call: (m, a) => this.call(m, a),
			read: (m, a) => this.read(m, a),
			views: (n) => this.views(n),
			subscribe: (l) => this.subscribe(l),
			carrying: () => this.replica.state.projectsScreen.carry !== undefined,
			claimCarry: (owner) => (this.carryOwner = owner),
			endCarryOf: (owner) => {
				if (this.carryOwner === owner) this.endCarry();
			},
		});
	}

	/** A carry under way ends (`endCarry`), so none stays in the device's storage. */
	private endCarry(): void {
		this.carryOwner = null;
		if (this.replica.state.projectsScreen.carry) this.call("tasks.endCarry", ["nowhere"]);
	}

	/** The plugin unloads: nothing is watched any more, but the persistence queue runs on until it is empty. */
	unload(): Promise<void> {
		this.disposed = true;
		this.settleBuilt.resolve();
		this.endCarry();
		this.clock.stop();
		this.calendars.stop();
		this.stops.splice(0).forEach((stop) => stop());
		return this.writer.drained();
	}

	private async build(): Promise<void> {
		try {
			await this.start();
			this.settleBuilt.resolve();
		} catch (e) {
			this.failed(e);
			this.settleBuilt.reject(e);
		}
	}

	/** Watches what the replica follows, reads the file, starts the clock; stops at once if the runtime unloaded meanwhile. */
	private async start(): Promise<void> {
		if (this.disposed) return;
		const { projects } = this.deps;
		const facts = () => this.replica.update({ projects: projects.list(), projectsReady: this.readiness.has("metadata") && projects.ready() });
		let ready = projects.ready();
		facts();
		this.stops.push(
			this.settings.follow(),
			this.projectsScreen.follow(),
			projects.onChange(() => {
				facts();
				if (!ready && projects.ready() && this.replica.state.tasks !== null) this.call("tasks.normalize", []);
				ready = projects.ready();
			}),
			this.writer.watch(),
			this.calendars.watch(),
			this.deps.settings.onChange(() => this.writer.follow().catch((e: unknown) => this.failed(e))),
		);
		await this.writer.load();
		if (this.disposed) {
			this.stops.splice(0).forEach((stop) => stop());
			return;
		}
		this.clock.start();
	}

	private tasksPath(): string | null {
		return tasksFilePath(this.settings.settings);
	}

	private failed(error: unknown): void {
		this.log.record(`failed ${error instanceof Error ? error.message : String(error)}`);
		this.deps.notices.show(error instanceof Error ? error.message : String(error));
	}
}
