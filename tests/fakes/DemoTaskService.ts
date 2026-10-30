import { type DayView, type Placement, type SectionKey, StaleTaskError, type TaskDraft, type TaskItem, type TaskKey, type TaskService } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import { DEFAULT_SETTINGS } from "../../src/settings";
import type { LocalDate, Slot, TaskStatus } from "../../src/ui/types";

interface DemoTask {
	text: string;
	status: TaskStatus;
	dueDate: LocalDate | null;
	slot: Slot | null;
	priority: string | null;
}

const DEMO_DATE = "2026-10-30";
const STATUS_CHAR: Record<TaskStatus, string> = { todo: " ", inProgress: "/", done: "x", cancelled: "-" };

const task = (text: string, extra: Partial<DemoTask> = {}): DemoTask => ({ text, status: "todo", dueDate: null, slot: null, priority: null, ...extra });
const slot = (start: number, end: number | null = null): Slot => ({ date: DEMO_DATE, start: start * 60, end: end === null ? null : end * 60 });

const two = (n: number) => String(n).padStart(2, "0");
const time = (m: number) => `${two(Math.floor(m / 60))}:${two(m % 60)}`;
const localDateOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** The board's tasks, in memory: the same seven on the list, four on the timeline, eight in Soon, six in Inbox. */
export class DemoTaskService implements TaskService {
	private sections: Record<SectionKey, DemoTask[]> = {
		inbox: [
			task("Узнать про курсы итальянского"),
			task("Идея подарка на Новый год"),
			task("Ответить Лёше про поход"),
			task("Посмотреть «Дюну 2»"),
			task("Почитать про налоговое резидентство"),
			task("Сменить тариф мобильной связи"),
		],
		now: [
			task("Созвониться с врачом"),
			task("Купить билеты в Белград", { dueDate: "2026-11-03" }),
			task("Сдать налоговую декларацию", { dueDate: "2026-10-30" }),
			task("Записаться в барбершоп", { status: "inProgress", dueDate: "2026-11-02" }),
			task("Посмотреть доклад про local-first приложения", { status: "inProgress" }),
			task("Чай масала"),
			task("Позвонить маме"),
			task("Написать отчёт по проекту", { status: "inProgress", slot: slot(11, 12) }),
			task("Разобрать почту", { slot: slot(14) }),
			task("Подготовить вопросы к планированию", { slot: slot(16) }),
			task("Заказать продукты", { slot: slot(17) }),
		],
		soon: [
			task("Продлить страховку"),
			task("Купить подарок Ане"),
			task("Разобрать фото с поездки", { status: "inProgress" }),
			task("Записаться к стоматологу"),
			task("Починить велосипед"),
			task("Прочитать Deep Work"),
			task("Заменить фильтр для воды"),
			task("Настроить бэкап ноутбука"),
		],
		done: [],
	};
	private readonly day = this.sections.now.filter((t) => t.slot);
	private exists = true;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly clock: Clock) {}

	/** The timeline boards lay tasks of their own on the day; the pixel comparison swaps them in, and null brings the day's back. */
	showTimeline(tasks: readonly { text: string; start: number; end: number | null; inProgress?: boolean }[] | null): void {
		const slotted = tasks?.map((t) => task(t.text, { status: t.inProgress ? "inProgress" : "todo", slot: { date: DEMO_DATE, start: t.start, end: t.end } })) ?? this.day;
		this.sections.now = [...this.sections.now.filter((t) => !t.slot), ...slotted];
		this.changed();
	}

	private today(): LocalDate {
		return localDateOf(this.clock.now());
	}

	private raw(t: DemoTask): string {
		const due = t.dueDate ? ` 📅 ${t.dueDate}` : "";
		const s = t.slot ? ` ⏰ ${t.slot.date} ${time(t.slot.start)}${t.slot.end === null ? "" : `-${time(t.slot.end)}`}` : "";
		return `- [${STATUS_CHAR[t.status]}] ${t.priority ? `${t.priority} ` : ""}${t.text}${due}${s}`;
	}

	private item(section: SectionKey, index: number): TaskItem {
		const t = this.sections[section][index];
		return { key: { section, index, raw: this.raw(t) }, text: t.text, status: t.status, dueDate: t.dueDate, slot: t.slot, priority: DEFAULT_SETTINGS.priorities.find((l) => l.prefix === t.priority) ?? null };
	}

	private items(section: SectionKey): TaskItem[] {
		return this.sections[section].map((_, i) => this.item(section, i));
	}

	private find(key: TaskKey): DemoTask {
		const t = this.sections[key.section][key.index];
		if (!t || this.raw(t) !== key.raw) throw new StaleTaskError();
		return t;
	}

	private take(key: TaskKey): DemoTask {
		const t = this.find(key);
		this.sections[key.section].splice(key.index, 1);
		return t;
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}

	async dayView(date: LocalDate): Promise<DayView> {
		const all = [...this.items("now"), ...this.items("soon")];
		const slottedOn = (t: TaskItem) => t.slot?.date === date;
		const list = date === this.today()
			? all.filter((t) => !slottedOn(t) && (t.key.section === "now" || t.dueDate === date))
			: all.filter((t) => !slottedOn(t) && t.dueDate === date);
		return { date, list, slotted: all.filter(slottedOn) };
	}

	async soonView(): Promise<readonly TaskItem[]> {
		return this.items("soon").filter((t) => !t.dueDate && !t.slot);
	}

	async inboxView(): Promise<readonly TaskItem[]> {
		return this.items("inbox");
	}

	async createInList(date: LocalDate, text: string): Promise<void> {
		if (!text.trim()) return;
		if (date === this.today()) this.sections.now.push(task(text.trim()));
		else this.sections.soon.push(task(text.trim(), { dueDate: date }));
		this.changed();
	}

	async createInSoon(text: string): Promise<void> {
		if (!text.trim()) return;
		this.sections.soon.push(task(text.trim()));
		this.changed();
	}

	async createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		if (!text.trim()) return;
		this.sections[date === this.today() ? "now" : "soon"].push(task(text.trim(), { slot: { date, start, end: null } }));
		this.changed();
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox") return { kind: "inbox" };
		return { kind: item.key.section === "soon" ? "soon" : "now" };
	}

	private place(t: DemoTask, placement: Placement): void {
		if (placement.kind === "date") {
			t.dueDate = placement.date;
			this.sections[placement.date <= this.today() ? "now" : "soon"].push(t);
		} else {
			t.dueDate = null;
			if (placement.kind === "inbox") t.slot = null;
			this.sections[placement.kind].push(t);
		}
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (!draft.text.trim()) return;
		this.place(task(draft.text.trim(), { slot: slot ?? null, priority: draft.priority }), draft.placement);
		this.changed();
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<void> {
		const t = this.find(key);
		t.text = draft.text.trim() || t.text;
		t.priority = draft.priority;
		const current = this.placementOf(this.item(key.section, key.index));
		if (JSON.stringify(current) !== JSON.stringify(draft.placement)) this.place(this.take(key), draft.placement);
		this.changed();
	}

	async setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		if (status === "done" || status === "cancelled") {
			const t = this.take(key);
			t.status = status;
			this.sections.done.unshift(t);
		} else this.find(key).status = status;
		this.changed();
	}

	async setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		this.find(key).dueDate = date;
		this.changed();
	}

	async setPriority(key: TaskKey, priority: string | null): Promise<void> {
		this.find(key).priority = priority;
		this.changed();
	}

	async rename(key: TaskKey, text: string): Promise<void> {
		this.find(key).text = text;
		this.changed();
	}

	async remove(key: TaskKey): Promise<void> {
		this.take(key);
		this.changed();
	}

	async moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void> {
		if (before) this.find(before);
		const t = this.take(key);
		if (!before) this.sections[date === this.today() ? "now" : "soon"].push(t);
		else {
			const shift = before.section === key.section && before.index > key.index ? 1 : 0;
			this.sections[before.section].splice(before.index - shift, 0, t);
		}
		this.changed();
	}

	async setSlot(key: TaskKey, slot: Slot): Promise<void> {
		const t = this.find(key);
		t.slot = slot;
		if (key.section === "now" && slot.date !== this.today()) {
			this.sections.now.splice(key.index, 1);
			this.sections.soon.push(t);
		}
		this.changed();
	}

	async clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void> {
		const t = this.find(key);
		if (place) await this.moveBefore(key, place.before, place.date);
		t.slot = null;
		this.changed();
	}

	async moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		if (date === this.today()) this.sections.now.push(this.take(key));
		else this.find(key).dueDate = date;
		this.changed();
	}

	async moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		if (date === this.today()) this.sections.soon.push(this.take(key));
		else this.find(key).dueDate = null;
		this.changed();
	}

	async postpone(key: TaskKey, date: LocalDate): Promise<void> {
		const t = this.take(key);
		t.dueDate = date;
		t.slot = null;
		this.sections[date <= this.today() ? "now" : "soon"].push(t);
		this.changed();
	}

	async moveToEnd(key: TaskKey, section: "inbox" | "soon"): Promise<void> {
		const t = this.take(key);
		if (section === "inbox") {
			t.dueDate = null;
			t.slot = null;
		}
		this.sections[section].push(t);
		this.changed();
	}

	async normalize(): Promise<void> {}

	async createFile(): Promise<void> {
		this.exists = true;
		this.changed();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get fileExists(): boolean {
		return this.exists;
	}
}
