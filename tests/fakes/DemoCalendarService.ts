import { dayWords } from "../../core/application/sourceWords";
import type { CalendarEvent, CalendarPoll, CalendarService, CalendarSource, DayEvents, DayEventsAsk, EventsReason, PolledScreen } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import type { LocalDate } from "../../obsidian/ui/types";
import { DEMO_NOW, FixedClock } from "./DemoClock";

const DEMO_DATE = "2026-10-30";

interface Demo {
	readonly title: string;
	readonly start: number;
	readonly end: number;
	readonly color: string;
	readonly source: CalendarSource;
	readonly calendar: string;
	readonly allDay?: boolean;
}

/** The board's events: four calendars, one of them all day. */
const DEMO: readonly Demo[] = [
	{ title: "День рождения Ани", start: 0, end: 24, color: "#30D158", source: "google", calendar: "Family", allDay: true },
	{ title: "Стендап", start: 9, end: 9.25, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "1:1 с Костей", start: 10, end: 11, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "Обед с Вадимом", start: 12.5, end: 13.5, color: "#FF9F0A", source: "google", calendar: "Personal" },
	{ title: "Планирование спринта", start: 15, end: 16.5, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "Созвон с банком", start: 15.5, end: 16, color: "#FF375F", source: "google", calendar: "Money" },
	{ title: "Тренировка", start: 18, end: 19.5, color: "#30D158", source: "google", calendar: "Family" },
];

const at = (date: LocalDate, hours: number): Date => {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d, Math.floor(hours), Math.round((hours % 1) * 60));
};

/** Google updated today at 14:19; the work file exported yesterday at 08:02 from the iPhone and gone stale, as on the Sources board. */
const GOOGLE_UPDATED = new Date(2026, 9, 30, 14, 19);
const WORK_EXPORTED = new Date(2026, 9, 29, 8, 2);

export class DemoCalendarService implements CalendarService {
	private readonly last = new Map<LocalDate, DayEvents>();

	constructor(private readonly clock: Clock = new FixedClock(DEMO_NOW)) {}

	isPast(event: CalendarEvent): boolean {
		return event.end.getTime() <= this.clock.now().getTime();
	}

	private async eventsOn(date: LocalDate): Promise<DayEvents> {
		const events: CalendarEvent[] = date === DEMO_DATE
			? DEMO.map((e, i) => ({ id: `demo-${i}`, title: e.title, start: at(date, e.start), end: at(date, e.end), allDay: e.allDay === true, calendar: e.calendar, color: e.color, source: e.source, account: null, calendarId: null }))
			: [];
		const count = (source: CalendarSource) => events.filter((e) => e.source === source).length;
		const result: DayEvents = {
			events,
			allDay: events.filter((e) => e.allDay),
			timed: events.filter((e) => !e.allDay),
			statuses: [
				{ source: "google", kind: "synced", problem: null, events: count("google"), updatedAt: GOOGLE_UPDATED, updatedDay: "today", updatedDate: "2026-10-30", detail: null, stale: false, used: true, tone: "plain", words: { name: "Google Calendar", short: "Google", sub: "Updated today", time: "14:19", alert: "" } },
				{ source: "work", kind: "exported", problem: null, events: count("work"), updatedAt: WORK_EXPORTED, updatedDay: "yesterday", updatedDate: "2026-10-29", detail: "iPhone", stale: true, used: true, tone: "old", words: { name: "Work calendar", short: "Work", sub: "Exported from iPhone", time: "Yesterday 08:02", alert: "Out of date" } },
			],
			stale: true,
			alert: "old",
			words: dayWords("old"),
		};
		this.last.set(date, result);
		return result;
	}

	/** Every day's events come at once, the board's day only has any; a peek at a day shown before takes them as they were. */
	async known() {
		return [];
	}

	async setShown(): Promise<void> {}

	events(date: LocalDate, reason: EventsReason): DayEventsAsk {
		const cached = this.last.get(date) ?? null;
		return { cached, fresh: reason === "peek" && cached ? null : () => this.eventsOn(date) };
	}

	onChange(): () => void {
		return () => {};
	}

	/** The board's events never change: no timer, Refresh now fetches them again. */
	keepFresh(screen: PolledScreen): CalendarPoll {
		return { wake: () => undefined, catchUp: () => undefined, refreshNow: () => screen.refresh(), stop: () => undefined };
	}
}
