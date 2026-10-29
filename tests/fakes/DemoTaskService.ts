import { type DayView, type SectionKey, StaleTaskError, type TaskItem, type TaskKey, type TaskService } from "../../src/application/contracts";
import type { Clock } from "../../src/application/ports";
import type { LocalDate, Slot, TaskStatus } from "../../src/ui/types";

interface DemoTask {
	text: string;
	status: TaskStatus;
	dueDate: LocalDate | null;
	slot: Slot | null;
}

const DEMO_DATE = "2026-10-30";
const DEFAULT_MINUTES = 60;
const MINUTES_PER_DAY = 1440;
const STATUS_CHAR: Record<TaskStatus, string> = { todo: " ", inProgress: "/", done: "x", cancelled: "-" };

const task = (text: string, extra: Partial<DemoTask> = {}): DemoTask => ({ text, status: "todo", dueDate: null, slot: null, ...extra });
const slot = (start: number, end: number): Slot => ({ date: DEMO_DATE, start: start * 60, end: end * 60 });

const two = (n: number) => String(n).padStart(2, "0");
const time = (m: number) => `${two(Math.floor(m / 60))}:${two(m % 60)}`;
const localDateOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** The board's tasks, in memory: the same seven on the list, three on the timeline, eight in Soon. */
export class DemoTaskService implements TaskService {
	private sections: Record<SectionKey, DemoTask[]> = {
		now: [
			task("Созвониться с врачом"),
			task("Купить билеты в Белград", { dueDate: "2026-11-03" }),
			task("Сдать налоговую декларацию", { dueDate: "2026-10-30" }),
			task("Записаться в барбершоп", { status: "inProgress", dueDate: "2026-11-02" }),
			task("Посмотреть доклад про local-first приложения", { status: "inProgress" }),
			task("Чай масала"),
			task("Позвонить маме"),
			task("Написать отчёт по проекту", { status: "inProgress", slot: slot(11, 12) }),
			task("Разобрать почту", { slot: slot(14, 15) }),
			task("Заказать продукты", { slot: slot(17, 17.5) }),
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
	private exists = true;
	private readonly listeners = new Set<() => void>();

	constructor(private readonly clock: Clock) {}

	private today(): LocalDate {
		return localDateOf(this.clock.now());
	}

	private raw(t: DemoTask): string {
		const due = t.dueDate ? ` 📅 ${t.dueDate}` : "";
		const s = t.slot ? ` ⏰ ${t.slot.date} ${time(t.slot.start)}-${time(t.slot.end)}` : "";
		return `- [${STATUS_CHAR[t.status]}] ${t.text}${due}${s}`;
	}

	private item(section: SectionKey, index: number): TaskItem {
		const t = this.sections[section][index];
		return { key: { section, index, raw: this.raw(t) }, text: t.text, status: t.status, dueDate: t.dueDate, slot: t.slot };
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
		const end = Math.min(MINUTES_PER_DAY, start + DEFAULT_MINUTES);
		this.sections[date === this.today() ? "now" : "soon"].push(task(text.trim(), { slot: { date, start, end } }));
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

	async clearSlot(key: TaskKey): Promise<void> {
		this.find(key).slot = null;
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
