import { describe, expect, it } from "vitest";
import { dayWords } from "../../core/application/sourceWords";
import { type CalendarEvent, type CalendarPoll, type CalendarService, type DayEvents, type DayEventsAsk, type EventsReason, type ScreenView, type TaskService } from "../../core/application/contracts";
import { DayData, type DayPart } from "../../obsidian/ui/DayData";
import type { LocalDate } from "../../obsidian/ui/types";
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
	account: null,
	calendarId: null,
});

/** A network that answers only when the test lets it. */
/** The screen `TaskService.screen` reads without a tasks file. */
const noFile = async (date: LocalDate): Promise<ScreenView> => {
	const none = { inbox: [], backlog: [], soon: [], now: [] };
	return { day: { date, list: [], slotted: [] }, soon: [], inbox: [], backlog: [], done: [], sections: none, offer: { lists: none, ungrouped: "" }, missing: true, calendars: false, projectTree: [], titleDrops: { day: { kind: "list", column: "day", before: null }, soon: { kind: "title", list: "soon", date: null }, inbox: { kind: "title", list: "inbox", date: null }, backlog: { kind: "title", list: "backlog", date: null } } };
};

class SlowCalendars implements CalendarService {
	readonly asked: LocalDate[] = [];
	readonly around: LocalDate[] = [];
	private readonly waiting: (() => void)[] = [];
	readonly last = new Map<LocalDate, DayEvents>();

	isPast(): boolean {
		return false;
	}

	/** `asked`: the day alone was fetched; `around`: the day with its neighbours. */
	events(date: LocalDate, reason: EventsReason): DayEventsAsk {
		const cached = this.last.get(date) ?? null;
		if (reason === "peek" && cached) return { cached, fresh: null };
		return { cached, fresh: () => (reason === "refresh" ? this.eventsOn(date) : this.eventsAround(date)) };
	}

	eventsOn(date: LocalDate): Promise<DayEvents> {
		this.asked.push(date);
		return this.fetch(date);
	}

	eventsAround(date: LocalDate): Promise<DayEvents> {
		this.around.push(date);
		return this.fetch(date);
	}

	private fetch(date: LocalDate): Promise<DayEvents> {
		return new Promise((resolve) =>
			this.waiting.push(() => {
				const day: DayEvents = { events: [event(`on ${date}`)], allDay: [], timed: [event(`on ${date}`)], statuses: [], stale: false, alert: "none", words: dayWords("none") };
				this.last.set(date, day);
				resolve(day);
			}),
		);
	}

	onChange(): () => void {
		return () => {};
	}

	async known() {
		return [];
	}

	async setShown(): Promise<void> {}

	keepFresh(): CalendarPoll {
		throw new Error("DayData does not poll");
	}

	answer(): void {
		for (const answer of this.waiting.splice(0)) answer();
	}
}

function setup(tasks: TaskService = new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) })) {
	const calendars = new SlowCalendars();
	let date: LocalDate = TODAY;
	const parts: DayPart[] = [];
	const data = new DayData({ tasks, calendars, date: () => date, onUpdate: (part) => parts.push(part) });
	return { data, tasks, calendars, setDate: (d: LocalDate) => (date = d), updates: () => parts.length, parts };
}

