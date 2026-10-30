import type { CalendarEvent, TaskItem, TaskKey } from "../application/contracts";
import { paintEvent } from "./AllDayRow";
import type { Theme } from "./eventColors";
import { formatTime, minutesOf } from "./dates";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { clear, el as make, px } from "./dom";
import { durationParts, itemBox, layoutColumns, minutesToPx, pxToMinutes, type Span, stackTasks, type TaskSpan, timeParts } from "./timelineLayout";
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
	/** A dot of the selected card taken: the stretch begins. */
	onGrip?(block: HTMLElement, item: TaskItem, edge: ResizeEdge, e: PointerEvent): void;
}

export type ResizeEdge = "start" | "end";

interface PlacedEvent {
	readonly el: HTMLElement;
	readonly start: number;
	readonly end: number;
}

interface PlacedTask {
	readonly el: HTMLElement;
	readonly item: TaskItem;
	readonly meta: HTMLElement;
	readonly pill: HTMLElement;
}

/** A card being resized: the times it shows while the finger moves, and which edge moves. */
interface Stretch {
	readonly el: HTMLElement;
	readonly span: TaskSpan;
	readonly edge: ResizeEdge;
}

const MINUTES_PER_HOUR = 60;

/**
 * A day of hours that scrolls: the hour lines and labels, the events, the task cards over them, the now line. Task cards
 * never share the width: they stack by time (see stackTasks); a drop target joins the stack as a card of its own.
 */
