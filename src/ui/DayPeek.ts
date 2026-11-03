import type { CalendarEvent, CalendarService, DayBoundary, DayView, TaskService } from "../application/contracts";
import { renderAllDayRows } from "./AllDayRow";
import { PROPERTY } from "./design";
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
	/** How far the shown day's list is scrolled: the next day's opens there too. */
	listScroll(): number;
	/** Stands the next day's timeline as the shown day's stands, every minute at the same height: the hours stand still. */
	alignTimeline(timeline: Timeline): void;
	/** The shown day's rows of all-day events past the first: the next day's timeline starts where the shown one does. */
	allDayExtraRows(): string;
}

/**
 * Another day under the screen while a finger draws it in: its list, its cards and events on the timeline and its
 * all-day events, each in the screen's own column, out of reach of the fingers. The header and the hours are the
 * screen's own, which stand still. Its tasks and the events last fetched for it come in a moment after.
 */
export class DayPeek {
	readonly el: HTMLElement;
	/** The day's list column and its timeline column, standing where the screen's own do. */
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
			void deps.calendars.eventsAround(date).then((events) => {
				this.events = events.events;
				this.render();
			});
		void deps.tasks.dayView(date).then((day) => {
			this.day = day;
			this.render();
			this.list.el.scrollTop = deps.listScroll();
			deps.alignTimeline(this.timeline);
		});
		this.render();
		deps.alignTimeline(this.timeline);
		this.list.el.scrollTop = deps.listScroll();
	}

	/** What shows this day in the list column: its list. */
	listParts(): HTMLElement[] {
		return [this.list.el];
	}

	/** What shows this day in the timeline column: its cards, events and now line, and its all-day events. */
	timelineParts(): HTMLElement[] {
		return [...this.timeline.dayLayers(), ...this.allDayEl.querySelectorAll<HTMLElement>(".tc-allday")];
	}

	remove(): void {
		this.removed = true;
		this.el.remove();
	}

	private render(): void {
		if (this.removed) return;
		this.list.render();
		renderAllDayRows(this.allDayEl, this.right, this.events.filter((e) => e.allDay), this.deps.theme());
		this.right.style.setProperty(PROPERTY.allDayExtraRows, this.deps.allDayExtraRows());
		this.timeline.render();
	}
}
