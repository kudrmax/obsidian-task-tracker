/**
 * The stand's made-up tasks (spec 2026-11-18, «MockPort»): a tree in memory with every case the screen draws, and the
 * simplest product rules that make each appear. Not the core: written for the stand.
 */

export type ListKey = "inbox" | "now" | "soon" | "backlog" | "done";

export interface MockTask {
	id: string;
	title: string;
	status: " " | "/" | "x";
	/** A colour of a level (p1 red, p2 orange); null for none. */
	priority: "p1" | "p2" | null;
	/** A due date, `YYYY-MM-DD`. */
	due: string | null;
	/** A time today: minutes from the day's start, the end null for no duration. */
	slot: { start: number; end: number | null } | null;
	project: string | null;
	folded: boolean;
	description: string | null;
	repeats: boolean;
	children: MockTask[];
}

export interface MockSection {
	id: string;
	/** Null: the tasks outside any section. */
	name: string | null;
	tasks: MockTask[];
}

export interface MockList {
	sections: MockSection[];
}

export type MockFile = Record<ListKey, MockList>;

export const LIST_NAMES: Readonly<Record<ListKey, string>> = { inbox: "Inbox", now: "Now", soon: "Soon", backlog: "Backlog", done: "Done" };

/** The projects' tree: a project, its subproject, a folder. */
export const PROJECTS = [
	{ name: "Дом", parent: null, note: "Заметка о доме" },
	{ name: "Кухня", parent: "Дом", note: null },
	{ name: "Работа", parent: null, note: null },
	{ name: "Отчёты", parent: "Работа", note: null },
	{ name: "Архив", parent: null, note: null, folder: true },
	{ name: "Старое", parent: "Архив", note: null },
] as const;

export const PROJECT_NOTE = "Заметка о доме";

/** The day starts at 5:00: a time is minutes from then. */
export const DAY_START_HOUR = 5;
const MINUTE = 60_000;

const VERBS = ["Позвонить", "Написать", "Купить", "Проверить", "Разобрать", "Оплатить", "Отправить", "Подготовить", "Прочитать", "Обновить", "Записаться", "Починить", "Собрать", "Заказать", "Спланировать"];
const THINGS = ["отчёт", "билеты", "врачу", "маме", "счёт за свет", "заметки", "презентацию", "документы", "письмо Косте", "продукты", "велосипед", "план недели", "книгу", "расписание", "квартиру", "налоги", "доклад", "ревью PR", "лекцию", "подарок"];

const pad = (n: number) => String(n).padStart(2, "0");
export const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (date: string, days: number) => {
	const [y, m, d] = date.split("-").map(Number);
	return dateOf(new Date(y, m - 1, d + days));
};

/** Today at `clock`: the date of the day that began at the day's start hour. */
export function todayAt(clock: Date): string {
	return dateOf(new Date(clock.getTime() - DAY_START_HOUR * 60 * MINUTE));
}

/** Minutes from today's start at `clock`. */
export function minuteAt(clock: Date): number {
	const day = new Date(clock.getTime() - DAY_START_HOUR * 60 * MINUTE);
	return day.getHours() * 60 + day.getMinutes();
}