export class Timeline {
	readonly canvas: HTMLElement;
	readonly itemsEl: HTMLElement;
	private readonly labels: HTMLElement[] = [];
	private readonly lines: HTMLElement[] = [];
	private events: PlacedEvent[] = [];
	private tasks: PlacedTask[] = [];
	private nowEl: HTMLElement | null = null;
	private dropEl: HTMLElement | null = null;
	private dropStart: number | null = null;
	private stretch: Stretch | null = null;
	private selected: TaskKey | null = null;
	private readonly grips: HTMLElement;

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
		this.grips = make(null, "div", "tc-grips");
		for (const edge of ["start", "end"] as const) {
			make(this.grips, "span", `tc-grip is-${edge}`).addEventListener("pointerdown", (e) => {
				const task = this.tasks.find((t) => t.el.classList.contains("is-selected"));
				if (!task || !e.isPrimary || e.button !== 0) return;
				e.stopPropagation();
				e.preventDefault();
				this.deps.onGrip?.(task.el, task.item, edge, e);
			});
		}
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
		this.dropEl = null;
		this.stretch = null;
		const events = this.deps.events().filter((e) => !e.allDay);
		const boxes = layoutColumns(events.map((e) => ({ start: minutesOf(e.start), end: minutesOf(e.end) })));
		this.events = events.map((event, i) => this.placeEvent(event, boxes[i].col, boxes[i].cols));
		this.tasks = this.deps.tasks().filter((task) => task.slot).map((task) => this.placeTask(task));
		this.itemsEl.appendChild(this.grips);
		if (this.dropStart !== null) this.showDrop(this.dropStart);
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
		for (const { el, start, end } of this.events) {
			el.style.setProperty(PROPERTY.y, px(this.yOf(start)));
			el.style.setProperty(PROPERTY.length, px(this.yOf(end) - this.yOf(start)));
			el.classList.toggle("is-tiny", itemBox(start, end, hourPx).tiny);
		}
		this.layoutTasks();
		this.nowEl?.style.setProperty(PROPERTY.y, px(nowY));
	}

	/** The task the long press chose: ringed, with the dots that stretch it. Kept across a redraw while the task is there. */
	select(item: TaskItem | null): void {
		this.selected = item?.key ?? null;
		for (const task of this.tasks) task.el.classList.toggle("is-selected", this.isSelected(task.item));
		this.layoutTasks();
	}

	get selection(): TaskItem | null {
		return this.tasks.find((t) => t.el.classList.contains("is-selected"))?.item ?? null;
	}

	/** The dashed card of a drop or a long tap at `start`: it takes its place in the stack and moves the cards after it. */
	showDrop(start: number): void {
		this.dropStart = start;
		this.dropEl ??= make(this.itemsEl, "div", "tc-drop");
		this.dropEl.textContent = formatTime(start);
		this.el.classList.add("is-dropping");
		this.layoutTasks();
	}

	clearDrop(): void {
		this.dropStart = null;
		this.dropEl?.remove();
		this.dropEl = null;
		this.layoutTasks();
		this.el.classList.remove("is-dropping");
	}

	dropRect(): DOMRect | null {
		return this.dropEl?.getBoundingClientRect() ?? null;
	}

	/** Shows a card stretched to `span` while its dot moves, the moving edge's time on the pill; null puts it back. */
	stretchTo(el: HTMLElement, span: TaskSpan | null, edge: ResizeEdge): void {
		this.stretch = span ? { el, span, edge } : null;
		el.classList.toggle("is-resizing", span !== null);
		this.layoutTasks();
	}

	/**
	 * A card lifted for a drag leaves the stack; the others close over its place. The cards stand in the page in the
	 * stack's order, so a card that lies over another is drawn over it; the dots of the selected card lie over them all.
	 */
	layoutTasks(): void {
		const present = this.tasks
			.filter((t) => !t.el.classList.contains("is-lifted"))
			.map((task, index) => ({ task, index, span: this.spanOf(task) }))
			.sort((a, b) => a.span.start - b.span.start || a.index - b.index)
			.map(({ task }) => task);
		const placed = Array.from(this.itemsEl.querySelectorAll(":scope > .tc-block:not(.is-lifted)"));
		if (present.some((task, i) => placed[i] !== task.el)) for (const task of present) this.itemsEl.insertBefore(task.el, this.grips);
		const spans: TaskSpan[] = present.map((t) => this.spanOf(t));
		if (this.dropStart !== null) spans.unshift({ start: this.dropStart, end: null });
		const events: Span[] = this.events.map((e) => ({ start: e.start, end: e.end }));
		const boxes = stackTasks(spans, events, this.hourPx);
		const offset = this.dropStart !== null ? 1 : 0;
		if (this.dropEl && offset) this.placeBox(this.dropEl, boxes[0].top, DESIGN.cardHeight, boxes[0].left);
		let bottom = 0;
		present.forEach((task, i) => {
			const box = boxes[i + offset];
			this.placeBox(task.el, box.top, box.height, box.left);
			task.el.classList.toggle("is-over", box.overlay);
			this.fillMeta(task, spans[i + offset], box.stacked, box.hiddenDuration);
			bottom = Math.max(bottom, box.top + box.height);
		});
		if (this.dropEl && offset) bottom = Math.max(bottom, boxes[0].top + DESIGN.cardHeight);
		this.canvas.style.setProperty(PROPERTY.stackEnd, px(bottom));
		const selected = present.find((t) => t.el.classList.contains("is-selected"));
		this.grips.classList.toggle("is-shown", !!selected);
		if (selected) for (const property of [PROPERTY.y, PROPERTY.length, PROPERTY.x]) this.grips.style.setProperty(property, selected.el.style.getPropertyValue(property));
	}


	private spanOf(task: PlacedTask): TaskSpan {
		if (this.stretch?.el === task.el) return this.stretch.span;
		const slot = task.item.slot!;
		return { start: slot.start, end: slot.end };
	}

	private placeBox(el: HTMLElement, top: number, height: number, left: number): void {
		el.style.setProperty(PROPERTY.y, px(top));
		el.style.setProperty(PROPERTY.length, px(height));
		el.style.setProperty(PROPERTY.x, px(left));
	}

	/** On the right, a stacked card shows its start, a card shorter than its duration shows the duration; a stretched one shows neither, its pill instead. */
	private fillMeta(task: PlacedTask, span: TaskSpan, stacked: boolean, hiddenDuration: boolean): void {
		const stretching = this.stretch?.el === task.el;
		const parts = stretching ? null : stacked ? timeParts(span.start) : hiddenDuration && span.end !== null ? durationParts(span.end - span.start) : null;
		task.meta.classList.toggle("is-hidden", parts === null);
		const [top, bottom] = task.meta.children;
		top.textContent = parts?.[0] ?? "";
		bottom.textContent = parts?.[1] ?? "";
		if (stretching && this.stretch) task.pill.textContent = formatTime(this.stretch.edge === "end" ? (span.end ?? span.start) : span.start);
	}

	private isSelected(item: TaskItem): boolean {
		return this.selected !== null && item.key.section === this.selected.section && item.key.index === this.selected.index;
	}

	private placeEvent(event: CalendarEvent, col: number, cols: number): PlacedEvent {
		const block = make(this.itemsEl, "div", "tc-item tc-event");
		block.style.setProperty(PROPERTY.column, String(col));
		block.style.setProperty(PROPERTY.columns, String(cols));
		paintEvent(block, event, this.deps.theme());
		make(block, "div", "tc-event-bar");
		make(make(block, "div", "tc-event-body"), "div", "tc-item-title", event.title);
		return { el: block, start: minutesOf(event.start), end: minutesOf(event.end) };
	}

	/** The card of the list on the timeline: the strip, the title fading out, the small time or duration on the right; the dots outside it. */
	private placeTask(item: TaskItem): PlacedTask {
		const block = make(this.itemsEl, "div", "tc-block");
		const card = make(block, "div", "tc-block-card");
		if (item.status === "inProgress") make(card, "span", "tc-strip");
		make(card, "div", "tc-card-title", item.text);
		const meta = make(card, "span", "tc-block-meta is-hidden");
		make(meta, "span");
		make(meta, "span");
		const pill = make(card, "span", "tc-block-pill");
		block.classList.toggle("is-selected", this.isSelected(item));
		this.deps.onBlock?.(block, item);
		return { el: block, item, meta, pill };
	}
}
