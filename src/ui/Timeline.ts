import type { CalendarEvent, DayBoundary, TaskItem, TaskKey } from "../application/contracts";
import { paintEvent } from "./AllDayRow";
import type { Theme } from "./eventColors";
import { formatHour, formatTime, minutesOf } from "./dates";
import { DESIGN, LAYOUT, PROPERTY } from "./design";
import { clear, el as make, px } from "./dom";
import { sameTask } from "./drag/listPlace";
import { markPriority, renderProgress, showStrip } from "./TaskCard";
import { shownCardSize } from "./cardSize";
import { durationParts, followNow, gridAt, type Grid, itemBox, layoutColumns, minutesToPx, pxToMinutes, scrollPlace, type Span, stackTasks, type TaskSpan, timeParts } from "./timelineLayout";
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
	/** The timeline's height changed: the window, the rows over it or the navigation under it. */
	onResize?(): void;
	onBlock?(block: HTMLElement, item: TaskItem): void;
	/** A dot of the selected card taken: the stretch begins. */
	onGrip?(block: HTMLElement, item: TaskItem, edge: ResizeEdge, e: PointerEvent): void;
}

export type ResizeEdge = "start" | "end";

interface GridMark {
	readonly minutes: number;
	readonly label: HTMLElement | null;
	readonly line: HTMLElement;
}

type HourMark = GridMark & { readonly label: HTMLElement };

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

/** A field over the day: a new task's in a slot, joining the stack there; or a renamed task's, over its card. */
type FieldAt = { readonly kind: "slot"; readonly span: TaskSpan } | { readonly kind: "rename"; readonly key: TaskKey };

interface ShownField {
	readonly at: FieldAt;
	/** The card-like box that holds the field, kept across redraws so the field keeps the focus. */
	readonly box: HTMLElement;
}

/** A minute held at a share of the visible height. */
interface Anchor {
	readonly minutes: number;
	readonly fraction: number;
}

/** A card being resized: the minutes it shows while the finger moves, and which edge moves. */
interface Stretch {
	readonly el: HTMLElement;
	readonly span: TaskSpan;
	readonly edge: ResizeEdge;
}

const MINUTES_PER_HOUR = 60;

function isOpen(item: TaskItem): boolean {
	return item.status === "todo" || item.status === "inProgress";
}

/**
 * A day of hours that scrolls: the hour lines and labels, finer ones as it zooms in, the events, the task cards over them,
 * the now line. It runs from the hour the day begins to the same hour the next morning, both labelled; positions are minutes
 * from that hour. Task cards never share the width: they stack by time (see stackTasks); a drop target joins the stack as a card.
 */
