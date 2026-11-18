import { type CalendarEvent, type CalendarPoll, type CalendarService, type CalendarSource, type Clock, type DayEvents, type DayEventsAsk, type EventsReason, NO_DAY_EVENTS, type PolledScreen } from "../../core/application/contracts";

interface Made {
	readonly title: string;
	/** Hours from the day's midnight. */
	readonly start: number;
	readonly end: number;
	readonly color: string;
	readonly source: CalendarSource;
	readonly calendar: string;
}

/** The days' events: a working day of four calendars, two that overlap; the same on every day so any day the stand shows has some. */
const DAY: readonly Made[] = [
	{ title: "Стендап", start: 9, end: 9.25, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "1:1 с Костей", start: 10, end: 11, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "Обед с Вадимом", start: 12.5, end: 13.5, color: "#FF9F0A", source: "google", calendar: "Personal" },
	{ title: "Планирование спринта", start: 15, end: 16.5, color: "#0A84FF", source: "work", calendar: "Work" },
	{ title: "Созвон с банком", start: 15.5, end: 16, color: "#FF375F", source: "google", calendar: "Money" },
	{ title: "Тренировка", start: 18, end: 19.5, color: "#30D158", source: "google", calendar: "Family" },
];

const at = (date: string, hours: number): Date => {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d, Math.floor(hours), Math.round((hours % 1) * 60));
};

/**
 * The stand's calendars, made up: every day the same events, today also an all-day one. Sources and their states are set
 * by hand in part 2 (spec, «States the stand sets by hand»); here every source is fresh.
 */
export class StandCalendars implements CalendarService {
	private readonly last = new Map<string, DayEvents>();

	constructor(
		private readonly clock: Clock,
		private readonly today: () => string,
	) {}

	isPast(event: CalendarEvent): boolean {
		return event.end.getTime() <= this.clock.now().getTime();
	}

	events(date: string, reason: EventsReason): DayEventsAsk {
		const cached = this.last.get(date) ?? null;
		return { cached, fresh: reason === "peek" && cached ? null : async () => this.made(date) };
	}

	private made(date: string): DayEvents {
		const timed: CalendarEvent[] = DAY.map((e, i) => ({ id: `${date}-${i}`, title: e.title, start: at(date, e.start), end: at(date, e.end), allDay: false, calendar: e.calendar, color: e.color, source: e.source, account: null, calendarId: null }));
		const allDay: CalendarEvent[] =
			date === this.today() ? [{ id: `${date}-all`, title: "День рождения Ани", start: at(date, 0), end: at(date, 24), allDay: true, calendar: "Family", color: "#30D158", source: "google", account: null, calendarId: null }] : [];
		const events = { ...NO_DAY_EVENTS, events: [...allDay, ...timed], allDay, timed };
		this.last.set(date, events);
		return events;
	}

	async known() {
		return [];
	}

	async setShown(): Promise<void> {}

	onChange(): () => void {
		return () => undefined;
	}

	keepFresh(screen: PolledScreen): CalendarPoll {
		return { wake: () => undefined, catchUp: () => undefined, refreshNow: () => screen.refresh(), stop: () => undefined };
	}
}
