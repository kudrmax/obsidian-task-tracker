import type { CalendarEvent, TaskItem } from "../application/contracts";
import { paintEvent } from "./AllDayRow";
import { formatTime, minutesOf } from "./dates";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { clear, el as make, px } from "./dom";
import { itemBox, layoutColumns, minutesToPx, pxToMinutes } from "./timelineLayout";
import type { LocalDate } from "./types";

export interface TimelineDeps {
	date(): LocalDate;
	today(): LocalDate;
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

/** A day of hours that scrolls: the hour lines and labels, the events, the task blocks over them, the now line. */
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
			this.labels.push(make(this.canvas, "div", "tc-hour-label", String(hour)));
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

	/** Puts the minute at `fraction` of the visible height. */
	scrollTo(minutes: number, fraction: number): void {
		this.el.scrollTop = Math.max(0, this.yOf(minutes) - fraction * this.el.clientHeight);
	}

	render(): void {
		clear(this.itemsEl);
		this.placed = [];
		const events = this.deps.events().filter((e) => !e.allDay);
		const boxes = layoutColumns(events.map((e) => ({ start: minutesOf(e.start), end: minutesOf(e.end) })));
		events.forEach((event, i) => this.placeEvent(event, boxes[i].col, boxes[i].cols));
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
		const nowMinutes = minutesOf(this.deps.now());
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

	private place(el: HTMLElement, start: number, end: number): void {
		el.style.setProperty(PROPERTY.y, px(this.yOf(start)));
		el.style.setProperty(PROPERTY.length, px(this.yOf(end) - this.yOf(start)));
		el.classList.toggle("is-tiny", itemBox(start, end, this.hourPx).tiny);
	}

	private placeEvent(event: CalendarEvent, col: number, cols: number): void {
		const block = make(this.itemsEl, "div", "tc-item tc-event");
		block.style.setProperty(PROPERTY.column, String(col));
		block.style.setProperty(PROPERTY.columns, String(cols));
		paintEvent(block, event);
		make(block, "div", "tc-event-bar");
		make(make(block, "div", "tc-event-body"), "div", "tc-item-title", event.title);
		this.placed.push({ el: block, start: minutesOf(event.start), end: minutesOf(event.end) });
	}

	private placeTask(task: TaskItem): void {
		const slot = task.slot!;
		const block = make(this.itemsEl, "div", "tc-item tc-block");
		block.style.setProperty(PROPERTY.column, "0");
		block.style.setProperty(PROPERTY.columns, "1");
		if (task.status === "inProgress") make(block, "span", "tc-strip");
		make(block, "div", "tc-item-title", task.text);
		make(block, "div", "tc-resize");
		make(block, "div", "tc-resize-hit");
		this.placed.push({ el: block, start: slot.start, end: slot.end });
		this.deps.onBlock?.(block, task);
	}
}