const titles = (data: DayData) => data.events.map((e) => e.title);
/** Lets an answered fetch reach the screen. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("DayData", () => {
	it("the view opens asking for the day with its neighbours", async () => {
		const { data, calendars } = setup();
		await data.load();
		expect(calendars.around).toEqual([TODAY]);
		expect(calendars.asked).toEqual([]);
	});

	it("reads the sections the menus offer with the lists, for the day shown", async () => {
		const tasks: TaskService = new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) });
		const asked: LocalDate[] = [];
		const screen = tasks.screen.bind(tasks);
		tasks.screen = (date) => (asked.push(date), screen(date));
		const { data, setDate } = setup(tasks);
		setDate(TOMORROW);
		await data.tasks();
		expect(asked).toEqual([TOMORROW]);
		expect(data.offer).toEqual((await screen(TOMORROW)).offer);
	});

	it("another day asks for it with its neighbours", async () => {
		const { data, calendars, setDate } = setup();
		setDate(TOMORROW);
		void data.selectDay();
		expect(calendars.around).toEqual([TOMORROW]);
		expect(calendars.asked).toEqual([]);
	});

	it("a poll asks for the shown day alone", async () => {
		const { data, calendars } = setup();
		void data.calendars();
		expect(calendars.asked).toEqual([TODAY]);
		expect(calendars.around).toEqual([]);
	});

	it("a poll during the opening of a day is served by a fetch of the day alone after it", async () => {
		const { data, calendars, setDate } = setup();
		setDate(TOMORROW);
		const selected = data.selectDay();
		const polled = data.calendars();
		calendars.answer();
		await settled();
		calendars.answer();
		await Promise.all([selected, polled]);
		expect(calendars.around).toEqual([TOMORROW]);
		expect(calendars.asked).toEqual([TOMORROW]);
	});

	it("a day changed during the fetch is asked for with its neighbours after it", async () => {
		const { data, calendars, setDate } = setup();
		setDate(TODAY);
		const first = data.selectDay();
		setDate(TOMORROW);
		const second = data.selectDay();
		calendars.answer();
		await settled();
		calendars.answer();
		await Promise.all([first, second]);
		expect(calendars.around).toEqual([TODAY, TOMORROW]);
		expect(calendars.asked).toEqual([]);
		expect(titles(data)).toEqual([`on ${TOMORROW}`]);
	});

	it("reads what a drop on each column's title means with the lists; nothing before", async () => {
		const tasks: TaskService = new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) });
		const { data } = setup(tasks);
		expect(data.titleDrop("backlog")).toBeNull();
		await data.tasks();
		const { titleDrops } = await tasks.screen(TODAY);
		expect(data.titleDrop("backlog")).toEqual(titleDrops.backlog);
		expect(data.titleDrop("day")).toEqual(titleDrops.day);
	});

	it("reads Backlog with the other lists", async () => {
		const { data } = setup();
		await data.tasks();
		expect(data.backlog.map((t) => t.text)).toEqual(["Выучить японский", "Сделать сайт-портфолио", "Съездить в Грузию", "Пройти курс по Rust"]);
		expect(data.backlog[0].key.section).toBe("backlog");
	});

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

	it("the dot is the day's alert, not every source's", async () => {
		const { data, calendars } = setup();
		const fine = { source: "iphone" as const, kind: "exported" as const, problem: null, events: 0, updatedAt: null, updatedDay: null, updatedDate: null, detail: null, stale: true, used: false, tone: "spare" as const, words: { name: "iPhone calendars" as const, short: "iPhone" as const, sub: "Exported from file", time: "", alert: "" } };
		calendars.last.set(TODAY, { events: [event("kept")], allDay: [], timed: [event("kept")], statuses: [fine], stale: false, alert: "none", words: dayWords("none") });
		void data.load();
		expect(data.alert).toBe("none");
	});

	it("tells the events changed when only the dot turns from orange to red", async () => {
		const { data, calendars, parts } = setup();
		const work = (tone: "old" | "broken") => ({ events: [event("same")], allDay: [], timed: [event("same")], statuses: [{ source: "work" as const, kind: "exported" as const, problem: tone === "broken" ? { kind: "fileMissing" as const } : null, events: 1, updatedAt: new Date(0), updatedDay: "other" as const, updatedDate: "2026-11-01", detail: null, stale: true, used: true, tone, words: { name: "Work calendar" as const, short: "Work" as const, sub: "Exported from iPhone", time: "1 Nov 00:00", alert: "" } }], stale: true, alert: tone, words: dayWords(tone) });
		let tone: "old" | "broken" = "old";
		calendars.eventsOn = async () => work(tone);
		await data.calendars();
		expect(data.alert).toBe("old");
		tone = "broken";
		await data.calendars();
		expect(data.alert).toBe("broken");
		expect(parts).toEqual(["events", "events"]);
	});

	it("opens with the events last fetched for the day and swaps in the fresh ones when they come", async () => {
		const { data, calendars } = setup();
		calendars.last.set(TODAY, { events: [event("kept")], allDay: [], timed: [event("kept")], statuses: [], stale: false, alert: "none", words: dayWords("none") });
		const opened = data.load();
		expect(titles(data)).toEqual(["kept"]);
		calendars.answer();
		await opened;
		expect(titles(data)).toEqual([`on ${TODAY}`]);
	});

	it("opens without waiting for the network: the tasks and the events last fetched at once, the fresh events later", async () => {
		const { data, calendars, updates } = setup();
		calendars.last.set(TODAY, { events: [event("kept")], allDay: [], timed: [event("kept")], statuses: [], stale: false, alert: "none", words: dayWords("none") });
		await data.load();
		expect(data.day!.date).toBe(TODAY);
		expect(titles(data)).toEqual(["kept"]);
		const shown = updates();
		calendars.answer();
		await settled();
		expect(titles(data)).toEqual([`on ${TODAY}`]);
		expect(updates()).toBe(shown + 1);
	});

	it("opens with no events when none were ever fetched for the day", async () => {
		const { data } = setup();
		await data.load();
		expect(data.day!.date).toBe(TODAY);
		expect(titles(data)).toEqual([]);
	});

	it("shows nothing of a missing file, and no events or statuses while the screen read shows no calendars", async () => {
		const missing = { screen: noFile } as unknown as TaskService;
		const { data, calendars } = setup(missing);
		const opened = data.load();
		calendars.answer();
		await opened;
		await settled();
		expect(data.missing).toBe(true);
		expect(data.day).toBeNull();
		expect(data.soon).toEqual([]);
		expect(data.events).toEqual([]);
		expect(data.statuses).toEqual([]);
	});

	it("tells the events changed when the file comes back: the all-day rows hid with it", async () => {
		let gone = true;
		const demo = new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) });
		const flaky = new Proxy(demo, {
			get: (target, name, receiver) => (gone && name === "screen" ? noFile : Reflect.get(target, name, receiver)),
		});
		const { data, calendars, parts } = setup(flaky);
		const opened = data.load();
		calendars.answer();
		await opened;
		await settled();
		parts.length = 0;
		gone = false;
		await data.tasks();
		expect(parts).toEqual(["tasks", "events"]);
	});

	it("tells the tasks changed and not the events", async () => {
		const { data, tasks, parts } = setup();
		await data.tasks();
		parts.splice(0);
		await tasks.rename(data.day!.list[0].key, "Renamed");
		await data.tasks();
		expect(parts).toEqual(["tasks"]);
	});

	it("stays silent when the tasks read are the same", async () => {
		const { data, parts } = setup();
		await data.tasks();
		await data.tasks();
		expect(parts).toEqual(["tasks"]);
	});

	it("stays silent when a poll brings the same events", async () => {
		const { data, calendars, parts } = setup();
		for (let poll = 0; poll < 2; poll++) {
			const fetched = data.calendars();
			calendars.answer();
			await fetched;
		}
		expect(parts).toEqual(["events"]);
	});

	it("stays silent when a poll brings the same events only fetched later", async () => {
		const { data, calendars, parts } = setup();
		const later = (at: number) => ({ events: [event("same")], allDay: [], timed: [event("same")], statuses: [{ source: "google" as const, kind: "synced" as const, problem: null, events: 1, updatedAt: new Date(at), updatedDay: "other" as const, updatedDate: "2026-11-01", detail: null, stale: false, used: true, tone: "plain" as const, words: { name: "Google Calendar" as const, short: "Google" as const, sub: "Updated 1 Nov", time: `1 Nov 00:00:0${at}`, alert: "" } }], stale: false, alert: "none" as const, words: dayWords("none") });
		let at = 0;
		calendars.eventsOn = async () => later(at++);
		await data.calendars();
		await data.calendars();
		expect(parts).toEqual(["events"]);
		expect(data.statuses[0].updatedAt).toEqual(new Date(1));
	});

	it("tells the events changed when a poll brings new ones", async () => {
		const { data, calendars, setDate, parts } = setup();
		const first = data.calendars();
		calendars.answer();
		await first;
		setDate(TOMORROW);
		const second = data.calendars();
		calendars.answer();
		await second;
		expect(parts).toEqual(["events", "events"]);
	});

	it("runs beforeShow before telling the tasks changed", async () => {
		const order: string[] = [];
		const calendars = new SlowCalendars();
		const data = new DayData({ tasks: new DemoTaskService({ now: () => new Date(2026, 9, 30, 14) }), calendars, date: () => TODAY, onUpdate: (part) => order.push(part) });
		await data.tasks(() => order.push("before"));
		expect(order).toEqual(["before", "tasks"]);
	});

	it("runs beforeShow once what was read is the data, so it sees the tasks the screen is about to draw", async () => {
		const { data, tasks } = setup();
		await data.tasks();
		await tasks.rename(data.day!.list[0].key, "Renamed");
		let seen = "";
		await data.tasks(() => (seen = data.day!.list[0].text));
		expect(seen).toBe("Renamed");
	});

	it("runs beforeShow even when the tasks read are the same", async () => {
		const { data, updates } = setup();
		await data.tasks();
		const shown = updates();
		let before = 0;
		await data.tasks(() => before++);
		expect(before).toBe(1);
		expect(updates()).toBe(shown);
	});
});

