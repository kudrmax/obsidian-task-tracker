import type { Block, Card, Carried, Day, DayEvent, ListId, ListView, Place, Row, Screen, ScreenPort, Section, Target, TitlePart, ViewMode } from "../ui/engine/port";
import { addDays, DAY_START_HOUR, fileText, LIST_NAMES, type ListKey, minuteAt, mockFile, type MockFile, type MockSection, type MockTask, PROJECTS, todayAt } from "./mockModel";

/** The write delays the stand offers: none, a real write and read-back, a slow one. */
export const WRITE_DELAYS = [0, 30, 300] as const;
export type WriteDelay = (typeof WRITE_DELAYS)[number];

const LEVEL_COLORS = { p1: "#FF453A", p2: "#FF9F0A" } as const;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
/** The hour another day's timeline opens at. */
const SCROLL_TO_HOUR = 9;

/** The days' events: a working day of four calendars, two that overlap; today also an all-day one. */
const EVENTS: readonly { readonly title: string; readonly start: number; readonly end: number; readonly color: string }[] = [
	{ title: "Стендап", start: 9, end: 9.25, color: "#0A84FF" },
	{ title: "1:1 с Костей", start: 10, end: 11, color: "#0A84FF" },
	{ title: "Обед с Вадимом", start: 12.5, end: 13.5, color: "#FF9F0A" },
	{ title: "Планирование спринта", start: 15, end: 16.5, color: "#0A84FF" },
	{ title: "Созвон с банком", start: 15.5, end: 16, color: "#FF375F" },
	{ title: "Тренировка", start: 18, end: 19.5, color: "#30D158" },
];

/**
 * The stand's port (spec 2026-11-18, «MockPort»): made-up tasks in memory, the simplest product rules that make every case
 * appear, writes that wait `delay` ms as a real write and read-back do. Its state reads as a tasks file's text.
 */
export class MockPort implements ScreenPort {
	private file: MockFile;
	private missing = false;
	private place: Place = "calendar";
	private mode: ViewMode = "twoColumns";
	private dayOffset = 0;
	private listShare = 0.5;
	private hourPx = 56;
	private readonly history: string[] = [];
	private readonly listeners = new Set<() => void>();
	private cached: Screen | null = null;
	delay: WriteDelay = 30;

	constructor(private readonly clock: () => Date) {
		this.file = mockFile(clock());
	}

	// The checks' and the stand's own reach.

	fileText(): string | null {
		return this.missing ? null : fileText(this.file, this.today());
	}

	/** New made-up tasks around now. */
	reset(): void {
		this.file = mockFile(this.clock());
		this.missing = false;
		this.history.length = 0;
		this.changed();
	}

	/** No tasks file, as when it was deleted (null), or the tasks file back. */
	setMissing(missing: boolean): void {
		this.missing = missing;
		this.changed();
	}

	/** A task added at the top of `list` from outside the screen, as a hand edit or Sync brings it. */
	addFromOutside(list: ListKey, title: string): void {
		this.file[list].sections[0].tasks.unshift(this.newTask(title, list === "now" ? this.today() : null));
		this.changed();
	}

	setHourPx(hourPx: number): void {
		this.hourPx = hourPx;
		this.changed();
	}

	// The port.

