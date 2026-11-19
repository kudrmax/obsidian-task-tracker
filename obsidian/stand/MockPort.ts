import type { AllDayEvent, Block, CardFace, DayEvent, Destination, Edge, EditId, EventPaint, ListData, ListId, MenuAction, MenuFrom, MenuModel, MoveId, Now, ReminderKind, StatusId, Row, ScreenData, ScreenPort } from "../ui/engine/port";
import { bgAlphaFor, eventColors } from "../ui/eventColors";
import { addDays, CALENDAR_COLORS, DAY_START_HOUR, dateOf, dayOf, fileText, LIST_KEYS, type ListKey, type MockFile, type MockSection, type MockTask, minuteOf, mockFile } from "./mockData";

/** The calendar's largest hour on the stand: the settings' default zoom levels end at 224 px an hour. */
export const ZOOM_MOST = 224;
/** Where the stand keeps the calendar's zoom on the device. */
export const ZOOM_KEY = "task-calendar-stand-zoom";

/** The calendar's zoom kept by `load` and `save` (the device's storage): an hour's height, or the whole day. */
export function keptZoom(load: () => unknown, save: (value: number | "wholeDay") => void): { readonly kept: number | "wholeDay" | null; keep(zoom: number | "wholeDay"): void; readonly most: number } {
	const value = load();
	return { kept: value === "wholeDay" || (typeof value === "number" && value > 0) ? value : null, keep: save, most: ZOOM_MOST };
}

/** The write delays the stand offers: none, a real write and its read-back, a slow one. */
export const WRITE_DELAYS = [0, 30, 300] as const;
export type WriteDelay = (typeof WRITE_DELAYS)[number];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEVEL_COLORS = { p1: "red", p2: "orange" } as const;
const pad = (n: number) => String(n).padStart(2, "0");
/** An event's paint in each theme from its calendar's colour, by the plugin's rule (`eventColors`; the work calendar's ground a touch stronger). */
const paintOf = (color: string): EventPaint => {
	const alpha = bgAlphaFor(color === CALENDAR_COLORS.work ? "work" : "google");
	return { dark: eventColors(color, alpha, "dark"), light: eventColors(color, alpha, "light") };
};
/** A minute from the day's start as the clock writes it: «14:15». */
const clockOf = (minute: number) => {
	const clock = DAY_START_HOUR * 60 + minute;
	return `${pad(Math.floor(clock / 60) % 24)}:${pad(clock % 60)}`;
};
const DAY_MINUTES = 24 * 60;
/** Another day opens at this hour (the «Scroll to hour» setting's default), minutes from the day's start. */
const OPENS_AT = (9 - DAY_START_HOUR) * 60;
/** The priority levels of the settings, in their order (the plugin's defaults). */
const LEVELS = [
	{ prefix: "p1", color: LEVEL_COLORS.p1 },
	{ prefix: "p2", color: LEVEL_COLORS.p2 },
] as const;
/** The file's mark each status tile writes. */
const STATUS_MARKS: Readonly<Record<StatusId, MockTask["status"]>> = { done: "x", inProgress: "/", stopProgress: " ", wontDo: "-", stop: " " };
const REMINDERS: readonly ReminderKind[] = ["live", "notification", "alarm", "none"];
/** A task done or given up leaves the screen; it stays in the file. */
const closed = (t: MockTask) => t.status === "x" || t.status === "-";

/**
 * The stand's port (spec 2026-11-18, «MockPort»): made-up tasks in memory, the simplest product rules that make each case
 * appear, writes that wait `delay` ms as a real write and read-back do. Its state reads as a tasks file's text. In part 2
 * the core's rules win over these.
 */
export class MockPort implements ScreenPort {
	private file: MockFile;
	/** The file with the writes not yet read back already made: what a preview and a refusal are drawn from. Null when none is in flight. */
	private ahead: MockFile | null = null;
	private inFlight = 0;
	private readonly listeners = new Set<() => void>();
	/** Reads by day, as of the clock's minute: what rides the now line and what is past changes with it. */
	private readonly cache = new Map<string, ScreenData>();
	private added = 0;
	delay: WriteDelay = 30;

	constructor(private readonly clock: () => Date = () => new Date()) {
		this.file = mockFile(clock());
	}

	// The stand's and the checks' own reach.

	fileText(): string {
		return fileText(this.file, this.clock());
	}

