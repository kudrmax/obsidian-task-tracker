import type { CalendarEvent, CalendarService, DayBoundary, DayView, TaskService } from "../application/contracts";
import { renderAllDayRows } from "./AllDayRow";
import { dayTitle } from "./dayTitle";
import { el } from "./dom";
import type { Theme } from "./eventColors";
import { TaskList } from "./TaskList";
import { Timeline } from "./Timeline";
import type { LocalDate } from "./types";

export interface DayPeekDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	theme(): Theme;
	today(): LocalDate;
	boundary(): DayBoundary;
	hourPx(): number;
	now(): Date;
	/** Whether the day's list shows its sections. */
	grouped(date: LocalDate): boolean;
	ungroupedName(): string;
	/** Puts the day's timeline where the screen opens it for that day. */
	scrollTimeline(timeline: Timeline, date: LocalDate): void;
	/** How far the shown day's list is scrolled: the next day's opens there too. */
	listScroll(): number;
}

/**
 * Another day under the screen while a finger draws it in: its header, its list and its timeline drawn as the screen
 * would draw them, each in the screen's own column, out of reach of the fingers. Its tasks and the events last fetched for it come in a moment after.
 */
export class DayPeek {
	readonly el: HTMLElement;
	/** The day's header, its list column and its timeline column, standing where the screen's own do. */
	readonly nav: HTMLElement | null = null;
	readonly left: HTMLElement;
	readonly right: HTMLElement;
	private day: DayView | null = null;
	private events: readonly CalendarEvent[] = [];
	private readonly list: TaskList;
	private readonly allDayEl: HTMLElement;
	private readonly timeline: Timeline;
	private removed = false;

	constructor(
		root: HTMLElement,
		readonly date: LocalDate,
		private readonly deps: DayPeekDeps,
	) {
		this.el = el(null, "div", "tc-peek");
		this.el.setAttribute("aria-hidden", "true");
		root.insertBefore(this.el, root.querySelector(":scope > .tc-fade"));
		const nav = root.querySelector(":scope > .tc-day-nav")?.cloneNode(true);
		if (nav instanceof HTMLElement) {
			this.nav = nav;
			this.el.appendChild(nav);
			const title = nav.querySelector(".tc-day-title");
			if (title) title.textContent = dayTitle(date, deps.today());
		}
		this.left = el(this.el, "div", "tc-left");
		this.list = new TaskList(el(this.left, "div"), {
			items: () => this.day?.list ?? [],
			day: () => date,
			grouped: () => deps.grouped(date),
			ungroupedName: () => deps.ungroupedName(),
		});
		this.right = el(this.el, "div", "tc-right");
		this.allDayEl = el(this.right, "div");
		this.timeline = new Timeline(el(this.right, "div"), {
			theme: () => deps.theme(),
			date: () => date,
			today: () => deps.today(),
			boundary: () => deps.boundary(),
			hourPx: () => deps.hourPx(),
			tasks: () => this.day?.slotted ?? [],
			events: () => this.events,
			now: () => deps.now(),
		});
		const cached = deps.calendars.cached(date);
		if (cached) this.events = cached.events;
		else
			void deps.calendars.eventsOn(date).then((events) => {
				this.events = events.events;
				this.render();
			});
		void deps.tasks.dayView(date).then((day) => {
			this.day = day;
			this.render();
			this.list.el.scrollTop = deps.listScroll();
		});
		this.render();
		deps.scrollTimeline(this.timeline, date);
		this.list.el.scrollTop = deps.listScroll();
	}

	remove(): void {
		this.removed = true;
		this.el.remove();
	}

	private render(): void {
		if (this.removed) return;
		this.list.render();
		renderAllDayRows(this.allDayEl, this.right, this.events.filter((e) => e.allDay), this.deps.theme());
		this.timeline.render();
	}
}
