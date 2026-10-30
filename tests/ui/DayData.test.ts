import { describe, expect, it } from "vitest";
import { type CalendarEvent, type CalendarService, type DayEvents, TasksFileMissingError, type TaskService } from "../../src/application/contracts";
import { DayData } from "../../src/ui/DayData";
import type { LocalDate } from "../../src/ui/types";
import { DemoTaskService } from "../fakes/DemoTaskService";

const TODAY = "2026-10-30";
const TOMORROW = "2026-10-31";

const event = (title: string): CalendarEvent => ({
	id: title,
	title,
	start: new Date(2026, 9, 30, 10),
	end: new Date(2026, 9, 30, 11),
	allDay: false,
	calendar: "Work",
	color: "#0A84FF",
	source: "google",
});

/** A network that answers only when the test lets it. */
class SlowCalendars implements CalendarService {
	readonly asked: LocalDate[] = [];
	private readonly waiting: (() => void)[] = [];
	private readonly last = new Map<LocalDate, DayEvents>();

	eventsOn(date: LocalDate): Promise<DayEvents> {
		this.asked.push(date);
		return new Promise((resolve) =>
			this.waiting.push(() => {
				const day = { events: [event(`on ${date}`)], statuses: [] };
				this.last.set(date, day);
				resolve(day);
			}),
		);
	}

	cached(date: LocalDate): DayEvents | null {
		return this.last.get(date) ?? null;
	}

	onChange(): () => void {
		return () => {};
	}

	answer(): void {
		for (const answer of this.waiting.splice(0)) answer();
	}
}

function setup(tasks: TaskService = new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) })) {
	const calendars = new SlowCalendars();
	let date: LocalDate = TODAY;
	let updates = 0;
	const data = new DayData({ tasks, calendars, date: () => date, onUpdate: () => updates++ });
	return { data, tasks, calendars, setDate: (d: LocalDate) => (date = d), updates: () => updates };
}

const titles = (data: DayData) => data.events.map((e) => e.title);

describe("DayData", () => {
	it("shows a change to the tasks without asking the calendars", async () => {
		const { data, tasks, calendars, updates } = setup();
		await data.tasks();
		const first = data.day!.list[0];
		await tasks.rename(first.key, "Renamed");
		await data.tasks();
		expect(data.day!.list[0].text).toBe("Renamed");
		expect(updates()).toBe(2);
		expect(calendars.asked).toEqual([]);
	});

	it("shows the tasks of another day at once, its cached events meanwhile, and the fresh events when they come", async () => {
		const { data, calendars, setDate, updates } = setup();
		const opened = data.load();
		calendars.answer();
		await opened;
		expect(titles(data)).toEqual([`on ${TODAY}`]);
		setDate(TOMORROW);
		const selected = data.selectDay();
		await data.tasks();
		expect(data.day!.date).toBe(TOMORROW);
		expect(titles(data)).toEqual([]);
		const shown = updates();
		calendars.answer();
		await selected;
		expect(titles(data)).toEqual([`on ${TOMORROW}`]);
		expect(updates()).toBe(shown + 1);
	});

	it("shows nothing of a missing file, and no events or statuses with it", async () => {
		const missing = { normalize: async () => { throw new TasksFileMissingError("Tasks.md"); } } as unknown as TaskService;
		const { data, calendars } = setup(missing);
		const opened = data.load();
		calendars.answer();
		await opened;
		expect(data.missing).toBe(true);
		expect(data.day).toBeNull();
		expect(data.soon).toEqual([]);
		expect(data.events).toEqual([]);
		expect(data.statuses).toEqual([]);
	});
});
