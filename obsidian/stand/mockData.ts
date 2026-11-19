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
	/** Open, in progress, done, won't do. */
	status: " " | "/" | "x" | "-";
	/** `YYYY-MM-DD`. */
	due: string | null;
	/** A time on its due day, minutes from the day's start; no end: no length. */
	slot: { start: number; end: number | null } | null;
	description: string | null;
	children: MockTask[];
	/** Its subtasks folded under its card. */
	folded?: boolean;
	/** Its project, written `🗂️ Name`. */
	project?: string;
	/** How a timed task reminds; none set: Live Activity, as a task first put on a time gets. */
	reminder?: "live" | "notification" | "alarm" | "none";
}

/** A calendar's event, every day at the same minutes from the day's start; `color` its calendar's. */
export interface MockEvent {
	id: string;
	title: string;
	start: number;
	end: number;
	color: string;
}

/** An all-day event, every day. */
export interface MockAllDay {
	id: string;
	title: string;
	color: string;
}

export interface MockSection {
	id: string;
	/** Null: the tasks outside any section. */
	name: string | null;
	tasks: MockTask[];
}

export type MockFile = Record<ListKey, MockSection[]> & { events: MockEvent[]; allDay: MockAllDay[] };

/** The made-up calendars' colours (the design's palette: work, Google, pink, green). */
export const CALENDAR_COLORS = { work: "#0A84FF", google: "#FF9F0A", pink: "#FF375F", green: "#30D158" } as const;

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
	const events: MockEvent[] = [
		{ id: "ev1", title: "Стендап", start: quarter(at - 150), end: quarter(at - 150) + 30, color: CALENDAR_COLORS.work },
		{ id: "ev2", title: "Встреча с дизайнером", start: quarter(at + 60), end: quarter(at + 60) + 60, color: CALENDAR_COLORS.google },
		{ id: "ev3", title: "Планирование квартала", start: quarter(at + 180), end: quarter(at + 180) + 90, color: CALENDAR_COLORS.work },
		{ id: "ev4", title: "Звонок с клиентом", start: quarter(at + 210), end: quarter(at + 210) + 30, color: CALENDAR_COLORS.pink },
		{ id: "ev5", title: "Синк с Олей", start: quarter(at + 225), end: quarter(at + 225) + 30, color: CALENDAR_COLORS.google },
	].filter((e) => e.start >= 0 && e.end <= 24 * 60);
	return { inbox, now, soon, backlog, done, events, allDay: [{ id: "ad1", title: "День рождения Кости", color: CALENDAR_COLORS.green }] };
}

const noEvents = (): Pick<MockFile, "events" | "allDay"> => ({ events: [], allDay: [] });

/** The made-up projects, the tree in its order: a subproject one deeper; a folder takes no task of its own. */
export const MOCK_PROJECTS: readonly { readonly name: string; readonly depth: number; readonly folder: boolean }[] = [
	{ name: "Дом", depth: 0, folder: false },
	{ name: "Ремонт", depth: 1, folder: false },
	{ name: "Работа", depth: 0, folder: true },
	{ name: "Отчёты", depth: 1, folder: false },
	{ name: "Отпуск", depth: 0, folder: false },
];