	/** New made-up tasks around now; `file` puts a given set instead (the first step's one column). */
	reset(file: MockFile = mockFile(this.clock())): void {
		this.file = file;
		this.ahead = null;
		this.changed();
	}

	/** A task added at the top of `list` from outside the screen, as a hand edit or Sync brings it. */
	addFromOutside(list: ListKey, title: string): void {
		this.file[list][0].tasks.unshift(this.newTask(title, list === "now" ? dateOf(this.day()) : null));
		this.changed();
	}

	/** A task moved from outside: the one titled `title` before the one titled `before` (null: its list's first section's end). */
	moveFromOutside(title: string, list: ListKey, before: string | null): void {
		const found = this.findBy(this.file, (t) => t.title === title);
		if (!found) throw new Error(`no task «${title}»`);
		this.take(this.file, found.task.id);
		const into = before === null ? this.file[list][0].tasks : this.containerOf(this.file, this.findBy(this.file, (t) => t.title === before)?.task.id ?? "");
		if (!into) throw new Error(`no task «${before}»`);
		const at = before === null ? into.length : into.findIndex((t) => t.title === before);
		into.splice(at, 0, found.task);
		this.changed();
	}

	// The port.

	read(dayOffset: number): ScreenData {
		const key = `${dayOffset}@${minuteOf(this.clock())}`;
		let data = this.cache.get(key);
		if (!data) {
			if (this.cache.size > 16) this.cache.clear();
			data = this.screenOf(this.file, dayOffset);
			this.cache.set(key, data);
		}
		return data;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	now(): Now {
		const clock = this.clock();
		return { minute: minuteOf(clock), label: `${pad(clock.getHours())}:${pad(clock.getMinutes())}` };
	}

	preview(id: string, to: Destination): ScreenData {
		const file = structuredClone(this.ahead ?? this.file);
		this.apply(file, id, to);
		return this.screenOf(file, to.dayOffset);
	}

	/** The stand refuses nothing (Decision 27): every list and every day's calendar takes a task; the refusal stays for part 2's project mode (F161). */
	takes(id: string, _to: Destination): boolean {
		return this.findBy(this.ahead ?? this.file, (t) => t.id === id) !== null;
	}

	stretched(id: string, dayOffset: number, edge: Edge, minute: number): ScreenData {
		const file = structuredClone(this.ahead ?? this.file);
		const task = this.findBy(file, (t) => t.id === id)?.task;
		if (!task?.slot) return this.screenOf(file, dayOffset);
		const span = this.stretchedSpan(task, dayOffset, edge, minute);
		task.slot = { start: span.start, end: span.end > span.start ? span.end : null };
		return this.screenOf(file, dayOffset, id);
	}

	/** The plugin's rule (the core's `TimelineSpans.resized`), the simplest form of it. */
	resized(id: string, dayOffset: number, edge: Edge, minute: number, least: number): Destination | null {
		const task = this.findBy(this.ahead ?? this.file, (t) => t.id === id)?.task;
		if (!task?.slot) return null;
		const shown = this.shownSpan(task, dayOffset);
		const held = this.stretchedSpan(task, dayOffset, edge, minute);
		const keeps = held.end - held.start > least;
		const unmoved = edge === "start" && shown.end === null;
		const next = keeps ? held : { start: unmoved ? shown.start : held.start, end: null };
		if (next.start === shown.start && next.end === shown.end) return null;
		const to = (at: number, end: number | null): Destination => ({ list: "day", before: null, dayOffset, at, end });
		if (edge === "start") return to(next.start, next.end);
		const start = task.slot.start;
		return to(start, next.end === null ? null : start + next.end - next.start);
	}

	/** Where a timed task is drawn: an open task of today whose start has passed rides the now line, its length kept. */
	private shownSpan(t: MockTask, dayOffset: number): { readonly start: number; readonly end: number | null } {
		const { start, end } = t.slot ?? { start: 0, end: null };
		const present = minuteOf(this.clock());
		if (dayOffset !== 0 || closed(t) || start >= present) return { start, end };
		return { start: present, end: end === null ? null : present + end - start };
	}

	/**
	 * The task while a dot is held at `minute`: the end no earlier than the start nor past the day; the start no earlier than
	 * the day nor past the end, and on a task without a length no later than its start, which becomes the end.
	 */
	private stretchedSpan(t: MockTask, dayOffset: number, edge: Edge, minute: number): { readonly start: number; readonly end: number } {
		const shown = this.shownSpan(t, dayOffset);
		if (edge === "end") return { start: shown.start, end: Math.min(DAY_MINUTES, Math.max(shown.start, minute)) };
		const end = shown.end ?? shown.start;
		return { start: Math.max(0, Math.min(minute, end)), end };
	}

	async move(id: string, to: Destination): Promise<void> {
		await this.write((file) => this.apply(file, id, to));
	}

	clockAt(minute: number): string {
		return clockOf(minute);
	}

	/** The plus's place, the simplest: the end of Inbox's tasks outside any section. */
	newTaskPlace(dayOffset: number): Destination {
		return { list: "inbox", section: null, before: null, dayOffset, depth: 0 };
	}

	/** A new task (F190): Inbox and Soon without a date, a day's list with its date; on a day's calendar its time too, no length, at the end of Now (today) or Soon. */
	async add(text: string, at: Destination): Promise<string> {
		const id = `x${++this.added}`;
		await this.write((file) => {
			const task = this.newTask(text.trim(), null, id);
			task.due = at.list === "day" ? dateOf(addDays(this.day(), at.dayOffset)) : null;
			if (at.at !== undefined) {
				task.slot = { start: at.at, end: null };
				const sections = this.listOf(file, "day", at.dayOffset);
				sections[sections.length - 1].tasks.push(task);
				return;
			}
			this.nest(file, task, { ...at, depth: at.depth ?? 0 }, at.section === undefined ? null : this.sectionFor(file, at));
		});
		return id;
	}

	/**
	 * A task's menu by the plugin's rules, the simplest (`core/application/menus.ts`): Won't do and Delete ask first; the
	 * levels of the settings; Today and Tomorrow but the day the task stands on; Rename, Reminder for a timed task, Add
	 * description without one, Repeat, Section for a task of a list with sections, Project (disabled on a subtask), Add
	 * subtask but in a block's stack, First step but in a stack; a calendar's task its open subtasks.
	 */
	menu(id: string, from: MenuFrom): MenuModel {
		const event = this.file.events.find((e) => e.id === id) ?? this.file.allDay.find((e) => e.id === id);
		if (event) return { kind: "event", title: event.title };
		const found = this.findBy(this.file, (t) => t.id === id);
		if (!found) throw new Error(`no task ${id}`);
		const { task, list } = found;
		const today = dateOf(this.day());
		const tomorrow = dateOf(addDays(this.day(), 1));
		const top = this.file[list].some((section) => section.tasks.includes(task));
		const sections = this.file[list].some((section) => section.name !== null);
		const offered: [EditId, boolean, string][] = [
			["rename", true, ""],
			["reminder", task.slot !== null, ""],
			["description", task.description === null, ""],
			["repeat", true, ""],
			["section", from === "list" && top && sections, this.file[list].find((section) => section.tasks.includes(task))?.name ?? ""],
			["project", true, "No project"],
			["subtask", from !== "stack", ""],
			["firstStep", from !== "stack", ""],
		];
		const reminder = task.reminder ?? "live";
		const moves: MoveId[] = [...(task.due === today ? [] : ["today" as const]), ...(task.due === tomorrow ? [] : ["tomorrow" as const]), "pick"];
		return {
			kind: "task",
			title: task.title,
			statuses: [
				{ id: "done", confirm: false },
				{ id: task.status === "/" ? "stopProgress" : "inProgress", confirm: false },
				{ id: "wontDo", confirm: true },
			],
			levels: { tiles: LEVELS.map((level) => ({ ...level, on: task.level === level.prefix })), disabled: false },
			moves,
			date: { today, picked: task.due, removable: task.due !== null && task.due !== today },
			edits: offered.filter(([, on]) => on).map(([edit, , value]) => ({ id: edit, value: edit === "reminder" ? reminder : value, disabled: edit === "project" && !top })),
			opens: ["fullScreen", "obsidian"],
			remove: { confirm: true },
			reminders: REMINDERS.map((kind) => ({ kind, checked: kind === reminder })),
			peek: task.description,
			subtasks: from === "calendar" ? task.children.filter((c) => !closed(c)).map((c) => c.id) : [],
		};
	}

	/** What a menu's tap writes, by the plugin's rules, the simplest: a move puts the task at the end of Now (today and before) or Soon, due that day, without its time. */
	async act(id: string, action: MenuAction): Promise<void> {
		if (action.kind === "row") return;
		const today = dateOf(this.day());
		await this.write((file) => {
			const found = this.findBy(file, (t) => t.id === id);
			if (!found) return;
			const { task } = found;
			switch (action.kind) {
				case "status":
					task.status = STATUS_MARKS[action.id];
					return;
				case "priority":
					task.level = task.level === action.prefix ? null : (action.prefix as MockTask["level"]);
					return;
				case "reminder":
					task.reminder = action.reminder;
					return;
				case "rename":
					task.title = action.text.trim() || task.title;
					return;
				case "delete":
					this.take(file, id);
					return;
				case "move":
					return this.putOff(file, task, action.id === "today" ? today : dateOf(addDays(this.day(), 1)));
				case "date":
					if (action.date === null) {
						task.due = null;
						return;
					}
					return this.putOff(file, task, action.date);
			}
		});
	}

	/** Due `date` without a time, at the end of Now for today and the days before it, of Soon for a later day. */
	private putOff(file: MockFile, task: MockTask, date: string): void {
		this.take(file, task.id);
		task.due = date;
		task.slot = null;
		const sections = date <= dateOf(this.day()) ? file.now : file.soon;
		sections[sections.length - 1].tasks.push(task);
	}

	// Writes.

	/** A write made at once in `ahead` (previews see it), and in the file after `delay`, as a real write is read back. */
	private async write(change: (file: MockFile) => void): Promise<void> {
		this.ahead ??= structuredClone(this.file);
		change(this.ahead);
		this.inFlight++;
		if (this.delay > 0) await new Promise((resolve) => window.setTimeout(resolve, this.delay));
		change(this.file);
		if (--this.inFlight === 0) this.ahead = null;
		this.changed();
	}

	private changed(): void {
		this.cache.clear();
		for (const listener of this.listeners) listener();
	}

	/**
	 * A move's rules, the simplest: before a task, into its section and under its parent; at a list's end, into its last
	 * section. To Inbox or Soon a task loses its date and its time; to today's list it is due today without a time; to
	 * another day's list it is due that day in Soon. Onto a day's calendar (`at`) it is due that day at that minute (Now for
	 * today, Soon for another day), keeping its length (none when it had no time) unless `end` says; a task already timed
	 * that day keeps its place in the file.
	 */
	private apply(file: MockFile, id: string, to: Destination): void {
		const found = this.findBy(file, (t) => t.id === id);
		if (!found || id === to.before) return;
		const { task } = found;
		const due = to.list === "day" ? dateOf(addDays(this.day(), to.dayOffset)) : null;
		if (to.at !== undefined) {
			const length = task.slot && task.slot.end !== null ? task.slot.end - task.slot.start : null;
			const end = to.end !== undefined ? to.end : length === null ? null : Math.min(DAY_MINUTES, to.at + length);
			const home = to.dayOffset <= 0 ? "now" : "soon";
			const stays = task.slot !== null && task.due === due && file[home].some((section) => section.tasks.includes(task));
			task.slot = { start: to.at, end };
			task.due = due;
			if (stays) return;
			this.take(file, id);
			const sections = this.listOf(file, "day", to.dayOffset);
			sections[sections.length - 1].tasks.push(task);
			return;
		}
		this.take(file, id);
		task.slot = null;
		task.due = due;
		if (to.section !== undefined) return this.nest(file, task, to, this.sectionFor(file, to));
		if (to.depth !== undefined) return this.nest(file, task, to);
		const into = to.before ? this.containerOf(file, to.before) : null;
		if (into) into.splice(into.findIndex((t) => t.id === to.before), 0, task);
		else {
			const sections = this.listOf(file, to.list, to.dayOffset);
			sections[sections.length - 1].tasks.push(task);
		}
	}

	/**
	 * A move at a given level, as the sortable tree example builds its tree again (`buildTree`): the section's tasks laid
	 * out flat with their levels, the task put in before `before` (or at the end) at `to.depth`, no deeper than one under
	 * the task above it, then each task hung under the nearest one above it a level up. Its own subtasks go with it.
	 */
	private nest(file: MockFile, task: MockTask, to: Destination, given: MockSection | null = null): void {
		const sections = this.listOf(file, to.list, to.dayOffset);
		const section = given ?? (to.before ? sections.find((sec) => this.inSection(sec.tasks, to.before ?? "")) : undefined) ?? sections[sections.length - 1];
		const flat: { task: MockTask; depth: number }[] = [];
		const lay = (tasks: readonly MockTask[], depth: number) => {
			for (const t of tasks) {
				flat.push({ task: t, depth });
				lay(t.children, depth + 1);
			}
		};
		lay(section.tasks, 0);
		const at = to.before ? flat.findIndex((f) => f.task.id === to.before) : flat.length;
		const index = at < 0 ? flat.length : at;
		const above = flat[index - 1];
		flat.splice(index, 0, { task, depth: Math.min(to.depth ?? 0, above ? above.depth + 1 : 0) });
		const roots: MockTask[] = [];
		const stack: MockTask[] = [];
		for (const f of flat) {
			if (f.task !== task) f.task.children = [];
			stack.length = f.depth;
			(f.depth === 0 ? roots : stack[f.depth - 1].children).push(f.task);
			stack[f.depth] = f.task;
		}
		section.tasks = roots;
	}

	/** The section a move names: by its id, or the list's tasks outside any section (made first in the list when it has none). */
	private sectionFor(file: MockFile, to: Destination): MockSection {
		const sections = this.listOf(file, to.list, to.dayOffset);
		const named = to.section === null ? sections.find((sec) => sec.name === null) : sections.find((sec) => sec.id === to.section);
		if (named) return named;
		const loose: MockSection = { id: `s-loose-${to.list}`, name: null, tasks: [] };
		sections.unshift(loose);
		return loose;
	}

	private inSection(tasks: readonly MockTask[], id: string): boolean {
		return tasks.some((t) => t.id === id || this.inSection(t.children, id));
	}

	private take(file: MockFile, id: string): void {
		const from = (tasks: MockTask[]): boolean => {
			const at = tasks.findIndex((t) => t.id === id);
			if (at >= 0) {
				tasks.splice(at, 1);
				return true;
			}
			return tasks.some((t) => from(t.children));
		};
		for (const key of LIST_KEYS) for (const s of file[key]) if (from(s.tasks)) return;
	}

	/** The array that holds the task `id`: its section's tasks, or its parent's subtasks. */
	private containerOf(file: MockFile, id: string): MockTask[] | null {
		const within = (tasks: MockTask[]): MockTask[] | null => (tasks.some((t) => t.id === id) ? tasks : tasks.reduce<MockTask[] | null>((hit, t) => hit ?? within(t.children), null));
		for (const key of LIST_KEYS) for (const s of file[key]) {
			const hit = within(s.tasks);
			if (hit) return hit;
		}
		return null;
	}

	private findBy(file: MockFile, match: (t: MockTask) => boolean): { readonly task: MockTask; readonly list: ListKey } | null {
		const within = (tasks: readonly MockTask[]): MockTask | null => {
			for (const t of tasks) {
				if (match(t)) return t;
				const deeper = within(t.children);
				if (deeper) return deeper;
			}
			return null;
		};
		for (const key of LIST_KEYS) for (const s of file[key]) {
			const task = within(s.tasks);
			if (task) return { task, list: key };
		}
		return null;
	}

	private newTask(title: string, due: string | null, id = `x${++this.added}`): MockTask {
		return { id, title, level: null, status: " ", due, slot: null, description: null, children: [] };
	}

	/** A screen list's sections in the file: a day's list is Now for today and the days before it (F190), Soon for a later day (its tasks due that day). */
	private listOf(file: MockFile, list: ListId, dayOffset: number): MockSection[] {
		if (list === "inbox") return file.inbox;
		if (list === "soon") return file.soon;
		return dayOffset <= 0 ? file.now : file.soon;
	}

	private day(): Date {
		return dayOf(this.clock());
	}

	// Reads.

	/** The screen as `file` says; `held`, a task held by a dot, drawn where it is stretched to, not riding the now line. */
	private screenOf(file: MockFile, dayOffset: number, held: string | null = null): ScreenData {
		const shown = dateOf(addDays(this.day(), dayOffset));
		const cards: Record<string, CardFace> = {};
		const today = dayOffset === 0;
		return {
			lists: {
				inbox: this.listData("Inbox", file.inbox, cards, null, () => true),
				soon: this.listData("Soon", file.soon, cards, null, (t) => t.due === null),
				day: this.listData(this.titleOf(dayOffset), this.listOf(file, "day", dayOffset), cards, shown, today ? (t) => t.slot === null : (t) => t.due === shown && t.slot === null),
			},
			cards,
			day: {
				title: this.titleOf(dayOffset),
				isToday: today,
				blocks: this.blocksOf(file, cards, shown, today, held),
				events: this.eventsOf(file, dayOffset),
				allDay: file.allDay.map((e): AllDayEvent => ({ id: e.id, title: e.title, past: dayOffset < 0, paint: paintOf(e.color) })),
				hours: Array.from({ length: 24 }, (_, i) => pad((DAY_START_HOUR + i) % 24)),
				opensAt: OPENS_AT,
			},
		};
	}

	/** A list's rows: each open task with its open subtasks under it, a header over each named section; an empty one is its header alone. */
	private listData(title: string, sections: readonly MockSection[], cards: Record<string, CardFace>, day: string | null, shows: (t: MockTask) => boolean): ListData {
		const rows: Row[] = [];
		const walk = (t: MockTask, depth: number) => {
			if (closed(t)) return;
			cards[t.id] = this.faceOf(t, day);
			rows.push({ kind: "task", id: t.id, depth });
			if (!t.folded) for (const child of t.children) walk(child, depth + 1);
		};
		for (const s of sections) {
			if (s.name !== null) rows.push({ kind: "section", id: s.id, title: s.name });
			for (const t of s.tasks) if (shows(t)) walk(t, 0);
		}
		return { title, rows };
	}

	private faceOf(t: MockTask, day: string | null): CardFace {
		const due = t.due !== null && t.due !== day ? t.due.split("-").map(Number) : null;
		const done = t.children.filter((c) => c.status === "x").length;
		return {
			id: t.id,
			title: t.title,
			color: t.level ? LEVEL_COLORS[t.level] : null,
			inProgress: t.status === "/",
			count: t.children.length ? { done, total: t.children.length } : null,
			description: t.description !== null,
			due: due ? { day: String(due[2]), month: MONTHS[due[1] - 1] } : null,
		};
	}

	/**
	 * The shown day's timed tasks, open ones only. An open task of today whose time has passed rides the now line: drawn at
	 * the present minute, its length kept, its time in the file as it was (the design's «Едет за линией»; at its very minute
	 * it still stands). A folded task's block is named by its next open step.
	 */
	private blocksOf(file: MockFile, cards: Record<string, CardFace>, shown: string, today: boolean, held: string | null = null): Block[] {
		const present = minuteOf(this.clock());
		const blocks: Block[] = [];
		for (const key of ["now", "soon"] as const)
			for (const s of file[key])
				for (const t of s.tasks) {
					if (!t.slot || closed(t) || t.due !== shown) continue;
					for (const c of t.children) if (!closed(c)) cards[c.id] = this.faceOf(c, shown);
					cards[t.id] = this.faceOf(t, shown);
					const { start: from, end } = t.slot;
					const length = end === null ? null : end - from;
					blocks.push({
						id: t.id,
						start: today && t.id !== held && present > from ? present : from,
						length,
						clock: clockOf(from),
						endClock: end === null ? null : clockOf(end),
						startParts: [String(Math.floor((DAY_START_HOUR * 60 + from) / 60) % 24), pad(from % 60)],
						lengthParts: length === null ? null : length < 60 ? [String(length), "MIN"] : [length % 60 ? `${Math.floor(length / 60)}:${pad(length % 60)}` : String(length / 60), "H"],
						step: t.folded ? this.nextStep(t) : null,
					});
				}
		return blocks;
	}

	/** A folded task's next open step: its first open subtask, and that one's first open subtask, deeper as far as they go. */
	private nextStep(t: MockTask): string | null {
		const open = t.children.find((c) => !closed(c));
		return open ? (this.nextStep(open) ?? open.title) : null;
	}

	/** The day's events: every made-up event each day; over once its end is past the present minute, and every one of a past day. */
	private eventsOf(file: MockFile, dayOffset: number): DayEvent[] {
		const present = minuteOf(this.clock());
		return file.events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, paint: paintOf(e.color), past: dayOffset < 0 || (dayOffset === 0 && e.end <= present) }));
	}

	private titleOf(dayOffset: number): string {
		if (dayOffset === 0) return "Today";
		if (dayOffset === 1) return "Tomorrow";
		if (dayOffset === -1) return "Yesterday";
		const date = addDays(this.day(), dayOffset);
		return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()].charAt(0)}${MONTHS[date.getMonth()].slice(1).toLowerCase()}`;
	}
}
