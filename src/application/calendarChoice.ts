import type { CalendarFile } from "./calendarFile";
import type { CalendarEvent, CalendarSource } from "./contracts";

/** A calendar across the writers' files: its account (an email; "" when no writer knows it) and its title. */
export interface CalendarKey {
	readonly account: string;
	readonly title: string;
}

/** The same calendar whatever the case its writers spell it in. */
export const keyText = (key: CalendarKey): string => `${key.account}\n${key.title}`.toLowerCase();

/** A calendar some file lists, once however many list it. `google`: it belongs to the Google account the plugin reads. */
export interface KnownCalendar {
	readonly key: CalendarKey;
	readonly color: string | null;
	readonly google: boolean;
}

/** A day's events of the calendars shown, and whether any of them came from a file no longer fresh. */
export interface ChosenDay {
	readonly events: readonly CalendarEvent[];
	readonly stale: boolean;
}

/** Google's own calendars: the API first, then the phone, then Scriptable. Every other calendar: the phone, then Scriptable. */
const GOOGLE_ORDER: readonly CalendarSource[] = ["google", "iphone", "work"];
const OTHER_ORDER: readonly CalendarSource[] = ["iphone", "work"];

interface CalendarRef {
	readonly title: string;
	readonly account: string | null;
	readonly calendarId: string | null;
}

/**
 * Which file each calendar comes from, and which calendars are shown. Each calendar is taken whole from one file:
 * the first in its order that lists it, covers the day and is fresh; none fresh, the freshest of them.
 */
export class CalendarChoice {
	private readonly googleEmail: string | null;
	/** The phone's Google account: the one whose calendar is titled with Google's email, by its id where the phone gives one. */
	private readonly phoneGoogle: { readonly sourceId: string | null; readonly account: string | null } | null;
	/** The phone's calendar ids that belong to Google's account. */
	private readonly phoneGoogleIds: ReadonlySet<string>;
	private readonly hidden: ReadonlySet<string>;

	constructor(
		private readonly files: ReadonlyMap<CalendarSource, CalendarFile>,
		hidden: readonly CalendarKey[],
		private readonly staleAfterMs: number,
		private readonly now: Date,
	) {
		this.googleEmail = files.get("google")?.calendars.find((c) => c.account !== null)?.account ?? null;
		const email = this.googleEmail?.toLowerCase() ?? null;
		const main = email === null ? undefined : files.get("iphone")?.calendars.find((c) => c.title.toLowerCase() === email);
		this.phoneGoogle = main ? { sourceId: main.sourceId ?? null, account: main.account } : null;
		const google = this.phoneGoogle;
		this.phoneGoogleIds = new Set(
			(files.get("iphone")?.calendars ?? [])
				.filter((c) => google !== null && (google.sourceId !== null ? c.sourceId === google.sourceId : c.account === google.account))
				.flatMap((c) => (c.calendarId === null ? [] : [c.calendarId])),
		);
		this.hidden = new Set(hidden.map(keyText));
	}

	known(): readonly KnownCalendar[] {
		const found = new Map<string, KnownCalendar>();
		for (const source of GOOGLE_ORDER) {
			for (const calendar of this.files.get(source)?.calendars ?? []) {
				const key = this.keyOf(source, calendar);
				const text = keyText(key);
				if (!found.has(text)) found.set(text, { key, color: calendar.color, google: source === "google" || this.isGoogle(key) });
			}
		}
		return [...found.values()].sort(
			(a, b) => Number(b.google) - Number(a.google) || byAccount(a.key.account, b.key.account) || a.key.title.localeCompare(b.key.title),
		);
	}

	day(start: Date, end: Date): ChosenDay {
		const events: CalendarEvent[] = [];
		let stale = false;
		for (const calendar of this.known()) {
			if (this.hidden.has(keyText(calendar.key))) continue;
			const source = this.sourceFor(calendar, start);
			if (source === null) continue;
			const file = this.files.get(source)!;
			if (!this.fresh(file)) stale = true;
			const text = keyText(calendar.key);
			events.push(...file.events.filter((e) => keyText(this.keyOf(source, calendarOf(e))) === text && e.start < end && e.end > start));
		}
		return { events: events.sort((a, b) => a.start.getTime() - b.start.getTime()), stale };
	}

	private sourceFor(calendar: KnownCalendar, day: Date): CalendarSource | null {
		const text = keyText(calendar.key);
		const candidates = (calendar.google ? GOOGLE_ORDER : OTHER_ORDER).filter((source) => {
			const file = this.files.get(source);
			return file !== undefined && covers(file, day) && file.calendars.some((c) => keyText(this.keyOf(source, c)) === text);
		});
		const fresh = candidates.find((source) => this.fresh(this.files.get(source)!));
		if (fresh) return fresh;
		return candidates.reduce<CalendarSource | null>(
			(best, source) => (best === null || this.files.get(source)!.exportedAt > this.files.get(best)!.exportedAt ? source : best),
			null,
		);
	}

	private fresh(file: CalendarFile): boolean {
		return this.now.getTime() - file.exportedAt.getTime() <= this.staleAfterMs;
	}

	private isGoogle(key: CalendarKey): boolean {
		return this.googleEmail !== null && key.account === this.googleEmail;
	}

	/** The calendar a file's row or event belongs to, the same across the files. */
	private keyOf(source: CalendarSource, ref: CalendarRef): CalendarKey {
		if (source === "work") return this.scriptableKey(ref);
		if (source === "iphone" && ref.calendarId !== null && this.phoneGoogleIds.has(ref.calendarId)) return { account: this.googleEmail!, title: ref.title };
		return { account: ref.account ?? "", title: ref.title };
	}

	/** Scriptable knows no account: the phone's calendar with the same id, else the only calendar so titled, else its own. */
	private scriptableKey(ref: CalendarRef): CalendarKey {
		const phone = this.files.get("iphone")?.calendars.find((c) => ref.calendarId !== null && c.calendarId === ref.calendarId);
		if (phone) return this.keyOf("iphone", phone);
		const titled = new Map<string, CalendarKey>();
		for (const source of ["google", "iphone"] as const) {
			for (const c of this.files.get(source)?.calendars ?? []) {
				if (c.title !== ref.title) continue;
				const key = this.keyOf(source, c);
				titled.set(keyText(key), key);
			}
		}
		if (titled.size === 1) return [...titled.values()][0];
		return { account: "", title: titled.size === 0 ? ref.title : `iPhone · ${ref.title}` };
	}
}

/** Accounts by name; the calendars no writer gives an account last. */
function byAccount(a: string, b: string): number {
	if (a === b) return 0;
	if (a === "") return 1;
	if (b === "") return -1;
	return a.localeCompare(b);
}

/** The calendar an event sits in, as a file's calendar rows name it. */
function calendarOf(e: CalendarEvent): CalendarRef {
	return { title: e.calendar, account: e.account, calendarId: e.calendarId };
}

/** The file holds the day: within its window, or for a file that names none, between its first and last event. */
function covers(file: CalendarFile, day: Date): boolean {
	if (file.from !== null && file.to !== null) return file.from <= day && day < file.to;
	if (file.events.length === 0) return false;
	const first = Math.min(...file.events.map((e) => e.start.getTime()));
	const last = Math.max(...file.events.map((e) => e.end.getTime()));
	const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
	return first < dayEnd && day.getTime() <= last;
}
