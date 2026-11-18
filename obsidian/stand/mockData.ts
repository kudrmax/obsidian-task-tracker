/**
 * The stand's made-up tasks (spec 2026-11-18, «Mock data»): about 300 tasks in memory with every case the screen draws:
 * sections and an empty one, nested subtasks, a description, tasks in progress, levels, due dates, timed tasks later today
 * (a long one, two that overlap, one already past), Backlog, Done. The same titles every time, so a scenario names the
 * tasks it means by their titles. Not the core: written for the stand only.
 */

export type ListKey = "inbox" | "now" | "soon" | "backlog" | "done";
export const LIST_KEYS: readonly ListKey[] = ["inbox", "now", "soon", "backlog", "done"];
export const LIST_NAMES: Readonly<Record<ListKey, string>> = { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" };

export interface MockTask {
	id: string;
	title: string;
	/** A level: p1 paints red, p2 orange. */
	level: "p1" | "p2" | null;
	status: " " | "/" | "x";
	/** `YYYY-MM-DD`. */
	due: string | null;
	/** A time today, minutes from the day's start. */
	slot: { start: number; end: number } | null;
	description: string | null;
	children: MockTask[];
}

export interface MockSection {
	id: string;
	/** Null: the tasks outside any section. */
	name: string | null;
	tasks: MockTask[];
}

export type MockFile = Record<ListKey, MockSection[]>;

/** The day starts at 5:00: before it, today is still yesterday's date. */
export const DAY_START_HOUR = 5;
const MINUTE_MS = 60_000;

const VERBS = ["Позвонить", "Написать", "Купить", "Проверить", "Разобрать", "Оплатить", "Отправить", "Подготовить", "Прочитать", "Обновить", "Записаться", "Починить", "Собрать", "Заказать", "Спланировать"];
const THINGS = ["отчёт", "билеты", "врачу", "маме", "счёт за свет", "заметки", "презентацию", "документы", "письмо Косте", "продукты", "велосипед", "план недели", "книгу", "расписание", "квартиру", "налоги", "доклад", "ревью PR", "лекцию", "подарок"];

const pad = (n: number) => String(n).padStart(2, "0");
export const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The day `clock` falls on, the day starting at 5:00. */
export function dayOf(clock: Date): Date {
	const shifted = new Date(clock.getTime() - DAY_START_HOUR * 60 * MINUTE_MS);
	return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

export function addDays(day: Date, days: number): Date {
	return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/** The minute from the day's start of `clock`. */
export function minuteOf(clock: Date): number {
	return Math.floor((clock.getTime() - dayOf(clock).getTime()) / MINUTE_MS) - DAY_START_HOUR * 60;
}

export function mockFile(clock: Date): MockFile {
	const day = dayOf(clock);
	const today = dateOf(day);
	let n = 0;
	let s = 0;
	let k = 0;
	const title = () => {
		n++;
		return `${VERBS[n % VERBS.length]} ${THINGS[(n * 7) % THINGS.length]} ${n}`;
	};
	const task = (name: string, more: Partial<MockTask> = {}): MockTask => ({ id: `t${++k}`, title: name, level: null, status: " ", due: null, slot: null, description: null, children: [], ...more });
	const section = (name: string | null, tasks: MockTask[]): MockSection => ({ id: `s${++s}`, name, tasks });

	const inbox = [section(null, Array.from({ length: 40 }, (_, i) => task(title(), { level: i % 11 === 0 ? "p1" : null }))), section("Идеи", Array.from({ length: 30 }, () => task(title())))];

	const nowTasks: MockTask[] = [
		task("Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки", { status: "/", due: today }),
		task("Задача с описанием", { due: today, description: "первая строка описания" }),
	];
	for (let i = 0; i < 28; i++) {
		const t = task(title(), { status: i % 9 === 0 ? "/" : " ", level: i % 7 === 0 ? "p2" : null, due: today });
		if (i % 10 === 3) t.children = [task(`шаг ${title()}`, { children: [task(`подшаг ${title()}`)] }), task(`шаг ${title()}`, { status: "x" }), task(`шаг ${title()}`)];
		nowTasks.push(t);
	}
	/** Timed today: one already past, then ahead of the clock a short one, a long one, two that overlap, two more. */
	const at = minuteOf(clock);
	const quarter = (m: number) => Math.ceil(m / 15) * 15;
	const timed: [number, number, string][] = [
		[quarter(at - 70) - at, 30, "Прошедшая по времени"],
		[30, 30, title()],
		[90, 120, "Длинный блок на два часа"],
		[240, 30, "Пересекается первая"],
		[255, 45, "Пересекается вторая"],
		[330, 15, title()],
	];
	for (const [offset, minutes, name] of timed) {
		const start = quarter(at + offset);
		if (start >= 0 && start + minutes <= 24 * 60) nowTasks.push(task(name, { due: today, slot: { start, end: start + minutes } }));
	}
	const now = [section(null, nowTasks), section("Вечер", Array.from({ length: 6 }, () => task(title(), { due: today })))];

	const soon = [
		section(null, Array.from({ length: 50 }, (_, i) => task(title(), { due: i % 3 === 0 ? dateOf(addDays(day, 1 + (i % 10))) : null }))),
		section("Поездка", Array.from({ length: 20 }, () => task(title()))),
		section("Пустая секция", []),
	];
	const backlog = [section(null, Array.from({ length: 80 }, () => task(title())))];
	const done = [section(null, Array.from({ length: 30 }, () => task(title(), { status: "x" })))];
	return { inbox, now, soon, backlog, done };
}

/** The file as a tasks file's text (docs/plugin/file.md): the checks' oracle reads it, never the screen's state. */
export function fileText(file: MockFile, clock: Date): string {
	const day = dayOf(clock);
	const time = (minute: number) => {
		const clockMinute = DAY_START_HOUR * 60 + minute;
		return `${pad(Math.floor(clockMinute / 60) % 24)}:${pad(clockMinute % 60)}`;
	};
	const line = (t: MockTask, depth: number): string[] => {
		const fields = [t.level ? `${t.level} ` : "", t.title, t.due ? ` 📅 ${t.due}` : "", t.slot ? ` 📌 ${dateOf(day)} ${time(t.slot.start)}-${time(t.slot.end)}` : ""].join("");
		const own = `${"\t".repeat(depth)}- [${t.status}] ${fields}`;
		const description = t.description ? [`${"\t".repeat(depth + 1)}- ${t.description}`] : [];
		return [own, ...description, ...t.children.flatMap((c) => line(c, depth + 1))];
	};
	const out: string[] = [];
	for (const key of LIST_KEYS) {
		out.push(`## ${LIST_NAMES[key]}`);
		for (const section of file[key]) {
			if (section.name !== null) out.push("", `### ${section.name}`);
			for (const t of section.tasks) out.push(...line(t, 0));
		}
		out.push("");
	}
	return out.join("\n");
}

/** The stand's first step (spec 2026-11-18, «Part 1, step by step»): one column of a dozen plain tasks, nothing else. */
export function oneColumnFile(): MockFile {
	const names = ["Купить молоко", "Позвонить маме", "Оплатить свет", "Записаться к врачу", "Прочитать книгу", "Починить велосипед", "Ответить Косте", "Собрать документы", "Заказать билеты", "Разобрать почту", "Полить цветы", "Спланировать неделю"];
	const tasks: MockTask[] = names.map((title, i) => ({ id: `c${i + 1}`, title, level: null, status: " ", due: null, slot: null, description: null, children: [] }));
	return { inbox: [{ id: "c-s1", name: null, tasks }], now: [{ id: "c-s2", name: null, tasks: [] }], soon: [{ id: "c-s3", name: null, tasks: [] }], backlog: [{ id: "c-s4", name: null, tasks: [] }], done: [{ id: "c-s5", name: null, tasks: [] }] };
}
