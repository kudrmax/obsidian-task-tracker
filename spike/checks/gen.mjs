import { writeFileSync } from "node:fs";
const words = ["Позвонить","Написать","Купить","Проверить","Разобрать","Оплатить","Отправить","Подготовить","Прочитать","Обновить","Записаться","Починить","Собрать","Заказать","Спланировать"];
const things = ["отчёт","билеты","врачу","маме","счёт за свет","заметки","презентацию","документы","письмо Косте","продукты","велосипед","план недели","книгу","расписание","квартиру","налоги","доклад","ревью PR","лекцию","подарок"];
let n = 0;
const title = () => { n++; const p = n % 11 === 0 ? "p1 " : n % 7 === 0 ? "p2 " : ""; return `${p}${words[n % words.length]} ${things[(n * 7) % things.length]} ${n}`; };
const pad = (x) => String(x).padStart(2, "0");
const day = (d) => `2026-11-${pad(d)}`;
const lines = [];
lines.push("## Inbox");
for (let i = 0; i < 70; i++) lines.push(`- [ ] ${title()}`);
lines.push("", "## Projects", "- Дом", "- Работа", "");
lines.push("## Now");
for (let i = 0; i < 30; i++) { lines.push(`- [${i % 9 === 0 ? "/" : " "}] ${title()} 📅 ${day(17)}`); if (i % 10 === 3) { lines.push(`\t- [ ] шаг ${title()}`); lines.push(`\t- [ ] шаг ${title()}`); } }
/** Later today: a slot whose start has passed rides the now line, so the test blocks stand ahead of the clock. */
const now = new Date(); const base = Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 15) * 15;
for (let i = 0; i < 10; i++) { const s = Math.min(base + i * 20, 23 * 60); const e = Math.min(s + (i % 2 ? 15 : 30), 23 * 60 + 59); const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; lines.push(`- [ ] ${title()} 📅 ${day(17)} 📌 ${day(17)} ${hm(s)}-${hm(e)}`); }
lines.push("", "### Evening");
for (let i = 0; i < 6; i++) lines.push(`- [ ] ${title()} 📅 ${day(17)}`);
lines.push("", "## Soon");
for (let i = 0; i < 50; i++) lines.push(`- [ ] ${title()}${i % 3 === 0 ? ` 📅 ${day(18 + (i % 10))}` : ""}${i % 13 === 0 ? " 🗂️ Работа" : ""}`);
lines.push("", "### Поездка");
for (let i = 0; i < 20; i++) lines.push(`- [ ] ${title()}`);
lines.push("", "## Backlog");
for (let i = 0; i < 80; i++) lines.push(`- [ ] ${title()}`);
lines.push("", "## Done");
for (let i = 0; i < 30; i++) lines.push(`- [x] ${title()}`);
writeFileSync(process.argv[2], lines.join("\n") + "\n");
console.log("tasks", n, "lines", lines.length);
