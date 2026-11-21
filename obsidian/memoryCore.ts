import { composeCore, type Core } from "../core/application/composeCore";
import { type CalendarEvent, TasksFileMissingError } from "../core/application/contracts";
import type { CalendarFile } from "../core/application/calendarFile";
import type { EventFile } from "../core/application/EventSource";
import type { Clock, SettingsStore, TaskFileStore } from "../core/application/ports";
import { DEFAULT_SETTINGS, type TaskCalendarSettings } from "../core/settings";

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

/** A calendar's file in memory: the events given, written now, covering every day. */
function eventFile(name: EventFile["name"], events: readonly CalendarEvent[], clock: Clock): EventFile {
	const calendars = [...new Map(events.filter((e) => e.source === name).map((e) => [e.calendar, { title: e.calendar, account: e.account, calendarId: e.calendarId, color: e.color }])).values()];
	const file: CalendarFile = { events: events.filter((e) => e.source === name), calendars, exportedAt: clock.now(), device: null, from: null, to: null, validUntil: null };
	return { name, read: async () => file, onChange: () => () => undefined };
}

export interface MemoryCore {
	readonly core: Core;
	readonly file: MemoryTasksFile;
	readonly clock: Clock;
}

/** The core over `text` as its tasks file, `events` as the Google calendar's, the settings' defaults over `settings`. */
export function memoryCore(text: string, clock: Clock, settings: Partial<TaskCalendarSettings> = {}, events: readonly CalendarEvent[] = []): MemoryCore {
	const file = new MemoryTasksFile(text);
	const core = composeCore({
		tasksFile: file,
		settings: new MemorySettings({ ...DEFAULT_SETTINGS, ...settings }),
		clock,
		ticker: { every: (ms, tick) => {
			const id = setInterval(tick, ms);
			return () => clearInterval(id);
		} },
		timers: { set: (fn, ms) => setTimeout(fn, ms) as unknown as number, clear: (id) => clearTimeout(id) },
		calendarFiles: { google: eventFile("google", events, clock), iphone: eventFile("iphone", events, clock), work: eventFile("work", events, clock) },
		feeds: [],
		work: { export: () => undefined },
		isPhone: () => false,
	});
	return { core, file, clock };
}