/** The file as a tasks file's text (docs/plugin/file.md): the checks' oracle reads it, never the screen's state. */
export function fileText(file: MockFile, clock: Date): string {
	const day = dayOf(clock);
	const time = (minute: number) => {
		const clockMinute = DAY_START_HOUR * 60 + minute;
		return `${pad(Math.floor(clockMinute / 60) % 24)}:${pad(clockMinute % 60)}`;
	};
	const line = (t: MockTask, depth: number): string[] => {
		const slot = (due: string, s: NonNullable<MockTask["slot"]>) => ` 📌 ${due} ${time(s.start)}${s.end === null ? "" : `-${time(s.end)}`}`;
		const fields = [t.level ? `${t.level} ` : "", t.title, t.due ? ` 📅 ${t.due}` : "", t.slot ? slot(t.due ?? dateOf(day), t.slot) : "", t.project ? ` 🗂️ ${t.project}` : "", t.folded ? " 📁" : ""].join("");
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
	return { inbox: [{ id: "c-s1", name: null, tasks }], now: [{ id: "c-s2", name: null, tasks: [] }], soon: [{ id: "c-s3", name: null, tasks: [] }], backlog: [{ id: "c-s4", name: null, tasks: [] }], done: [{ id: "c-s5", name: null, tasks: [] }], ...noEvents() };
}

/** The stand's second step: two columns, Inbox and Soon, of plain tasks, to carry tasks between them. */
export function twoColumnsFile(): MockFile {
	const file = oneColumnFile();
	const names = ["Купить подарок", "Сдать отчёт", "Написать письмо", "Забрать посылку", "Обновить резюме", "Сходить в зал", "Убрать балкон", "Записать идеи"];
	file.soon[0].tasks = names.map((title, i) => ({ id: `d${i + 1}`, title, level: null, status: " ", due: null, slot: null, description: null, children: [] }));
	return file;
}

/** The stand's subtasks step: the two columns, with tasks that have subtasks (one level and two) in both. */
export function subtasksFile(): MockFile {
	const file = twoColumnsFile();
	const plain = (id: string, title: string, children: MockTask[] = []): MockTask => ({ id, title, level: null, status: " ", due: null, slot: null, description: null, children });
	file.inbox[0].tasks.splice(3, 0, plain("e1", "Спланировать отпуск", [plain("e2", "Выбрать даты"), plain("e3", "Купить билеты", [plain("e4", "Сравнить цены")]), plain("e5", "Забронировать отель")]));
	file.soon[0].tasks.splice(2, 0, plain("f1", "Переезд", [plain("f2", "Найти грузчиков"), plain("f3", "Упаковать книги")]));
	return file;
}

/** The stand's sections step: the subtasks step, with sections in both columns and an empty one. */
export function sectionsFile(): MockFile {
	const file = subtasksFile();
	const take = (from: MockTask[], n: number) => from.splice(from.length - n, n);
	file.inbox.push({ id: "s-ideas", name: "Идеи", tasks: take(file.inbox[0].tasks, 4) }, { id: "s-empty", name: "Пустая секция", tasks: [] });
	file.soon.push({ id: "s-trip", name: "Поездка", tasks: take(file.soon[0].tasks, 3) });
	return file;
}

/**
 * The stand's calendar step: Soon, today's list and today's calendar. A dozen plain tasks in Soon and in today's list; on
 * today's calendar, from the hour after the present one: blocks with a length (two of them overlapping), tasks without a
 * length (one standing close under a block, so they stack; one starting on a long block's body), a folded task named by
 * its next step; one task whose time has passed, riding the now line; events (one over, a dense evening of three overlapping, one under a
 * task) and an all-day event. All within the day.
 */
export function calendarFile(clock: Date): MockFile {
	const file = oneColumnFile();
	const today = dateOf(dayOf(clock));
	const plain = (id: string, title: string, due: string | null, slot: MockTask["slot"] = null, children: MockTask[] = []): MockTask => ({ id, title, level: null, status: " ", due, slot, description: null, children });
	file.soon[0].tasks = ["Купить подарок", "Сдать отчёт", "Написать письмо", "Забрать посылку", "Обновить резюме", "Сходить в зал"].map((title, i) => plain(`g${i + 1}`, title, null));
	file.inbox[0].tasks = [];
	/**
	 * The blocks start an hour after the present hour and spread over the next eight. Late in the stand's day (it starts at
	 * 05:00, so 00:12 is its twentieth hour) there are fewer hours left: the plan draws closer together, down to a quarter of
	 * its spread, so it stands ahead of the now line as far as the day lets it, never past the day's end.
	 */
	const hour = Math.max(0, Math.floor(minuteOf(clock) / 60) * 60);
	const DAY = 24 * 60;
	const spread = Math.min(1, Math.max(0.25, (DAY - hour - 60 - 30) / 480));
	const ahead = (offset: number, length = 30) => Math.min(hour + 60 + Math.round(((offset - 60) * spread) / 5) * 5, DAY - length);
	const blocks: [string, number, number | null][] = [
		["Созвон с командой", ahead(60), 30],
		["Заметки к созвону", ahead(65), null],
		["Обед", ahead(120, 60), 60],
		["Позвонить в банк", ahead(150), null],
		["Ревью дизайна", ahead(240, 60), 60],
		["Звонок врачу", ahead(270), 30],
		["Тренировка", ahead(360, 90), 90],
	];
	const folded = plain("k8", "Переезд", today, { start: ahead(480), end: null }, [{ ...plain("k9", "Найти грузчиков", null), status: "x" }, plain("k10", "Упаковать книги", null), plain("k11", "Заказать машину", null)]);
	folded.folded = true;
	const late = Math.max(0, hour - 45);
	file.now[0].tasks = [
		...["Разобрать почту", "Полить цветы", "Ответить Косте", "Оплатить свет", "Купить молоко", "Позвонить маме"].map((title, i) => plain(`h${i + 1}`, title, today)),
		...blocks.map(([title, start, length], i) => ({ ...plain(`k${i + 1}`, title, today, { start, end: length === null ? null : start + length }), description: title === "Тренировка" ? "разминка, потом зал" : null })),
		folded,
		...(late < minuteOf(clock) ? [plain("k12", "Прошедшая по времени", today, { start: late, end: late + 30 })] : []),
	];
	file.events = [
		{ id: "ev1", title: "Стендап", start: Math.max(0, hour - 120), end: Math.max(0, hour - 120) + 30, color: CALENDAR_COLORS.work },
		{ id: "ev2", title: "Встреча с дизайнером", start: ahead(330, 60), end: ahead(330, 60) + 60, color: CALENDAR_COLORS.google },
		{ id: "ev3", title: "Планирование квартала", start: ahead(420, 90), end: ahead(420, 90) + 90, color: CALENDAR_COLORS.work },
		{ id: "ev4", title: "Звонок с клиентом", start: ahead(450), end: ahead(450) + 30, color: CALENDAR_COLORS.pink },
		{ id: "ev5", title: "Синк с Олей", start: ahead(465), end: ahead(465) + 30, color: CALENDAR_COLORS.google },
	].filter((e) => e.end <= DAY);
	file.allDay = [{ id: "ad1", title: "День рождения Кости", color: CALENDAR_COLORS.green }];
	return file;
}

/** The stand's long lists step: the two columns with a hundred plain tasks in Inbox and sixty in Soon, so lists scroll under a carried card. */
export function longListsFile(): MockFile {
	const file = oneColumnFile();
	const plain = (id: string, title: string): MockTask => ({ id, title, level: null, status: " ", due: null, slot: null, description: null, children: [] });
	file.inbox[0].tasks = Array.from({ length: 100 }, (_, i) => plain(`l${i + 1}`, `Задача ${i + 1}`));
	file.soon[0].tasks = Array.from({ length: 60 }, (_, i) => plain(`m${i + 1}`, `Скоро ${i + 1}`));
	return file;
}
