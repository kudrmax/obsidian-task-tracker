import type { CalendarEvent, CalendarService, CalendarSource, DayEvents } from "../../src/application/contracts";
import type { LocalDate } from "../../src/ui/types";

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

	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const events: CalendarEvent[] = date === DEMO_DATE
			? DEMO.map((e, i) => ({ id: `demo-${i}`, title: e.title, start: at(date, e.start), end: at(date, e.end), allDay: e.allDay === true, calendar: e.calendar, color: e.color, source: e.source }))
			: [];
		const count = (source: CalendarSource) => `${events.filter((e) => e.source === source).length} events`;
		const result: DayEvents = {
			events,
			statuses: [
				{ source: "google", ok: true, message: count("google"), updatedAt: GOOGLE_UPDATED, detail: null, stale: false },
				{ source: "work", ok: true, message: count("work"), updatedAt: WORK_EXPORTED, detail: "iPhone", stale: true },
			],
		};
		this.last.set(date, result);
		return result;
	}

	cached(date: LocalDate): DayEvents | null {
		return this.last.get(date) ?? null;
	}

	onChange(): () => void {
		return () => {};
	}
}
