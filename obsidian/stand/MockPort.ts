import type { Block, CardFace, Destination, ListData, ListId, MenuItem, Now, Row, ScreenData, ScreenPort } from "../ui/engine/port";
import { addDays, DAY_START_HOUR, dateOf, dayOf, fileText, LIST_KEYS, type ListKey, type MockFile, type MockSection, type MockTask, minuteOf, mockFile } from "./mockData";

/** The write delays the stand offers: none, a real write and its read-back, a slow one. */
export const WRITE_DELAYS = [0, 30, 300] as const;
export type WriteDelay = (typeof WRITE_DELAYS)[number];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LEVEL_COLORS = { p1: "red", p2: "orange" } as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** The lists a menu sends a task to, by the item's id. */
const MENU: readonly MenuItem[] = [
	{ id: "inbox", label: "Inbox" },
	{ id: "soon", label: "Soon" },
	{ id: "day", label: "Today" },
];

/**
 * The stand's port (spec 2026-11-18, «MockPort»): made-up tasks in memory, the simplest product rules that make each case
 * appear, writes that wait `delay` ms as a real write and read-back do. Its state reads as a tasks file's text. In part 2
 * the core's rules win over these.
 */
export class MockPort implements ScreenPort {
	private file: MockFile;
	private readonly listeners = new Set<() => void>();
	private readonly cache = new Map<number, ScreenData>();
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
		let data = this.cache.get(dayOffset);
		if (!data) {
			data = this.screenOf(this.file, dayOffset);
			this.cache.set(dayOffset, data);
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
		const file = structuredClone(this.file);
		this.apply(file, id, to);
		return this.screenOf(file, to.dayOffset);
	}

	async move(id: string, to: Destination): Promise<void> {
		await this.write(() => this.apply(this.file, id, to));
	}

	async add(text: string, list: ListId, dayOffset: number): Promise<string> {
		const task = this.newTask(text.trim(), list === "day" ? dateOf(addDays(this.day(), dayOffset)) : null);
		await this.write(() => this.listOf(this.file, list, dayOffset)[0].tasks.unshift(task));
		return task.id;
	}

	menu(id: string): readonly MenuItem[] {
		const found = this.findBy(this.file, (t) => t.id === id);
		const here = found?.list === "inbox" ? "inbox" : found?.list === "now" ? "day" : "soon";
		return MENU.filter((item) => item.id !== here);
	}

	async act(id: string, item: string): Promise<void> {
		const list = item as ListId;
		const first = this.screenOf(this.file, 0).lists[list].rows.find((row) => row.kind === "task");
		await this.move(id, { list, before: first?.id ?? null, dayOffset: 0 });
	}

	// Writes.

	private async write(change: () => void): Promise<void> {
		if (this.delay > 0) await new Promise((resolve) => window.setTimeout(resolve, this.delay));
		change();
		this.changed();
	}

	private changed(): void {
		this.cache.clear();
		for (const listener of this.listeners) listener();
	}

	/**
	 * A move's rules, the simplest: before a task, into its section and under its parent; at a list's end, into its last
	 * section. To Inbox or Soon a task loses its date and its time; to today's list it is due today without a time; to
	 * another day's list it is due that day in Soon.
	 */
	private apply(file: MockFile, id: string, to: Destination): void {
		const found = this.findBy(file, (t) => t.id === id);
		if (!found || id === to.before) return;
		const { task } = found;
		this.take(file, id);
		task.slot = null;
		task.due = to.list === "day" ? dateOf(addDays(this.day(), to.dayOffset)) : null;
		const into = to.before ? this.containerOf(file, to.before) : null;
		if (into) into.splice(into.findIndex((t) => t.id === to.before), 0, task);
		else {
			const sections = this.listOf(file, to.list, to.dayOffset);
			sections[sections.length - 1].tasks.push(task);
		}
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

	private newTask(title: string, due: string | null): MockTask {
		return { id: `x${++this.added}`, title, level: null, status: " ", due, slot: null, description: null, children: [] };
	}

	/** A screen list's sections in the file: today's list is Now, another day's is Soon (its tasks due that day). */
	private listOf(file: MockFile, list: ListId, dayOffset: number): MockSection[] {
		if (list === "inbox") return file.inbox;
		if (list === "soon") return file.soon;
		return dayOffset === 0 ? file.now : file.soon;
	}

	private day(): Date {
		return dayOf(this.clock());
	}

	// Reads.

	private screenOf(file: MockFile, dayOffset: number): ScreenData {
		const shown = dateOf(addDays(this.day(), dayOffset));
		const cards: Record<string, CardFace> = {};
		const today = dayOffset === 0;
		return {
			lists: {
				inbox: this.listData("Inbox", file.inbox, cards, null, () => true),
				soon: this.listData("Soon", file.soon, cards, null, (t) => t.due === null),
				day: this.listData(this.titleOf(dayOffset), today ? file.now : file.soon, cards, shown, today ? (t) => t.slot === null : (t) => t.due === shown),
			},
			cards,
			day: { title: this.titleOf(dayOffset), isToday: today, blocks: today ? this.blocksOf(file, cards) : [], hours: Array.from({ length: 24 }, (_, i) => pad((DAY_START_HOUR + i) % 24)) },
		};
	}

	/** A list's rows: each open task with its open subtasks under it, a header over each named section (an empty one too). */
	private listData(title: string, sections: readonly MockSection[], cards: Record<string, CardFace>, day: string | null, shows: (t: MockTask) => boolean): ListData {
		const rows: Row[] = [];
		const walk = (t: MockTask, depth: number) => {
			if (t.status === "x") return;
			cards[t.id] = this.faceOf(t, day);
			rows.push({ kind: "task", id: t.id, depth });
			for (const child of t.children) walk(child, depth + 1);
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

	/** Today's timed tasks; those that overlap side by side, each in the first lane free at its start, a group as wide as its most lanes. */
	private blocksOf(file: MockFile, cards: Record<string, CardFace>): Block[] {
		const spans: { id: string; start: number; end: number }[] = [];
		for (const s of file.now) for (const t of s.tasks) {
			if (!t.slot || t.status === "x") continue;
			cards[t.id] = this.faceOf(t, dateOf(this.day()));
			spans.push({ id: t.id, start: t.slot.start, end: t.slot.end });
		}
		spans.sort((a, b) => a.start - b.start);
		const blocks: Block[] = [];
		let group: { id: string; start: number; end: number; lane: number }[] = [];
		const close = () => {
			const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
			for (const g of group) blocks.push({ id: g.id, start: g.start, end: g.end, lane: g.lane, lanes });
			group = [];
		};
		for (const span of spans) {
			if (group.length && span.start >= Math.max(...group.map((g) => g.end))) close();
			const busy = new Set(group.filter((g) => g.end > span.start).map((g) => g.lane));
			let lane = 0;
			while (busy.has(lane)) lane++;
			group.push({ ...span, lane });
		}
		close();
		return blocks;
	}

	private titleOf(dayOffset: number): string {
		if (dayOffset === 0) return "Today";
		if (dayOffset === 1) return "Tomorrow";
		if (dayOffset === -1) return "Yesterday";
		const date = addDays(this.day(), dayOffset);
		return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()].charAt(0)}${MONTHS[date.getMonth()].slice(1).toLowerCase()}`;
	}
}
