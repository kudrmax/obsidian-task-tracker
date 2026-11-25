import { bgAlphaFor, cardDue, type CalendarEvent, type CalendarService, type ColumnList, type DayEvents, type DayService, dayTitle, type DropColumn, dueLabel, durationParts, eventColors, eventHex, type LocalDate, type ScreenView, type TaskItem, type TaskService, timeParts } from "../../core/application/contracts";
import type { AllDayEvent, Block, CardFace, DayEvent, EventPaint, ListData, ListId, Row, ScreenData } from "../ui/engine/port";

/** What a screen of `date` is drawn from: the core's screen, its lists as `columnView` reads them, and the day's events. */
export interface ScreenSource {
	readonly date: LocalDate;
	readonly screen: ScreenView;
	readonly lists: Readonly<Record<ListId, ColumnList>>;
	readonly events: DayEvents | null;
	/** A task held by a dot, drawn at the span the core stretches it to instead of its own. */
	readonly held?: { readonly id: string; readonly start: number; readonly end: number | null };
}

const LIST_COLUMNS: Readonly<Record<ListId, DropColumn>> = { inbox: "inbox", backlog: "backlog", soon: "soon", day: "day" };

/**
 * The core's answers in the engine's words (`engine/port.ts`): each list as `columnView` reads it, each card as its
 * `TaskItem` says, each block where `shownSpan` puts it, each event in its calendar's paint. It decides nothing: every
 * value is a field of the core's answer or a function of the contract over it.
 */
export class ScreenDrawing {
	constructor(
		private readonly tasks: TaskService,
		private readonly days: DayService,
		private readonly calendars: CalendarService,
		private readonly tasksFile: () => string,
	) {}

	/** A column of `screen` as it draws: the one way a list is read here (`TaskService.columnView`). */
	column(screen: ScreenView, column: DropColumn): ColumnList {
		return this.tasks.columnView(screen, column);
	}

	listsOf(screen: ScreenView): Readonly<Record<ListId, ColumnList>> {
		return { inbox: this.column(screen, LIST_COLUMNS.inbox), backlog: this.column(screen, LIST_COLUMNS.backlog), soon: this.column(screen, LIST_COLUMNS.soon), day: this.column(screen, LIST_COLUMNS.day) };
	}

	/** Each list's No tasks plate as the screen's view has it (`ViewChoice.plates`): its words, or null for none. */
	draw(source: ScreenSource, plates: Readonly<Record<DropColumn, string | null>>): ScreenData {
		const { date, screen, lists } = source;
		const cards: Record<string, CardFace> = {};
		const title = this.dayTitle(date);
		return {
			lists: {
				inbox: this.list(this.tasks.listName("inbox"), lists.inbox, screen, cards, null, plates.inbox),
				backlog: this.list(this.tasks.listName("backlog"), lists.backlog, screen, cards, null, plates.backlog),
				soon: this.list(this.tasks.listName("soon"), lists.soon, screen, cards, null, plates.soon),
				day: this.list(title, lists.day, screen, cards, date, plates.day),
			},
			cards,
			missing: screen.missing ? { text: `No tasks file at ${this.tasksFile()}`, create: "Create file" } : null,
			day: {
				title,
				isToday: this.days.relation(date) === "today",
				blocks: screen.day.slotted.map((item) => this.block(item, date, cards, source.held)),
				events: (source.events?.timed ?? []).map((event) => this.event(event, date)),
				allDay: (source.events?.allDay ?? []).map((event) => this.allDay(event)),
				hours: this.days.hourLabels(),
				opensAt: this.days.openAt(this.days.step(this.days.today(), 1)).minute,
				alert: source.events?.alert ?? "none",
			},
		};
	}

	private dayTitle(date: LocalDate): string {
		return dayTitle(date, this.days.relation(date), this.days.today());
	}

	face(item: TaskItem, day: LocalDate | null): CardFace {
		const due = cardDue(item, day)?.date ?? null;
		return {
			id: item.id,
			title: item.card.over ?? item.card.title,
			color: item.colors[0] ?? null,
			inProgress: item.status === "inProgress",
			count: item.progress,
			description: item.description !== null,
			due: due === null ? null : dueLabel(due),
			step: item.card.over === null ? null : item.card.title,
			folded: item.collapsed,
		};
	}

	private list(title: string, column: ColumnList, screen: ScreenView, cards: Record<string, CardFace>, day: LocalDate | null, plate: string | null): ListData {
		const rows: Row[] = [];
		for (const group of column.groups) {
			if (group.header) rows.push({ kind: "section", id: group.id, title: group.name ?? screen.offer.ungrouped, tasks: group.items.length, ungrouped: group.name === null, menu: group.menu && { rename: group.menu.rename, remove: group.menu.remove } });
			for (const { item, level } of group.rows) {
				cards[item.id] = this.face(item, day);
				rows.push({ kind: "task", id: item.id, depth: level });
			}
		}
		return { title, rows, plate: rows.length === 0 ? plate : null };
	}

	private block(item: TaskItem, date: LocalDate, cards: Record<string, CardFace>, held: ScreenSource["held"]): Block {
		cards[item.id] = this.face(item, date);
		for (const sub of item.subtasks) cards[sub.id] = this.face(sub, date);
		const holding = held?.id === item.id ? held : null;
		const shown = holding ?? this.tasks.shownSpan(item, date);
		const own = holding ?? this.days.boundary().spanOf(item.slot!, date);
		const length = shown.end === null ? null : shown.end - shown.start;
		return {
			id: item.id,
			start: shown.start,
			length,
			clock: this.days.clockAt(own.start),
			endClock: own.end === null ? null : this.days.clockAt(own.end),
			startParts: timeParts(item.slot!.start),
			lengthParts: length === null ? null : durationParts(length),
		};
	}

	private event(event: CalendarEvent, date: LocalDate): DayEvent {
		const { start, end } = this.days.boundary().clipToDay(date, event.start, event.end);
		return { id: event.id, title: event.title, start, end, past: this.calendars.isPast(event), paint: paintOf(event) };
	}

	private allDay(event: CalendarEvent): AllDayEvent {
		return { id: event.id, title: event.title, past: this.calendars.isPast(event), paint: paintOf(event) };
	}
}

/** An event's paint in each theme, by the core's rule for its calendar's colour and source. */
function paintOf(event: CalendarEvent): EventPaint {
	const hex = eventHex(event);
	const alpha = bgAlphaFor(event.source);
	return { dark: eventColors(hex, alpha, "dark"), light: eventColors(hex, alpha, "light") };
}
