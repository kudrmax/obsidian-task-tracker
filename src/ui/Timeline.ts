import type { CalendarEvent, TaskItem } from "../application/contracts";
import { paintEvent } from "./AllDayRow";
import type { Theme } from "./eventColors";
import { formatTime, minutesOf } from "./dates";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { clear, el as make, px } from "./dom";
import { gridDivision, itemBox, layoutColumns, minutesToPx, pxToMinutes } from "./timelineLayout";
import type { LocalDate } from "./types";

export interface TimelineDeps {
	theme(): Theme;
	date(): LocalDate;
	today(): LocalDate;
	hourPx(): number;
	tasks(): readonly TaskItem[];
	events(): readonly CalendarEvent[];
	now(): Date;
	onBlock?(block: HTMLElement, item: TaskItem): void;
}

interface GridMark {
	readonly minutes: number;
	readonly label: HTMLElement;
	readonly line: HTMLElement;
}

interface Placed {
	readonly el: HTMLElement;
	readonly start: number;
	readonly end: number;
}

const MINUTES_PER_HOUR = 60;

/** A day of hours that scrolls: the hour lines and labels, finer ones as it zooms in, the events, the task blocks over them, the now line. */
export class Timeline {
	readonly canvas: HTMLElement;
	readonly itemsEl: HTMLElement;
	private readonly hours: GridMark[] = [];
	private readonly minorEl: HTMLElement;
	private minor: GridMark[] = [];
	private division = MINUTES_PER_HOUR;
	private placed: Placed[] = [];
	private nowEl: HTMLElement | null = null;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TimelineDeps,
	) {
		el.classList.add("tc-timeline");
		this.canvas = make(el, "div", "tc-canvas");
		for (let hour = 0; hour < DESIGN.dayHours; hour++) this.hours.push(this.mark(this.canvas, hour * MINUTES_PER_HOUR, String(hour)));
		this.minorEl = make(this.canvas, "div");
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
		this.divide(gridDivision(hourPx));
		for (const { minutes, label, line } of [...this.hours, ...this.minor]) {
			const y = this.yOf(minutes);
			label.style.setProperty(PROPERTY.y, px(y));
			line.style.setProperty(PROPERTY.y, px(y));
			label.classList.toggle("is-hidden", today && Math.abs(y - nowY) <= LAYOUT.labelHideDistance);
		}
		for (const { el, start, end } of this.placed) this.place(el, start, end);
		this.nowEl?.style.setProperty(PROPERTY.y, px(nowY));
	}

	/** The task blocks that take any of the minutes from `start` to `end`. */
	blocksBetween(start: number, end: number): HTMLElement[] {
		return this.placed.filter((p) => p.el.classList.contains("tc-block") && p.start < end && p.end > start).map((p) => p.el);
	}

	private mark(parent: HTMLElement, minutes: number, text: string): GridMark {
		return { minutes, label: make(parent, "div", "tc-hour-label", text), line: make(parent, "div", "tc-hour-line") };
	}

	/** Redraws the marks between the hours when the zoom crosses into another division. */
	private divide(division: number): void {
		if (division === this.division) return;
		this.division = division;
		clear(this.minorEl);
		this.minor = [];
		for (let minutes = division; minutes < DESIGN.dayHours * MINUTES_PER_HOUR; minutes += division) {
			const minute = minutes % MINUTES_PER_HOUR;
			if (minute === 0) continue;
			const mark = this.mark(this.minorEl, minutes, `:${String(minute).padStart(2, "0")}`);
			mark.label.classList.add("is-minor");
			mark.line.classList.add("is-minor");
			this.minor.push(mark);
		}
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
		paintEvent(block, event, this.deps.theme());
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
