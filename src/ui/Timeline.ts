import type { CalendarEvent, DayBoundary, TaskItem } from "../application/contracts";
import { paintEvent } from "./AllDayRow";
import type { Theme } from "./eventColors";
import { formatTime, minutesOf } from "./dates";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { clear, el as make, px } from "./dom";
import { itemBox, layoutColumns, minutesToPx, pxToMinutes, type Span } from "./timelineLayout";
import type { LocalDate, Slot } from "./types";

export interface TimelineDeps {
	theme(): Theme;
	date(): LocalDate;
	today(): LocalDate;
	/** Where the day begins: the first hour line, and where slots and events stand. */
	boundary(): DayBoundary;
	hourPx(): number;
	tasks(): readonly TaskItem[];
	events(): readonly CalendarEvent[];
	now(): Date;
	onBlock?(block: HTMLElement, item: TaskItem): void;
}

interface Placed {
	readonly el: HTMLElement;
	readonly start: number;
	readonly end: number;
}

const MINUTES_PER_HOUR = 60;

/**
 * A day of hours that scrolls: the hour lines and labels, the events, the task blocks over them, the now line. It runs
 * from the hour the day begins to the same hour the next morning; positions are minutes from that hour.
 */
export class Timeline {
	readonly canvas: HTMLElement;
	readonly itemsEl: HTMLElement;
	private readonly labels: HTMLElement[] = [];
	private readonly lines: HTMLElement[] = [];
	private placed: Placed[] = [];
	private nowEl: HTMLElement | null = null;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TimelineDeps,
	) {
		el.classList.add("tc-timeline");
		this.canvas = make(el, "div", "tc-canvas");
		for (let hour = 0; hour < DESIGN.dayHours; hour++) {
			this.labels.push(make(this.canvas, "div", "tc-hour-label"));
			this.lines.push(make(this.canvas, "div", "tc-hour-line"));
		}
		this.itemsEl = make(this.canvas, "div", "tc-items");
	}

	get hourPx(): number {
		return this.deps.hourPx();
	}

	yOf(minutes: number): number {
		return minutesToPx(minutes, this.hourPx);
	}

	minutesAt(clientY: number): number {
		return pxToMinutes(clientY - this.canvas.getBoundingClientRect().top, this.hourPx);
	}

	/** Minutes from the start of the shown day to the start and the end of `slot`. */
	spanOf(slot: Slot): Span {
		return this.deps.boundary().spanOf(slot, this.deps.date());
	}

	/** The slot at the minutes from `start` to `end` of the shown day. */
	slotAt(start: number, end: number): Slot {
		return this.deps.boundary().slotAt(this.deps.date(), start, end);
	}

	/** Lays out at the current hour's height, then scrolls so that `minutes` stays under `clientY`. */
	zoomTo(minutes: number, clientY: number): void {
		const origin = this.el.getBoundingClientRect().top + this.canvas.offsetTop;
		this.layout();
		this.el.scrollTop = origin + this.yOf(minutes) - clientY;
	}

	/** Puts the minute at `fraction` of the visible height. */
	scrollTo(minutes: number, fraction: number): void {
		this.el.scrollTop = Math.max(0, this.yOf(minutes) - fraction * this.el.clientHeight);
	}

	render(): void {
		clear(this.itemsEl);
		this.placed = [];
		const boundary = this.deps.boundary();
		this.labels.forEach((label, index) => (label.textContent = String(boundary.hourAt(index))));
		const events = this.deps.events().filter((e) => !e.allDay);
		const spans = events.map((e) => this.eventSpan(e));
		const boxes = layoutColumns(spans);
		events.forEach((event, i) => this.placeEvent(event, spans[i], boxes[i].col, boxes[i].cols));
		for (const task of this.deps.tasks()) if (task.slot) this.placeTask(task);
		this.nowEl?.remove();
		this.nowEl = null;
		if (this.deps.date() === this.deps.today()) {
			this.nowEl = make(this.canvas, "div", "tc-now");
			make(this.nowEl, "span", "tc-now-pill", formatTime(minutesOf(this.deps.now())));
			make(this.nowEl, "div", "tc-now-line");
		}
		this.layout();
	}

	/** Applies the hour's height to everything placed; cheap enough to run on every frame of a zoom. */
	layout(): void {
		const hourPx = this.hourPx;
		this.el.style.setProperty(PROPERTY.hour, px(hourPx));
		const nowMinutes = this.deps.boundary().offsetOf(this.deps.date(), this.deps.now());
		const nowY = this.yOf(nowMinutes);
		const today = this.deps.date() === this.deps.today();
		for (let hour = 0; hour < DESIGN.dayHours; hour++) {
			const y = this.yOf(hour * MINUTES_PER_HOUR);
			this.labels[hour].style.setProperty(PROPERTY.y, px(y));
			this.lines[hour].style.setProperty(PROPERTY.y, px(y));
			this.labels[hour].classList.toggle("is-hidden", today && Math.abs(y - nowY) <= LAYOUT.labelHideDistance);
		}
		for (const { el, start, end } of this.placed) this.place(el, start, end);
		this.nowEl?.style.setProperty(PROPERTY.y, px(nowY));
	}

	/** The task blocks that take any of the minutes from `start` to `end`. */
	blocksBetween(start: number, end: number): HTMLElement[] {
		return this.placed.filter((p) => p.el.classList.contains("tc-block") && p.start < end && p.end > start).map((p) => p.el);
	}

	private place(el: HTMLElement, start: number, end: number): void {
		el.style.setProperty(PROPERTY.y, px(this.yOf(start)));
		el.style.setProperty(PROPERTY.length, px(this.yOf(end) - this.yOf(start)));
		el.classList.toggle("is-tiny", itemBox(start, end, this.hourPx).tiny);
	}

	/** An event that began before the day or ends after it is cut at the day's edges. */
	private eventSpan(event: CalendarEvent): Span {
		const boundary = this.deps.boundary();
		const date = this.deps.date();
		return {
			start: Math.max(0, boundary.offsetOf(date, event.start)),
			end: Math.min(LAYOUT.minutesPerDay, boundary.offsetOf(date, event.end)),
		};
	}

	private placeEvent(event: CalendarEvent, span: Span, col: number, cols: number): void {
		const block = make(this.itemsEl, "div", "tc-item tc-event");
		block.style.setProperty(PROPERTY.column, String(col));
		block.style.setProperty(PROPERTY.columns, String(cols));
		paintEvent(block, event, this.deps.theme());
		make(block, "div", "tc-event-bar");
		make(make(block, "div", "tc-event-body"), "div", "tc-item-title", event.title);
		this.placed.push({ el: block, ...span });
	}

	private placeTask(task: TaskItem): void {
		const span = this.spanOf(task.slot!);
		const block = make(this.itemsEl, "div", "tc-item tc-block");
		block.style.setProperty(PROPERTY.column, "0");
		block.style.setProperty(PROPERTY.columns, "1");
		if (task.status === "inProgress") make(block, "span", "tc-strip");
		make(block, "div", "tc-item-title", task.text);
		make(block, "div", "tc-resize");
		make(block, "div", "tc-resize-hit");
		this.placed.push({ el: block, ...span });
		this.deps.onBlock?.(block, task);
	}
}