/** About 300 made-up tasks around `clock`, the same titles for the same day. */
export function mockFile(clock: Date): MockFile {
	const today = todayAt(clock);
	let n = 0;
	let ids = 0;
	const title = () => {
		n++;
		return `${VERBS[n % VERBS.length]} ${THINGS[(n * 7) % THINGS.length]} ${n}`;
	};
	const task = (name: string, patch: Partial<MockTask> = {}): MockTask => ({ id: `m${++ids}`, title: name, status: " ", priority: null, due: null, slot: null, project: null, folded: false, description: null, repeats: false, children: [], ...patch });
	const section = (name: string | null, tasks: MockTask[]): MockSection => ({ id: `s${++ids}`, name, tasks });
	const many = (count: number, make: (i: number) => MockTask) => Array.from({ length: count }, (_, i) => make(i));

	const inbox = [
		section(null, many(40, (i) => task(title(), { priority: i % 11 === 0 ? "p1" : null, project: i % 9 === 4 ? "Дом" : i === 6 ? "Кухня" : null }))),
		section("Идеи", many(30, () => task(title()))),
	];
	const nowTasks: MockTask[] = [
		task("Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки", { status: "/", due: today }),
		task(`Задача со ссылкой на [[${PROJECT_NOTE}]] и https://example.com`, { due: today }),
		task("Свёрнутая задача с шагами", { due: today, folded: true, children: [task("Первый шаг свёрнутой"), task("Второй шаг свёрнутой")] }),
		task("Задача с описанием", { due: today, description: "первая строка описания" }),
	];
	for (let i = 0; i < 28; i++) {
		const t = task(title(), { status: i % 9 === 0 ? "/" : " ", priority: i % 7 === 0 ? "p2" : null, project: i % 6 === 2 ? "Работа" : null, due: today });
		if (i % 10 === 3) t.children = [task(`шаг ${title()}`, { children: [task(`подшаг ${title()}`)] }), task(`шаг ${title()}`, { status: "x" }), task(`шаг ${title()}`)];
		nowTasks.push(t);
	}
	/** Timed today: one already past (it rides the now line), then ahead of the clock a short, a long and two that overlap. */
	const at = minuteAt(clock);
	if (at >= 70) nowTasks.push(task("Прошедшая по времени", { due: today, slot: { start: Math.floor((at - 70) / 15) * 15, end: Math.floor((at - 70) / 15) * 15 + 30 } }));
	const first = Math.ceil((at + 30) / 15) * 15;
	for (const [offset, minutes, name] of [[0, 30, title()], [60, 120, "Длинный блок на два часа"], [210, 30, "Пересекается первая"], [225, 45, "Пересекается вторая"], [300, 15, title()], [345, 30, title()]] as const) {
		const start = first + offset;
		if (start + minutes <= 24 * 60) nowTasks.push(task(name, { due: today, slot: { start, end: start + minutes } }));
	}
	const now = [section(null, nowTasks), section("Вечер", many(6, () => task(title(), { due: today })))];
	const soon = [
		section(null, many(50, (i) => task(title(), { due: i % 3 === 0 ? addDays(today, 1 + (i % 10)) : null, project: i % 13 === 0 ? "Работа" : null, repeats: i % 15 === 0 }))),
		section("Поездка", many(20, () => task(title()))),
		section("Пустая секция", []),
	];
	const backlog = [section(null, many(80, (i) => task(title(), { project: i === 3 ? "Старое" : null })))];
	const done = [section(null, many(30, () => task(title(), { status: "x" })))];
	return { inbox: { sections: inbox }, now: { sections: now }, soon: { sections: soon }, backlog: { sections: backlog }, done: { sections: done } };
}

const LINE_ORDER: readonly ListKey[] = ["inbox", "now", "soon", "backlog", "done"];

/** The tasks as a tasks file reads (docs/plugin/file.md): what the checks read as the user's truth. */
export function fileText(file: MockFile, today: string): string {
	const lines: string[] = [];
	const clock = (minute: number) => {
		const at = (DAY_START_HOUR * 60 + minute) % (24 * 60);
		return `${pad(Math.floor(at / 60))}:${pad(at % 60)}`;
	};
	const slotDate = (minute: number) => (DAY_START_HOUR * 60 + minute >= 24 * 60 ? addDays(today, 1) : today);
	const write = (t: MockTask, depth: number) => {
		const fields = [t.due ? `📅 ${t.due}` : "", t.slot ? `📌 ${slotDate(t.slot.start)} ${clock(t.slot.start)}${t.slot.end === null ? "" : `-${clock(t.slot.end)}`}` : "", t.repeats ? "🔁 every day" : "", t.project ? `🗂️ ${t.project}` : "", t.folded ? "📁" : ""].filter(Boolean);
		lines.push(`${"\t".repeat(depth)}- [${t.status}] ${t.priority ? `${t.priority} ` : ""}${t.title}${fields.length ? ` ${fields.join(" ")}` : ""}`);
		if (t.description) lines.push(`${"\t".repeat(depth + 1)}- ${t.description}`);
		for (const child of t.children) write(child, depth + 1);
	};
	for (const key of LINE_ORDER) {
		lines.push(`## ${LIST_NAMES[key]}`);
		for (const s of file[key].sections) {
			if (s.name !== null) lines.push("", `### ${s.name}`);
			for (const t of s.tasks) write(t, 0);
		}
		lines.push("");
		if (key === "inbox") {
			lines.push("## Projects");
			for (const p of PROJECTS) lines.push(`${p.parent ? "\t" : ""}- ${p.name}${p.note ? ` [[${p.note}]]` : ""}${"folder" in p ? " 🗃️" : ""}`);
			lines.push("");
		}
	}
	return `${lines.join("\n")}\n`;
}