export class Timeline {
	readonly canvas: HTMLElement;
	readonly itemsEl: HTMLElement;
	private readonly hours: HourMark[] = [];
	private readonly minorEl: HTMLElement;
	private minor: GridMark[] = [];
	private grid: Grid = { labels: MINUTES_PER_HOUR, lines: MINUTES_PER_HOUR };
	private events: PlacedEvent[] = [];
	private tasks: PlacedTask[] = [];
	private nowEl: HTMLElement | null = null;
	private dropEl: HTMLElement | null = null;
	private drop: TaskSpan | null = null;
	private stretch: Stretch | null = null;
	private selected: TaskKey | null = null;
	private field: ShownField | null = null;
	private anchor: Anchor | null = null;
	private readonly grips: HTMLElement;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TimelineDeps,
	) {
		el.classList.add("tc-timeline");
		this.canvas = make(el, "div", "tc-canvas");
		for (let hour = 0; hour <= DESIGN.dayHours; hour++) this.hours.push(this.mark(this.canvas, hour * MINUTES_PER_HOUR, ""));
		this.minorEl = make(this.canvas, "div");
		this.itemsEl = make(this.canvas, "div", "tc-items");
		this.grips = make(null, "div", "tc-grips");
		new ResizeObserver(() => {
			this.deps.onResize?.();
			this.holdAnchor();
		}).observe(el);
		for (const type of ["pointerdown", "wheel", "touchstart"] as const) el.addEventListener(type, () => (this.anchor = null), { passive: true });
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

	/** Minutes from the start of the shown day to the start and the end of `slot`; a null end for a task without a duration. */
	spanOf(slot: Slot): TaskSpan {
		return this.deps.boundary().spanOf(slot, this.deps.date());
	}

	/** The slot at the minutes from `start` to `end` of the shown day. */
	slotAt(start: number, end: number | null): Slot {
		return this.deps.boundary().slotAt(this.deps.date(), start, end);
	}

	/** Where the card of a slotted task stands: on its time, or on the now line once the task, still open, has passed it. */
	shownSpan(item: TaskItem): TaskSpan {
		const span = this.spanOf(item.slot!);
		const now = this.nowMinutes();
		return now !== null && isOpen(item) ? followNow(span, now) : span;
	}

	/** The hour's height at which the day, from its first hour's label to its closing one, fills the visible height; null before the timeline is laid out. */
	wholeDayHourPx(): number | null {
		const visible = this.visibleHeight() - 2 * DESIGN.labelLift;
		return visible > 0 ? visible / DESIGN.dayHours : null;
	}

	/** The height the fade at the bottom leaves visible. */
	private visibleHeight(): number {
		return this.el.clientHeight - parseFloat(getComputedStyle(this.el).paddingBottom);
	}

	/** Lays out at the current hour's height, then scrolls so that `minutes` stays under `clientY`. The room kept for an anchor goes. */
	zoomTo(minutes: number, clientY: number): void {
		this.setRoom(0, 0);
		const origin = this.el.getBoundingClientRect().top + this.canvas.offsetTop;
		this.layout();
		this.el.scrollTop = origin + this.yOf(minutes) - clientY;
	}

	/**
	 * Puts the minute at `fraction` of the visible height and keeps it there while the timeline settles its height (a view
	 * opened before Obsidian has laid it out, the all-day rows coming in), until the user scrolls it.
	 */
	scrollTo(minutes: number, fraction: number): void {
		this.anchor = { minutes, fraction };
		this.holdAnchor();
	}

	private holdAnchor(): void {
		if (!this.anchor) return;
		this.setRoom(0, 0);
		const visible = this.visibleHeight();
		if (visible <= 0) return;
		const box = { y: this.yOf(this.anchor.minutes), canvasTop: this.canvas.offsetTop, canvasHeight: this.canvas.offsetHeight, visible };
		const place = scrollPlace(box, this.anchor.fraction);
		this.setRoom(place.roomTop, place.roomBottom);
		this.el.scrollTop = place.scrollTop;
	}

	private setRoom(top: number, bottom: number): void {
		this.canvas.style.setProperty(PROPERTY.roomTop, px(top));
		this.canvas.style.setProperty(PROPERTY.roomBottom, px(bottom));
	}

	render(): void {
		for (const child of [...this.itemsEl.children]) if (child !== this.field?.box) child.remove();
		this.stretch = null;
		const boundary = this.deps.boundary();
		this.hours.forEach(({ label }, index) => (label.textContent = formatHour(boundary.hourAt(index))));
		const events = this.deps.events().filter((e) => !e.allDay);
		const spans = events.map((e) => this.eventSpan(e));
		const boxes = layoutColumns(spans);
		this.events = events.map((event, i) => this.placeEvent(event, spans[i], boxes[i].col, boxes[i].cols));
		this.tasks = this.deps.tasks().filter((task) => task.slot).map((task) => this.placeTask(task));
		this.itemsEl.appendChild(this.grips);
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
		this.divide(gridAt(hourPx));
		for (const { minutes, label, line } of [...this.hours, ...this.minor]) {
			const y = this.yOf(minutes);
			line.style.setProperty(PROPERTY.y, px(y));
			label?.style.setProperty(PROPERTY.y, px(y));
			const lift = label?.classList.contains("is-minor") ? DESIGN.minorLift : DESIGN.labelLift;
			label?.classList.toggle("is-hidden", today && Math.abs(y - nowY) < lift + DESIGN.nowPillHeight / 2);
		}
		for (const { el, start, end } of this.events) {
			el.style.setProperty(PROPERTY.y, px(this.yOf(start)));
			el.style.setProperty(PROPERTY.length, px(this.yOf(end) - this.yOf(start)));
			el.classList.toggle("is-tiny", itemBox(start, end, hourPx).tiny);
		}
		this.layoutTasks();
		this.nowEl?.style.setProperty(PROPERTY.y, px(nowY));
		this.placeDrop();
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

	/**
	 * Where a drop or a long tap puts a task's start: a line across the day at that very minute, its time on a pill like the
	 * now line's. It lies over everything, the dragged card too, and the cards stay where they are; `span` is the task as it
	 * would land, for `landing`.
	 */
	showDrop(span: TaskSpan): void {
		this.drop = span;
		if (!this.dropEl) {
			this.dropEl = make(document.body, "div", "tc-drop");
			make(this.dropEl, "span", "tc-drop-pill");
			make(this.dropEl, "div", "tc-drop-line");
		}
		this.dropEl.firstElementChild!.textContent = formatTime(this.slotAt(span.start, null).start);
		this.placeDrop();
	}

	/** The line in the window's pixels, where the minute is on screen now; hidden while that minute is scrolled out of the day's view. */
	private placeDrop(): void {
		if (!this.drop || !this.dropEl) return;
		const view = this.el.getBoundingClientRect();
		const y = this.canvas.getBoundingClientRect().top + this.yOf(this.drop.start);
		this.dropEl.style.setProperty(PROPERTY.y, px(y));
		this.dropEl.style.left = px(view.left);
		this.dropEl.style.width = px(view.width);
		this.dropEl.classList.toggle("is-hidden", y < view.top || y > view.bottom);
	}

	clearDrop(): void {
		this.drop = null;
		this.dropEl?.remove();
		this.dropEl = null;
	}

	/**
	 * The field of a new task in `slot`: a card where a task dropped there comes to rest, the stack making room for it as
	 * for that task, the slot's time on its right. It stays, the same element, across redraws until `clearField`.
	 */
	showField(slot: Slot, field: HTMLElement): void {
		const box = this.holdField({ kind: "slot", span: { start: this.spanOf(slot).start, end: null } }, field);
		const time = box.querySelector(".tc-field-time") ?? make(box, "span", "tc-field-time");
		time.textContent = formatTime(slot.start);
		this.layoutTasks();
	}

	/** The field of a renamed task over its card, at the card's place and size, the strip of a task in progress kept; the card hides while it stands there. */
	showRename(item: TaskItem, field: HTMLElement): void {
		showStrip(this.holdField({ kind: "rename", key: item.key }, field), item);
		for (const task of this.tasks) task.el.classList.toggle("is-renaming", this.isRenamed(task.item));
		this.layoutTasks();
	}

	clearField(): void {
		if (!this.field) return;
		this.field.box.remove();
		this.field = null;
		for (const task of this.tasks) task.el.classList.remove("is-renaming");
		this.layoutTasks();
	}

	/** The box for a field at `at`: the one already shown when it holds this field the same way, else a new one. */
	private holdField(at: FieldAt, field: HTMLElement): HTMLElement {
		const shown = this.field;
		if (shown && shown.at.kind === at.kind && field.parentElement === shown.box) {
			this.field = { at, box: shown.box };
			return shown.box;
		}
		shown?.box.remove();
		const box = make(this.itemsEl, "div", `tc-block tc-quick-row is-${at.kind}`);
		box.appendChild(field);
		this.field = { at, box };
		return box;
	}

	/** The renamed task's field takes its card's box; none while the card is not shown. */
	private coverRenamed(present: readonly PlacedTask[]): void {
		const field = this.field;
		if (field?.at.kind !== "rename") return;
		const card = present.find((task) => this.isRenamed(task.item));
		field.box.hidden = !card;
		if (card) for (const property of [PROPERTY.y, PROPERTY.length, PROPERTY.x]) field.box.style.setProperty(property, card.el.style.getPropertyValue(property));
	}

	private isRenamed(item: TaskItem): boolean {
		return this.field?.at.kind === "rename" && sameTask(this.field.at.key, item.key);
	}

	/** Where the dropped task will come to rest once the stack takes it in, in client pixels. */
	landing(): DOMRect | null {
		if (!this.drop) return null;
		const present = this.present();
		const box = stackTasks([this.drop, ...present.map((t) => this.taskSpan(t))], this.eventSpans(), this.hourPx, shownCardSize())[0];
		const items = this.itemsEl.getBoundingClientRect();
		const top = this.canvas.getBoundingClientRect().top + box.top;
		return new DOMRect(items.left + box.left, top, items.width - box.left - DESIGN.itemInset, box.height);
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
		const present = this.present();
		const placed = Array.from(this.itemsEl.querySelectorAll(":scope > .tc-block:not(.is-lifted):not(.tc-quick-row)"));
		if (present.some((task, i) => placed[i] !== task.el)) for (const task of present) this.itemsEl.insertBefore(task.el, this.grips);
		const spans: TaskSpan[] = present.map((t) => this.taskSpan(t));
		const slot = this.field?.at.kind === "slot" ? this.field.at.span : null;
		const boxes = stackTasks(slot ? [slot, ...spans] : spans, this.eventSpans(), this.hourPx, shownCardSize());
		const own = slot ? boxes.shift() : undefined;
		let bottom = own ? own.top + own.height : 0;
		if (own && this.field) this.placeBox(this.field.box, own.top, own.height, own.left);
		present.forEach((task, i) => {
			const box = boxes[i];
			this.placeBox(task.el, box.top, box.height, box.left);
			task.el.classList.toggle("is-over", box.overlay);
			this.fillMeta(task, spans[i], box.stacked, box.hiddenDuration);
			bottom = Math.max(bottom, box.top + box.height);
		});
		this.canvas.style.setProperty(PROPERTY.stackEnd, px(bottom));
		this.coverRenamed(present);
		const selected = present.find((t) => t.el.classList.contains("is-selected") && !this.isRenamed(t.item));
		this.grips.classList.toggle("is-shown", !!selected);
		if (selected) for (const property of [PROPERTY.y, PROPERTY.length, PROPERTY.x]) this.grips.style.setProperty(property, selected.el.style.getPropertyValue(property));
	}

	/** The cards in the stack, in its order: by start, ties in file order; a card lifted for a drag is not among them. */
	private present(): PlacedTask[] {
		return this.tasks
			.filter((t) => !t.el.classList.contains("is-lifted"))
			.map((task, index) => ({ task, index, span: this.taskSpan(task) }))
			.sort((a, b) => a.span.start - b.span.start || a.index - b.index)
			.map(({ task }) => task);
	}

	private eventSpans(): Span[] {
		return this.events.map((e) => ({ start: e.start, end: e.end }));
	}

	private taskSpan(task: PlacedTask): TaskSpan {
		if (this.stretch?.el === task.el) return this.stretch.span;
		return this.shownSpan(task.item);
	}

	/** Minutes from the start of the shown day to now; null on another day than today. */
	private nowMinutes(): number | null {
		return this.deps.date() === this.deps.today() ? this.deps.boundary().offsetOf(this.deps.date(), this.deps.now()) : null;
	}

	private placeBox(el: HTMLElement, top: number, height: number, left: number): void {
		el.style.setProperty(PROPERTY.y, px(top));
		el.style.setProperty(PROPERTY.length, px(height));
		el.style.setProperty(PROPERTY.x, px(left));
	}

	/**
	 * On the right, a stacked card shows the time it is put on in the file, a card shorter than its duration the duration;
	 * a stretched one shows neither, its pill instead.
	 */
	private fillMeta(task: PlacedTask, span: TaskSpan, stacked: boolean, hiddenDuration: boolean): void {
		const stretching = this.stretch?.el === task.el;
		const parts = stretching ? null : stacked ? timeParts(task.item.slot!.start) : hiddenDuration && span.end !== null ? durationParts(span.end - span.start) : null;
		task.meta.classList.toggle("is-hidden", parts === null);
		const [top, bottom] = task.meta.children;
		top.textContent = parts?.[0] ?? "";
		bottom.textContent = parts?.[1] ?? "";
		if (stretching && this.stretch) task.pill.textContent = formatTime(this.slotAt(this.stretch.edge === "end" ? (span.end ?? span.start) : span.start, null).start);
	}

	private isSelected(item: TaskItem): boolean {
		return this.selected !== null && item.key.section === this.selected.section && item.key.index === this.selected.index;
	}

	private mark(parent: HTMLElement, minutes: number, text: string): HourMark {
		return { minutes, label: make(parent, "div", "tc-hour-label", text), line: make(parent, "div", "tc-hour-line") };
	}

	/** Redraws the marks between the hours when the zoom crosses into another grid: small labels on some, bare lines on the rest. */
	private divide(grid: Grid): void {
		if (grid.labels === this.grid.labels && grid.lines === this.grid.lines) return;
		this.grid = grid;
		clear(this.minorEl);
		this.minor = [];
		for (let minutes = grid.lines; minutes < DESIGN.dayHours * MINUTES_PER_HOUR; minutes += grid.lines) {
			const minute = minutes % MINUTES_PER_HOUR;
			if (minute === 0) continue;
			const line = make(this.minorEl, "div", "tc-hour-line is-minor");
			const label = minute % grid.labels === 0 ? make(this.minorEl, "div", "tc-hour-label is-minor", `:${String(minute).padStart(2, "0")}`) : null;
			this.minor.push({ minutes, label, line });
		}
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

	private placeEvent(event: CalendarEvent, span: Span, col: number, cols: number): PlacedEvent {
		const block = make(this.itemsEl, "div", "tc-item tc-event");
		block.style.setProperty(PROPERTY.column, String(col));
		block.style.setProperty(PROPERTY.columns, String(cols));
		paintEvent(block, event, this.deps.theme());
		make(block, "div", "tc-event-bar");
		make(make(block, "div", "tc-event-body"), "div", "tc-item-title", event.title);
		return { el: block, ...span };
	}

	/** The card of the list on the timeline: the strip, the title fading out, the small time or duration on the right. */
	private placeTask(item: TaskItem): PlacedTask {
		const block = make(this.itemsEl, "div", "tc-block");
		const card = make(block, "div", "tc-block-card");
		markPriority(card, item.priority);
		if (item.status === "inProgress") make(card, "span", "tc-strip");
		make(card, "div", "tc-card-title", item.text);
		renderProgress(card, item);
		const meta = make(card, "span", "tc-block-meta is-hidden");
		make(meta, "span");
		make(meta, "span");
		const pill = make(card, "span", "tc-block-pill");
		block.classList.toggle("is-selected", this.isSelected(item));
		block.classList.toggle("is-renaming", this.isRenamed(item));
		this.deps.onBlock?.(block, item);
		return { el: block, item, meta, pill };
	}
}
