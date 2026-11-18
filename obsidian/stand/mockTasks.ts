/**
 * The stand's made-up tasks file: about 300 tasks in the format of docs/plugin/file.md, dated around the stand's clock,
 * with every case the screen draws: sections and an empty one, nested subtasks, a folded task, a description, tasks in
 * progress, priorities, projects with a subproject and a folder, links, timed tasks later today, a long one, two that
 * overlap and one already past (it rides the now line), dated Soon tasks and a repeat, Backlog, Done. The same titles every
 * time for the same day, so a scenario names the tasks it means by their titles.
 */

const VERBS = ["Позвонить", "Написать", "Купить", "Проверить", "Разобрать", "Оплатить", "Отправить", "Подготовить", "Прочитать", "Обновить", "Записаться", "Починить", "Собрать", "Заказать", "Спланировать"];
const THINGS = ["отчёт", "билеты", "врачу", "маме", "счёт за свет", "заметки", "презентацию", "документы", "письмо Косте", "продукты", "велосипед", "план недели", "книгу", "расписание", "квартиру", "налоги", "доклад", "ревью PR", "лекцию", "подарок"];

/** The day starts at 5:00 by default: before it, today is still yesterday's date. */
const DAY_START_HOUR = 5;
const MINUTE = 60_000;
const QUARTER = 15 * MINUTE;

const pad = (n: number) => String(n).padStart(2, "0");
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayAfter = (day: Date, days: number) => dateOf(new Date(day.getFullYear(), day.getMonth(), day.getDate() + days));

/** The note the project «Дом» is attached to: its block shows that project. */
export const PROJECT_NOTE = "Заметка о доме";

export function mockTasks(clock: Date): string {
	const day = new Date(clock.getTime() - DAY_START_HOUR * 60 * MINUTE);
	const today = dateOf(day);
	let n = 0;
	const title = () => {
		n++;
		return `${VERBS[n % VERBS.length]} ${THINGS[(n * 7) % THINGS.length]} ${n}`;
	};
	const lines: string[] = [];
	const add = (...more: string[]) => lines.push(...more);
	const slot = (start: Date, minutes: number) => `📌 ${dateOf(start)} ${timeOf(start)}-${timeOf(new Date(start.getTime() + minutes * MINUTE))}`;

	add("## Inbox");
	for (let i = 0; i < 40; i++) add(`- [ ] ${i % 11 === 0 ? "p1 " : ""}${title()}${i % 9 === 4 ? " 🗂️ Дом" : ""}${i === 6 ? " 🗂️ Кухня" : ""}`);
	add("", "### Идеи");
	for (let i = 0; i < 30; i++) add(`- [ ] ${title()}`);

	add("", "## Projects", `- Дом [[${PROJECT_NOTE}]]`, "\t- Кухня", "- Работа", "\t- Отчёты", "- Архив 🗃️", "\t- Старое", "");

	add("## Now");
	add(`- [/] Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки 📅 ${today}`);
	add(`- [ ] Задача со ссылкой на [[${PROJECT_NOTE}]] и https://example.com 📅 ${today}`);
	add(`- [ ] Свёрнутая задача с шагами 📅 ${today} 📁`, "\t- [ ] Первый шаг свёрнутой", "\t- [ ] Второй шаг свёрнутой");
	add(`- [ ] Задача с описанием 📅 ${today}`, "\t- первая строка описания");
	for (let i = 0; i < 28; i++) {
		add(`- [${i % 9 === 0 ? "/" : " "}] ${i % 7 === 0 ? "p2 " : ""}${title()}${i % 6 === 2 ? " 🗂️ Работа" : ""} 📅 ${today}`);
		if (i % 10 === 3) add(`\t- [ ] шаг ${title()}`, `\t\t- [ ] подшаг ${title()}`, `\t- [x] шаг ${title()}`, `\t- [ ] шаг ${title()}`);
	}
	/** Timed today: one already past (it rides the now line), then ahead of the clock a short, a long and two that overlap. */
	const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DAY_START_HOUR).getTime();
	const dayEnd = dayStart + 24 * 60 * MINUTE;
	const past = new Date(Math.floor((clock.getTime() - 70 * MINUTE) / QUARTER) * QUARTER);
	if (past.getTime() >= dayStart) add(`- [ ] Прошедшая по времени 📅 ${today} ${slot(past, 30)}`);
	const first = Math.ceil((clock.getTime() + 30 * MINUTE) / QUARTER) * QUARTER;
	const ahead: [number, number, string][] = [
		[0, 30, title()],
		[60, 120, "Длинный блок на два часа"],
		[210, 30, "Пересекается первая"],
		[225, 45, "Пересекается вторая"],
		[300, 15, title()],
		[345, 30, title()],
	];
	for (const [offset, minutes, name] of ahead) {
		const start = new Date(first + offset * MINUTE);
		if (start.getTime() + minutes * MINUTE <= dayEnd) add(`- [ ] ${name} 📅 ${today} ${slot(start, minutes)}`);
	}
	add("", "### Вечер");
	for (let i = 0; i < 6; i++) add(`- [ ] ${title()} 📅 ${today}`);

	add("", "## Soon");
	for (let i = 0; i < 50; i++) add(`- [ ] ${title()}${i % 3 === 0 ? ` 📅 ${dayAfter(day, 1 + (i % 10))}` : ""}${i % 13 === 0 ? " 🗂️ Работа" : ""}${i % 15 === 0 ? " 🔁 every day" : ""}`);
	add("", "### Поездка");
	for (let i = 0; i < 20; i++) add(`- [ ] ${title()}`);
	add("", "### Пустая секция");

	add("", "## Backlog");
	for (let i = 0; i < 80; i++) add(`- [ ] ${title()}${i === 3 ? " 🗂️ Старое" : ""}`);

	add("", "## Done");
	for (let i = 0; i < 30; i++) add(`- [x] ${title()}`);
	return `${lines.join("\n")}\n`;
}
