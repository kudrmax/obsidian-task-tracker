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

export class DemoCalendarService implements CalendarService {
	async eventsOn(date: LocalDate): Promise<DayEvents> {
		const events: CalendarEvent[] = date === DEMO_DATE
			? DEMO.map((e, i) => ({ id: `demo-${i}`, title: e.title, start: at(date, e.start), end: at(date, e.end), allDay: e.allDay === true, calendar: e.calendar, color: e.color, source: e.source }))
			: [];
		return {
			events,
			statuses: [
				{ source: "work", ok: true, message: `${events.filter((e) => e.source === "work").length} events`, updatedAt: at(date, 14) },
				{ source: "google", ok: true, message: `${events.filter((e) => e.source === "google").length} events`, updatedAt: at(date, 14) },
			],
		};
	}
}
