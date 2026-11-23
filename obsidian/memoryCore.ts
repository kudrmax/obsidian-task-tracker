import { composeCore, type Core } from "../core/application/composeCore";
import { type CalendarEvent, type HostModels, type ModelQuestion, type ModelReply, type ModelTransport, type ScreenSettingsStore, type StopSignal, TasksFileMissingError } from "../core/application/contracts";
import { ScreenSettingsImpl } from "../core/application/ScreenSettingsImpl";
import type { CalendarFile } from "../core/application/calendarFile";
import type { EventFile } from "../core/application/EventSource";
import type { Clock, ProjectsScreenStore, SettingsStore, TaskFileStore } from "../core/application/ports";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../core/settings";
import type { DeviceViewKeys } from "./adapters/DeviceSettings";
import { type ViewSettings, viewSettingsFrom } from "./settingsFile";

/**
 * The core over a tasks file kept in memory (the plan, steps 5–6: the stand runs on `CorePort` over an in-memory copy of
 * its fixture file; the port's contract runs on it too). A write waits `delay` ms before it lands, as a real write and its
 * read-back do; the file's text is what the checks read.
 */
export class MemoryTasksFile implements TaskFileStore {
	delay = 0;
	private readonly listeners = new Set<() => void>();

	constructor(public text: string | null) {}

	async read(): Promise<string | null> {
		return this.text;
	}

	async write(fn: (text: string) => string): Promise<void> {
		if (this.text === null) throw new TasksFileMissingError("memory");
		if (this.delay > 0) await new Promise((resolve) => setTimeout(resolve, this.delay));
		this.text = fn(this.text);
		this.changed();
	}

	async create(text: string): Promise<void> {
		this.text = text;
		this.changed();
	}

	/** The file replaced from outside, as a hand edit or Sync does. */
	replace(text: string): void {
		this.text = text;
		this.changed();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}
}

class MemorySettings implements SettingsStore {
	private readonly listeners = new Set<() => void>();

	constructor(private current: TaskCalendarSettings) {}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		this.current = { ...this.current, ...patch };
		for (const listener of this.listeners) listener();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

/** The calendars' events in memory, every source's file over them: replaced, each file says it changed, as a writer's new file does. */
export class MemoryEvents {
	private readonly listeners = new Set<() => void>();

	constructor(
		private events: readonly CalendarEvent[],
		private readonly clock: Clock,
	) {}

	replace(events: readonly CalendarEvent[]): void {
		this.events = events;
		for (const listener of this.listeners) listener();
	}

	/** The file of `name`: its events, written now, covering every day. */
	file(name: EventFile["name"]): EventFile {
		return {
			name,
			read: async () => {
				const own = this.events.filter((e) => e.source === name);
				const calendars = [...new Map(own.map((e) => [e.calendar, { title: e.calendar, account: e.account, calendarId: e.calendarId, color: e.color }])).values()];
				const file: CalendarFile = { events: own, calendars, exportedAt: this.clock.now(), device: null, from: null, to: null, validUntil: null };
				return file;
			},
			onChange: (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			},
		};
	}
}

export interface MemoryCore {
	readonly core: Core;
	readonly file: MemoryTasksFile;
	readonly events: MemoryEvents;
	readonly settings: SettingsStore;
	/** The settings as a screen reads them: the levels, labels and card size the host paints. */
	readonly screenSettings: ScreenSettingsStore;
	readonly clock: Clock;
}

/**
 * The core over `text` as its tasks file, `events` as the Google calendar's, the settings' defaults over `settings`; the
 * device's Projects screen in `projectsScreen` (kept in memory when left out).
 */
export function memoryCore(text: string | null, clock: Clock, settings: Partial<TaskCalendarSettings> = {}, events: readonly CalendarEvent[] = [], projectsScreen?: ProjectsScreenStore, models?: HostModels): MemoryCore {
	const file = new MemoryTasksFile(text);
	const calendar = new MemoryEvents(events, clock);
	const store = new MemorySettings({ ...DEFAULT_SETTINGS, ...settings });
	const core = composeCore({
		tasksFile: file,
		settings: store,
		clock,
		ticker: { every: (ms, tick) => {
			const id = setInterval(tick, ms);
			return () => clearInterval(id);
		} },
		timers: { set: (fn, ms) => setTimeout(fn, ms) as unknown as number, clear: (id) => clearTimeout(id) },
		calendarFiles: { google: calendar.file("google"), iphone: calendar.file("iphone"), work: calendar.file("work") },
		feeds: [],
		work: { export: () => undefined },
		isPhone: () => false,
		...(projectsScreen && { projectsScreen }),
		...(models && { models }),
	});
	return { core, file, events: calendar, settings: store, screenSettings: new ScreenSettingsImpl(store), clock };
}

const candidatesOf = (question: ModelQuestion): readonly { readonly ref: string; readonly title: string }[] => (JSON.parse(question.input) as { candidates: { ref: string; title: string }[] }).candidates;

/**
 * A model in memory, the stand's (the plan: the assistant calls an LLM, never run against Max's data in tests — faked): «claude» served
 * on the desktop, each question waiting until the stand answers it by hand, naming one of its candidates by title or
 * failing; Stop and the timeout end it as Claude Code's transport does.
 */
export class MemoryModel implements ModelTransport {
	private waiting: { readonly question: ModelQuestion; readonly reply: (reply: ModelReply) => void } | null = null;

	/** The models the stand's core serves: Claude, by this transport. */
	readonly models: HostModels = { ids: ["claude"], transport: () => async () => this };

	ask(question: ModelQuestion, _settings: Readonly<Record<string, string>>, stop: StopSignal): Promise<ModelReply> {
		return new Promise((resolve) => {
			this.waiting = { question, reply: resolve };
			stop.onStop((reason) => {
				this.waiting = null;
				resolve({ ok: false, failure: { kind: reason === "user" ? "stopped" : "timeout", detail: `stopped: ${reason}` } });
			});
		});
	}

	/** Whether a question waits for its answer. */
	get asked(): boolean {
		return this.waiting !== null;
	}

	/** The titles the waiting question offers to choose from. */
	candidates(): readonly string[] {
		return this.waiting ? candidatesOf(this.waiting.question).map((c) => c.title) : [];
	}

	/** The waiting question answered: the candidate titled `title`, with `reason`. */
	answer(title: string, reason: string): void {
		const waiting = this.take();
		const candidates = candidatesOf(waiting.question);
		const chosen = candidates.find((candidate) => candidate.title === title);
		if (!chosen) throw new Error(`no candidate «${title}» among ${candidates.map((c) => c.title).join(", ")}`);
		waiting.reply({ ok: true, answer: { taskRef: chosen.ref, reason } });
	}

	/** The waiting question failed as an offline Claude fails. */
	fail(): void {
		this.take().reply({ ok: false, failure: { kind: "offline", detail: "the stand's model is offline" } });
	}

	private take(): NonNullable<MemoryModel["waiting"]> {
		const waiting = this.waiting;
		if (!waiting) throw new Error("no question waits");
		this.waiting = null;
		return waiting;
	}
}

/**
 * The device's keys of the screen (the divider's share, the zoom, the tree's width) kept by `load` and `save` under one
 * key, the defaults for what was never kept: what `DeviceSettings` reads where there is no plugin's settings file.
 */
export function keptDevice(load: () => unknown, save: (value: ViewSettings) => void): DeviceViewKeys {
	return {
		get: () => viewSettingsFrom(load()),
		update: async (patch) => save({ ...viewSettingsFrom(load()), ...patch }),
	};
}