	read(): Screen {
		return (this.cached ??= this.screenOf(this.file));
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	accepts(carried: Carried, target: ListId | "timeline"): boolean {
		if (carried.kind === "new" || target === "day" || target === "timeline") return true;
		const found = this.find(this.file, carried.id);
		/** Inbox, Backlog and Soon take no task on a time: it is the day's. */
		return found !== null && found.task.slot === null;
	}

	preview(id: string, target: Target): Screen {
		const file = structuredClone(this.file);
		this.apply(file, id, target);
		return this.screenOf(file);
	}

	async drop(id: string, target: Target): Promise<void> {
		await this.write(() => this.apply(this.file, id, target));
	}

	async moveSection(list: ListId, section: string, before: string | null): Promise<void> {
		await this.write(() => {
			const sections = this.file[this.keyOf(list)].sections;
			const at = sections.findIndex((s) => s.id === section);
			if (at < 0) return;
			const [moved] = sections.splice(at, 1);
			const to = before === null ? sections.length : sections.findIndex((s) => s.id === before);
			sections.splice(to < 0 ? sections.length : to, 0, moved);
		});
	}

	setPlace(place: Place): void {
		this.place = place;
		this.changed();
	}

	setMode(mode: ViewMode): void {
		this.mode = mode;
		this.changed();
	}

	showDay(shift: -1 | 1 | null): void {
		this.dayOffset = shift === null ? 0 : this.dayOffset + shift;
		this.changed();
	}

	setListShare(share: number): void {
		this.listShare = share;
		this.changed();
	}

	async undo(): Promise<void> {
		const last = this.history.pop();
		if (!last) return;
		await this.wait();
		this.file = JSON.parse(last) as MockFile;
		this.changed();
	}

	async createFile(): Promise<void> {
		await this.wait();
		this.file = { inbox: { sections: [this.section(null)] }, now: { sections: [this.section(null)] }, soon: { sections: [this.section(null)] }, backlog: { sections: [this.section(null)] }, done: { sections: [this.section(null)] } };
		this.missing = false;
		this.changed();
	}

	// Writes.

	private async write(change: () => void): Promise<void> {
		await this.wait();
		this.history.push(JSON.stringify(this.file));
		change();
		this.changed();
	}

	private wait(): Promise<void> {
		return this.delay > 0 ? new Promise((resolve) => window.setTimeout(resolve, this.delay)) : Promise.resolve();
	}

	private changed(): void {
		this.cached = null;
		for (const listener of this.listeners) listener();
	}

	/**
	 * A drop's rules, the simplest: to Inbox, Backlog or Soon the task loses its date and its time; to today's list it is
	 * due today in Now; to another day's it is due that day in Soon; on a list's title it goes to the end of its part without
	 * a section; on the timeline it is today's at that minute, its duration kept.
	 */
	private apply(file: MockFile, id: string, target: Target): void {
		const found = this.find(file, id);
		if (!found) return;
		const { task } = found;
		if (target.kind === "time") {
			const length = task.slot?.end != null ? task.slot.end - task.slot.start : null;
			task.slot = { start: target.minute, end: length === null ? null : target.minute + length };
			task.due = this.today();
			if (found.list !== "now") {
				this.take(file, id);
				file.now.sections[0].tasks.push(task);
			}
			return;
		}
		this.take(file, id);
		const list = target.kind === "place" ? target.place.list : target.list;
		const key = this.keyOf(list);
		task.slot = null;
		task.due = key === "now" ? this.today() : list === "day" ? this.shownDate() : null;
		if (target.kind === "title") {
			(file[key].sections.find((s) => s.name === null) ?? file[key].sections[0]).tasks.push(task);
			return;
		}
		const { parent, before, section } = target.place;
		const into = parent ? (this.find(file, parent)?.task.children ?? null) : (file[key].sections.find((s) => s.id === section)?.tasks ?? null);
		if (!into) return;
		const at = before === null ? -1 : into.findIndex((t) => t.id === before);
		into.splice(at < 0 ? into.length : at, 0, task);
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
		for (const key of Object.keys(file) as ListKey[]) for (const s of file[key].sections) if (from(s.tasks)) return;
	}

	private find(file: MockFile, id: string): { readonly task: MockTask; readonly list: ListKey } | null {
		const within = (tasks: readonly MockTask[]): MockTask | null => {
			for (const t of tasks) {
				if (t.id === id) return t;
				const deeper = within(t.children);
				if (deeper) return deeper;
			}
			return null;
		};
		for (const key of Object.keys(file) as ListKey[]) for (const s of file[key].sections) {
			const task = within(s.tasks);
			if (task) return { task, list: key };
		}
		return null;
	}

	private newTask(title: string, due: string | null): MockTask {
		return { id: `x${Date.now()}${Math.random().toString(36).slice(2, 6)}`, title, status: " ", priority: null, due, slot: null, project: null, folded: false, description: null, repeats: false, children: [] };
	}

	private section(name: string | null): MockSection {
		return { id: `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, tasks: [] };
	}

	/** The day list's file list: today's is Now, another day's is Soon (its tasks due that day). */
	private keyOf(list: ListId): ListKey {
		return list === "day" ? (this.dayOffset === 0 ? "now" : "soon") : list;
	}

	private today(): string {
		return todayAt(this.clock());
	}

	private shownDate(): string {
		return addDays(this.today(), this.dayOffset);
	}

	// Reads.

	private screenOf(file: MockFile): Screen {
		const shown = this.shownDate();
		const cards: Record<string, Card> = {};
		const lists = {
			inbox: this.listOf(file.inbox.sections, "Inbox", cards, null, () => true),
			backlog: this.listOf(file.backlog.sections, "Backlog", cards, null, () => true),
			soon: this.listOf(file.soon.sections, "Soon", cards, null, (t) => t.due === null),
			day: this.dayOffset === 0 ? this.listOf(file.now.sections, "Today", cards, shown, (t) => t.slot === null) : this.listOf(file.soon.sections, "", cards, shown, (t) => t.due === shown),
		};
		const day = this.dayOf(file, cards);
		return { missing: this.missing ? "TODOs Tasks.md" : null, mode: this.mode, place: this.place, lists, projects: this.mode === "byProject" ? this.projectsOf(file, cards) : null, cards, day, canUndo: this.history.length > 0, look: { cardHeight: 35, cardGap: 2, longPressMs: 250, listShare: this.listShare, hourPx: this.hourPx } };
	}

	/** A list's sections and rows: each open task with its open subtasks under it unless folded; empty sections shown with their headers. */
	private listOf(sections: readonly MockSection[], title: string, cards: Record<string, Card>, day: string | null, shows: (task: MockTask) => boolean, stage: Card["stage"] = null): ListView {
		const headers = sections.some((s) => s.name !== null);
		const out: Section[] = [];
		for (const s of sections) {
			const rows: Row[] = [];
			const walk = (task: MockTask, depth: number) => {
				if (task.status === "x") return;
				cards[task.id] = this.cardOf(task, day, stage);
				rows.push({ id: task.id, depth });
				if (!task.folded) for (const child of task.children) walk(child, depth + 1);
			};
			for (const task of s.tasks) if (shows(task)) walk(task, 0);
			if (rows.length === 0 && s.name === null) continue;
			out.push({ id: s.id, title: s.name, header: headers, empty: rows.length === 0, rows, movable: headers });
		}
		const drawsNothing = out.every((s) => s.rows.length === 0 && !s.header);
		return { title, sections: drawsNothing ? [] : out, plate: drawsNothing ? "No tasks" : null, emptyLabel: "No tasks", ungrouped: "No section" };
	}

	private cardOf(task: MockTask, day: string | null, stage: Card["stage"]): Card {
		const open = task.children.filter((c) => c.status !== "x");
		const step = task.folded ? this.nextStep(task) : null;
		const shown = step ?? task;
		const due = task.due !== null && task.due !== day ? task.due : null;
		const [, month, date] = due ? due.split("-").map(Number) : [0, 0, 0];
		return {
			id: task.id,
			title: partsOf(shown.title),
			over: step ? task.title : null,
			inProgress: task.status === "/",
			paint: task.priority ? { colors: [LEVEL_COLORS[task.priority]] } : null,
			project: task.project,
			count: task.children.length ? { done: task.children.length - open.length, total: task.children.length } : null,
			description: task.description !== null,
			due: due || task.repeats ? { day: due ? String(date) : null, month: due ? MONTHS[month - 1] : null, repeats: task.repeats } : null,
			folded: task.folded && open.length > 0,
			stage,
		};
	}

	/** A folded task's next step: its first open subtask, the deepest first. */
	private nextStep(task: MockTask): MockTask | null {
		const open = task.children.find((c) => c.status !== "x");
		return open ? (this.nextStep(open) ?? open) : null;
	}

	/** By project: a part per project in the tree's order, No project last, each card with its stage's mark. */
	private projectsOf(file: MockFile, cards: Record<string, Card>): ListView {
		const stageOf: Record<ListKey, Card["stage"]> = { inbox: "inbox", backlog: "backlog", soon: "soon", now: "now", done: null };
		const parts: Section[] = [];
		for (const name of [...PROJECTS.map((p) => p.name), null]) {
			const rows: Row[] = [];
			for (const key of ["inbox", "backlog", "soon", "now"] as const) for (const s of file[key].sections) for (const task of s.tasks) {
				if (task.status === "x" || task.project !== name) continue;
				cards[task.id] = this.cardOf(task, null, stageOf[key]);
				rows.push({ id: task.id, depth: 0 });
			}
			parts.push({ id: `project:${name ?? "none"}`, title: name ?? "No project", header: true, empty: rows.length === 0, rows, movable: false });
		}
		return { title: "", sections: parts, plate: null, emptyLabel: "No tasks", ungrouped: "No project" };
	}

	private dayOf(file: MockFile, cards: Record<string, Card>): Day {
		const now = this.dayOffset === 0 ? minuteAt(this.clock()) : null;
		const blocks: Block[] = [];
		if (this.dayOffset === 0) for (const s of file.now.sections) for (const task of s.tasks) {
			if (!task.slot) continue;
			cards[task.id] = this.cardOf(task, this.today(), null);
			const rides = now !== null && task.slot.start < now && task.status !== "x";
			const clock = (DAY_START_HOUR * 60 + task.slot.start) % (24 * 60);
			blocks.push({ id: task.id, start: rides ? now : task.slot.start, end: task.slot.end === null ? null : (rides ? now : task.slot.start) + (task.slot.end - task.slot.start), ridesNow: rides, time: [pad(Math.floor(clock / 60)), pad(clock % 60)] });
		}
		const shown = this.shownDate();
		const hour = (h: number) => (h - DAY_START_HOUR) * 60;
		const events: DayEvent[] = EVENTS.map((e, i) => ({ id: `${shown}-${i}`, title: e.title, start: hour(e.start), end: hour(e.end), color: e.color, past: now !== null && hour(e.end) <= now }));
		const allDay: DayEvent[] = this.dayOffset === 0 ? [{ id: `${shown}-all`, title: "День рождения Ани", start: 0, end: 24 * 60, color: "#30D158", past: false }] : [];
		const clockNow = this.clock();
		return {
			title: this.titleOf(shown),
			isToday: this.dayOffset === 0,
			blocks,
			events,
			allDay,
			now,
			nowLabel: `${pad(clockNow.getHours())}:${pad(clockNow.getMinutes())}`,
			hours: Array.from({ length: 24 }, (_, i) => pad((DAY_START_HOUR + i) % 24)),
			open: now !== null ? { minute: now, fraction: 0.5 } : { minute: hour(SCROLL_TO_HOUR), fraction: 0 },
		};
	}

	private titleOf(date: string): string {
		if (this.dayOffset === 0) return "Today";
		if (this.dayOffset === 1) return "Tomorrow";
		if (this.dayOffset === -1) return "Yesterday";
		const [y, m, d] = date.split("-").map(Number);
		return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1].charAt(0)}${MONTHS[m - 1].slice(1).toLowerCase()}`;
	}
}

/** A title's links shown by their word: `[[note]]`, `[[note|alias]]`, `[text](url)`, a bare address. */
function partsOf(title: string): TitlePart[] {
	const parts: TitlePart[] = [];
	const link = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/\S+)/g;
	let at = 0;
	for (const m of title.matchAll(link)) {
		if (m.index > at) parts.push({ kind: "text", text: title.slice(at, m.index) });
		parts.push(m[5] ? { kind: "link", text: m[5], target: m[5] } : m[3] ? { kind: "link", text: m[3], target: m[4] } : { kind: "link", text: m[2] ?? m[1], target: m[1] });
		at = m.index + m[0].length;
	}
	if (at < title.length) parts.push({ kind: "text", text: title.slice(at) });
	return parts;
}

export { LIST_NAMES };
