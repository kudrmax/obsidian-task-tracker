import { readFileSync, writeFileSync } from "node:fs";

/**
 * A tasks file of about 300 tasks in the format of docs/plugin/file.md, its dates around today: Inbox with sections,
 * Now with sections, subtasks (one folded), a description, tasks in progress, priorities, projects and links, slots later
 * today and earlier today (riding the now line), Soon with dates and an empty section, Backlog, Done. Deterministic for a
 * day: the same titles every run, so a scenario names the tasks it means by their titles.
 */

const VERBS = ["Позвонить", "Написать", "Купить", "Проверить", "Разобрать", "Оплатить", "Отправить", "Подготовить", "Прочитать", "Обновить", "Записаться", "Починить", "Собрать", "Заказать", "Спланировать"];
const THINGS = ["отчёт", "билеты", "врачу", "маме", "счёт за свет", "заметки", "презентацию", "документы", "письмо Косте", "продукты", "велосипед", "план недели", "книгу", "расписание", "квартиру", "налоги", "доклад", "ревью PR", "лекцию", "подарок"];

const pad = (n) => String(n).padStart(2, "0");

/** A local date `days` after `today`, as the file writes it. */
export function dayAfter(today, days) {
	const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const hm = (minute) => `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;

/** The plugin's day starts at 5:00 by default: before it, today is still yesterday's date. */
const DAY_START_HOUR = 5;

/** The plugin's today at `now`: the date of the day that began at the day's start hour. */
export function pluginToday(now = new Date()) {
	return new Date(now.getTime() - DAY_START_HOUR * 3600_000);
}

export function generateTasks(clock = new Date()) {
	const now = pluginToday(clock);
	let n = 0;
	const title = () => {
		n++;
		return `${VERBS[n % VERBS.length]} ${THINGS[(n * 7) % THINGS.length]} ${n}`;
	};
	const today = dayAfter(now, 0);
	const lines = [];
	const add = (...more) => lines.push(...more);

	add("## Inbox");
	for (let i = 0; i < 40; i++) add(`- [ ] ${i % 11 === 0 ? "p1 " : ""}${title()}${i % 9 === 4 ? " 🗂️ Дом" : ""}`);
	add("", "### Идеи");
	for (let i = 0; i < 30; i++) add(`- [ ] ${title()}`);

	add("", "## Projects", "- Дом [[Заметка о доме]]", "- Работа", "\t- Отчёты", "");

	add("## Now");
	add(`- [/] Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки 📅 ${today}`);
	add(`- [ ] Задача со ссылкой на [[Заметка о доме]] и https://example.com 📅 ${today}`);
	add(`- [ ] Свёрнутая задача с шагами 📅 ${today} 📁`, "\t- [ ] Первый шаг свёрнутой", "\t- [ ] Второй шаг свёрнутой");
	add(`- [ ] Задача с описанием 📅 ${today}`, "\t- первая строка описания");
	for (let i = 0; i < 28; i++) {
		add(`- [${i % 9 === 0 ? "/" : " "}] ${i % 7 === 0 ? "p2 " : ""}${title()}${i % 6 === 2 ? " 🗂️ Работа" : ""} 📅 ${today}`);
		if (i % 10 === 3) add(`\t- [ ] шаг ${title()}`, `\t\t- [ ] подшаг ${title()}`, `\t- [x] шаг ${title()}`, `\t- [ ] шаг ${title()}`);
	}
	/** Later today, ahead of the clock (a slot is written in its own date and clock time), until the day ends at the next day's start. */
	const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, DAY_START_HOUR).getTime();
	const first = Math.ceil((clock.getTime() + 30 * 60_000) / (15 * 60_000)) * 15 * 60_000;
	/** One whose time has passed today: it rides the now line. */
	const past = new Date(Math.floor((clock.getTime() - 70 * 60_000) / (15 * 60_000)) * 15 * 60_000);
	const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_START_HOUR).getTime();
	if (past.getTime() >= dayStart) add(`- [ ] Прошедшая по времени 📅 ${today} 📌 ${dayAfter(past, 0)} ${hm(past.getHours() * 60 + past.getMinutes())}-${hm(past.getHours() * 60 + past.getMinutes() + 30)}`);
	for (let i = 0; i < 8; i++) {
		const start = new Date(first + i * 45 * 60_000);
		const end = new Date(start.getTime() + (i % 2 ? 15 : 30) * 60_000);
		if (end.getTime() > dayEnd || end.getDate() !== start.getDate()) break;
		add(`- [ ] ${title()} 📅 ${today} 📌 ${dayAfter(start, 0)} ${hm(start.getHours() * 60 + start.getMinutes())}-${hm(end.getHours() * 60 + end.getMinutes())}`);
	}
	add("", "### Вечер");
	for (let i = 0; i < 6; i++) add(`- [ ] ${title()} 📅 ${today}`);

	add("", "## Soon");
	for (let i = 0; i < 50; i++) add(`- [ ] ${title()}${i % 3 === 0 ? ` 📅 ${dayAfter(now, 1 + (i % 10))}` : ""}${i % 13 === 0 ? " 🗂️ Работа" : ""}${i % 15 === 0 ? " 🔁 every day" : ""}`);
	add("", "### Поездка");
	for (let i = 0; i < 20; i++) add(`- [ ] ${title()}`);
	add("", "### Пустая секция");

	add("", "## Backlog");
	for (let i = 0; i < 80; i++) add(`- [ ] ${title()}`);

	add("", "## Done");
	for (let i = 0; i < 30; i++) add(`- [x] ${title()}`);
	return { text: lines.join("\n") + "\n", tasks: n };
}

export function writeTasks(path, clock = new Date()) {
	const { text, tasks } = generateTasks(clock);
	writeFileSync(path, text);
	return tasks;
}

export const readTasks = (path) => readFileSync(path, "utf8");
