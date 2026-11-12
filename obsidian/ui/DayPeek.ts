import type { CalendarService, DayBoundary, DayEvents, DayRelation, DayView, ListSection, ProjectsNodeId, TaskService } from "../../core/application/contracts";
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
	/** How a day stands to today: the now line stands on today. */
	relation(date: LocalDate): DayRelation;
	boundary(): DayBoundary;
	hourPx(): number;
	now(): Date;
	/** The groups of the list whose sections the day's column shows, where its empty sections stand; null when it shows none. */
	sections(date: LocalDate): readonly ListSection[] | null;
	ungroupedName(): string;
	/** How far the shown day's list is scrolled: the next day's opens there too. */
	listScroll(): number;
	/** Stands the next day's timeline as the shown day's stands, every minute at the same height: the hours stand still. */
	alignTimeline(timeline: Timeline): void;
	/** The shown day's rows of all-day events past the first: the next day's timeline starts where the shown one does. */
	allDayExtraRows(): string;
	/** The filter the screen is read with (`FunnelView.filter`): the next day shows only its tasks too; null for none. */
	filter?(): ProjectsNodeId | null;
	/** The words of an empty section's plate (`ViewChoice.emptyLabel`). */
	emptyLabel?(): string;
	/**
	 * Where the shown day stands: the day's list (the layout's `dayLane`; none where the day's list is a row of a stack
	 * or not drawn) and the timeline's column. The next day's columns stand exactly over them, whatever the layout.
	 */
	frames?(): { readonly list: HTMLElement | null; readonly timeline: HTMLElement };
}

/** `part` over `frame`, box for box: its place in the screen, its size and its padding. */
function standOver(part: HTMLElement, frame: HTMLElement, root: HTMLElement): void {
	const at = frame.getBoundingClientRect();
	const origin = root.getBoundingClientRect();
	const style = part.style;
	style.left = `${at.left - origin.left}px`;
	style.top = `${at.top - origin.top}px`;
	style.width = `${at.width}px`;
	style.height = `${at.height}px`;
	style.bottom = "auto";
	style.margin = "0";
	style.padding = getComputedStyle(frame).padding;
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
	private events: DayEvents | null = null;
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
		const frames = deps.frames?.() ?? null;
		this.list = new TaskList(el(this.left, "div"), {
			items: () => this.day?.list ?? [],
			day: () => date,
			grouped: () => deps.sections(date) !== null,
			sections: () => deps.sections(date) ?? [],
			ungroupedName: () => deps.ungroupedName(),
			emptyLabel: () => deps.emptyLabel?.() ?? "",
		});
		this.right = el(this.el, "div", "tc-right");
		if (frames) {
			if (frames.list) standOver(this.left, frames.list, root);
			else this.left.classList.add("tc-hidden");
			standOver(this.right, frames.timeline, root);
		}
		this.allDayEl = el(this.right, "div");
		this.timeline = new Timeline(el(this.right, "div"), {
			theme: () => deps.theme(),
			date: () => date,
			isToday: () => deps.relation(date) === "today",
			boundary: () => deps.boundary(),
			hourPx: () => deps.hourPx(),
			tasks: () => this.day?.slotted ?? [],
			shownSpan: (item) => deps.tasks.shownSpan(item, date),
			events: () => this.events?.timed ?? [],
			now: () => deps.now(),
			isPast: (event) => deps.calendars.isPast(event),
		});
		const ask = deps.calendars.events(date, "peek");
		if (ask.cached) this.events = ask.cached;
		void ask.fresh?.().then((events) => {
			this.events = events;
			this.render();
		});
		const filter = deps.filter?.() ?? null;
		void deps.tasks.dayView(date, filter).then((day) => {
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
		if (this.removed) return;
		this.removed = true;
		this.list.destroy();
		this.timeline.destroy();
		this.el.remove();
	}

	private render(): void {
		if (this.removed) return;
		this.list.render();
		renderAllDayRows(this.allDayEl, this.right, this.events?.allDay ?? [], this.deps.theme(), (event) => this.deps.calendars.isPast(event));
		this.right.style.setProperty(PROPERTY.allDayExtraRows, this.deps.allDayExtraRows());
		this.timeline.render();
	}
}
