import type { CalendarEvent, DayEvents, SourceStatus } from "../application/contracts";
import type { EventCache } from "../application/ports";
import type { LocalDate } from "../domain/Task";

/** The device's own storage (Obsidian's `loadLocalStorage` / `saveLocalStorage`): per vault, not synced. */
export interface DeviceStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

const KEY = "task-calendar:events";
const VERSION = 1;

type StoredEvent = Omit<CalendarEvent, "start" | "end"> & { readonly start: string; readonly end: string };
type StoredStatus = Omit<SourceStatus, "updatedAt"> & { readonly updatedAt: string | null };
interface StoredDay {
	readonly events: readonly StoredEvent[];
	readonly statuses: readonly StoredStatus[];
}
interface StoredCache {
	readonly version: number;
	readonly days: readonly (readonly [LocalDate, StoredDay])[];
}

const validDate = (date: Date): boolean => !Number.isNaN(date.getTime());

function eventFrom(stored: StoredEvent): CalendarEvent {
	return { ...stored, start: new Date(stored.start), end: new Date(stored.end) };
}

function statusFrom(stored: StoredStatus): SourceStatus {
	return { ...stored, updatedAt: stored.updatedAt === null ? null : new Date(stored.updatedAt) };
}

function dayFrom(stored: StoredDay): DayEvents {
	return {
		events: stored.events.map(eventFrom).filter((e) => validDate(e.start) && validDate(e.end)),
		statuses: stored.statuses.map(statusFrom).filter((s) => s.updatedAt === null || validDate(s.updatedAt)),
	};
}

function dayTo(day: DayEvents): StoredDay {
	return {
		events: day.events.map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() })),
		statuses: day.statuses.map((s) => ({ ...s, updatedAt: s.updatedAt?.toISOString() ?? null })),
	};
}

/** The events cache in the device's storage. Anything unreadable there counts as an empty cache. */
export class DeviceEventCache implements EventCache {
	constructor(private readonly storage: DeviceStorage) {}

	read(): ReadonlyMap<LocalDate, DayEvents> {
		const stored = this.storage.loadLocalStorage(KEY) as StoredCache | null;
		if (stored?.version !== VERSION || !Array.isArray(stored.days)) return new Map();
		try {
			return new Map(stored.days.map(([date, day]) => [date, dayFrom(day)]));
		} catch {
			return new Map();
		}
	}

	write(days: ReadonlyMap<LocalDate, DayEvents>): void {
		const stored: StoredCache = { version: VERSION, days: [...days].map(([date, day]) => [date, dayTo(day)]) };
		this.storage.saveLocalStorage(KEY, stored);
	}
}
