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

export function generateTasks(now = new Date()) {
	let n = 0;
	const title = () => {
		n++;
		return `${VERBS[n % VERBS.length]} ${THINGS[(n * 7) % THINGS.length]} ${n}`;
	};
	const today = dayAfter(now, 0);
	const lines = [];
	const add = (line) => lines.push(line);

	add("## Inbox");
	for (let i = 0; i < 40; i++) add(`- [ ] ${i % 11 === 0 ? "p1 " : ""}${title()}${i % 9 === 4 ? " 🗂️ Дом" : ""}`);
	add("", "### Идеи");
	for (let i = 0; i < 30; i++) add(`- [ ] ${title()}`);

	add("", "## Projects", "- Дом", "- Работа", "\t- Отчёты", "");

	add("## Now");
	add(`- [/] Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки 📅 ${today}`);
	add(`- [ ] Задача со ссылкой на [[Заметка о доме]] и https://example.com 📅 ${today}`);
	add(`- [ ] Свёрнутая задача с шагами 📅 ${today} 📁`, "\t- [ ] Первый шаг свёрнутой", "\t- [ ] Второй шаг свёрнутой");
	add(`- [ ] Задача с описанием 📅 ${today}`, "\t- первая строка описания");
	for (let i = 0; i < 28; i++) {
		add(`- [${i % 9 === 0 ? "/" : " "}] ${i % 7 === 0 ? "p2 " : ""}${title()}${i % 6 === 2 ? " 🗂️ Работа" : ""} 📅 ${today}`);
		if (i % 10 === 3) add(`\t- [ ] шаг ${title()}`, `\t\t- [ ] подшаг ${title()}`, `\t- [x] шаг ${title()}`, `\t- [ ] шаг ${title()}`);
	}
	/** Later today, ahead of the clock, and two that have passed: those ride the now line. */
	const minute = now.getHours() * 60 + now.getMinutes();
	const base = Math.ceil((minute + 30) / 15) * 15;
	for (let i = 0; i < 8; i++) {
		const start = base + i * 45;
		if (start + 30 >= 24 * 60) break;
		add(`- [ ] ${title()} 📅 ${today} 📌 ${today} ${hm(start)}-${hm(start + (i % 2 ? 15 : 30))}`);
	}
	add("", "### Вечер");
	for (let i = 0; i < 6; i++) add(`- [ ] ${title()} 📅 ${today}`);

	add("", "## Soon");
	for (let i = 0; i < 50; i++) add(`- [ ] ${title()}${i % 3 === 0 ? ` 📅 ${dayAfter(now, 1 + (i % 10))}` : ""}${i % 13 === 0 ? " 🗂️ Работа" : ""}${i % 17 === 5 ? " 🔁 every week" : ""}`);
	add("", "### Поездка");
	for (let i = 0; i < 20; i++) add(`- [ ] ${title()}`);
	add("", "### Пустая секция");

	add("", "## Backlog");
	for (let i = 0; i < 80; i++) add(`- [ ] ${title()}`);

	add("", "## Done");
	for (let i = 0; i < 30; i++) add(`- [x] ${title()}`);
	return { text: lines.join("\n") + "\n", tasks: n };
}

export function writeTasks(path, now = new Date()) {
	const { text, tasks } = generateTasks(now);
	writeFileSync(path, text);
	return tasks;
}

export const readTasks = (path) => readFileSync(path, "utf8");
