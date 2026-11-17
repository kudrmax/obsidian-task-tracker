/**
 * The lists and the card (docs/plugin/screen.md, «Лента колонок», «Карточка задачи»; docs/plugin/tasks.md, «Секции»): each
 * list shows its tasks in the file's order, under its sections' headers, an empty section with its No tasks plate; a card
 * shows its title (links by their word), the in-progress dot, the folder of its project, the subtask counter and the
 * description's mark, the due date unless it is the day shown; a folded task shows its next step under its own title.
 */
export default {
	name: "lists",
	features: ["F55", "F56", "F57", "F58", "F59", "F60", "F61", "F65", "F68", "F69", "F70", "F71", "F75", "F76", "F77", "F79", "F80", "F81", "F84"],
	async run(t) {
		const card = (title) =>
			t.cdp.eval(`(() => {
				const el = [...document.querySelectorAll(".task-calendar .tc-card")].find((c) => c.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(title)});
				if (!el) return null;
				return {
					dot: getComputedStyle(el, "::before").content !== "none" && getComputedStyle(el, "::before").display !== "none",
					links: [...el.querySelectorAll(".tc-link")].map((l) => l.textContent),
					folder: el.querySelector(".tc-project-mark")?.getAttribute("aria-label") ?? null,
					count: el.querySelector(".tc-count")?.textContent ?? null,
					desc: !!el.querySelector(".tc-desc-mark"),
					due: el.querySelector(".tc-due-day")?.textContent ?? null,
					over: el.querySelector(".tc-card-over-text")?.textContent ?? null,
					priority: el.dataset.priority ?? null,
					height: Math.round(el.getBoundingClientRect().height),
					branch: !!el.querySelector(".tc-branch"),
				};
			})()`);
		const now = t.oracle.tasks("Now").filter((task) => !task.timed);
		const shownDay = await t.oracle.cards("day");
		const wantedDay = ["Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки", "Задача со ссылкой на Заметка о доме и https://example.com", "Первый шаг свёрнутой", "Задача с описанием"];
		t.expect(JSON.stringify(shownDay.slice(0, 4)) === JSON.stringify(wantedDay), `today's list starts as the file's Now, a folded task by its next step: ${JSON.stringify(shownDay.slice(0, 4))}`);
		const timed = t.oracle.tasks("Now").filter((task) => task.timed).map((task) => task.title);
		t.expect(timed.every((title) => !shownDay.includes(title)), "today's list leaves out the tasks on today's timeline");
		t.expect(now.length > 0, "the file has Now tasks");

		const long = await card(wantedDay[0]);
		t.expect(long?.dot === true, "a task in progress shows the dot");
		const linked = await card(wantedDay[1]);
		t.expect(JSON.stringify(linked?.links) === JSON.stringify(["Заметка о доме", "https://example.com"]), `links show by their word: ${JSON.stringify(linked?.links)}`);
		const folded = await card("Первый шаг свёрнутой");
		t.expect(folded?.over === "Свёрнутая задача с шагами" && folded.count === "0/2", `a folded task: its own title small over its next step, its counter: ${JSON.stringify(folded)}`);
		const plain = await card("Задача с описанием");
		t.expect(plain?.desc === true && plain.due === null, `the description's mark; no date on the day it is due: ${JSON.stringify(plain)}`);
		t.expect(folded && plain && folded.height > plain.height, `a folded card is taller: ${folded?.height} > ${plain?.height}`);
		const projectTask = t.oracle.tasks("Now").find((task) => task.title.includes("73"));
		const marked = projectTask ? await card(projectTask.title) : null;
		t.expect(marked?.folder === "Работа", `a task in a project shows its folder, named on hover: ${JSON.stringify(marked)}`);
		const prioritized = await card(t.oracle.tasks("Now").find((task) => task.title.includes("71")).title);
		t.expect(prioritized?.priority !== null && prioritized?.dot === true, `a priority's colour and the dot: ${JSON.stringify(prioritized)}`);
		const sub = await t.cdp.eval(`[...document.querySelectorAll('[data-list="day"] .tc-card')].filter((c) => c.querySelector(".tc-branch")).map((c) => c.querySelector(".tc-card-title").textContent).slice(0, 3)`);
		t.expect(sub.length >= 2 && sub[0].startsWith("шаг") && sub[1].startsWith("подшаг"), `subtasks under their task with branch lines: ${JSON.stringify(sub)}`);
		const sections = await t.cdp.eval(`[...document.querySelectorAll('[data-list="day"] .tc-group-name')].map((h) => h.textContent)`);
		t.expect(sections.length === 0 || !sections.includes("Вечер") || sections.indexOf("Вечер") > 0, `today's sections: ${JSON.stringify(sections)}`);

		await t.setPlace("soon");
		await t.open();
		const headsShown = () => t.cdp.eval(`[...document.querySelectorAll('[data-list="soon"] .tc-group-name')].map((h) => h.textContent)`);
		const soonHeads = new Set(await headsShown());
		const first = [...soonHeads][0];
		const list = await t.oracle.rect('[data-list="soon"]');
		const scrolled = await t.frames(async () => {
			for (let i = 0; i < 60; i++) {
				void t.input.wheel(list.x, list.y, 0, 60);
				await t.sleep(16);
				if (i % 5 === 0) for (const head of await headsShown()) soonHeads.add(head);
			}
		}, { cast: "soon-scroll" });
		for (const head of await headsShown()) soonHeads.add(head);
		t.expect(first === "No section" && soonHeads.has("Поездка"), `Soon's sections, its tasks outside one under No section, met while scrolling: ${JSON.stringify([...soonHeads])}`);
		t.expect(scrolled.length === 0, `frames of scrolling Soon: ${JSON.stringify(scrolled.slice(0, 3))}`);
		const end = await t.cdp.eval(`(() => { const heads = [...document.querySelectorAll('[data-list="soon"] .tc-list-item')].map((i) => i.firstElementChild); const last = heads.slice(-2).map((n) => [n.className, n.textContent]); return last; })()`);
		t.expect(end.length === 2 && end[0][1] === "Пустая секция" && end[1][0].includes("tc-group-empty") && end[1][1] === "No tasks", `an empty section: its header and the dashed No tasks plate: ${JSON.stringify(end)}`);
		const fades = await t.cdp.eval(`document.querySelector('[data-list="soon"]').className`);
		t.expect(fades.includes("is-under-top"), `scrolled, Soon fades under its top edge: ${fades}`);

		await t.setPlace("calendar");
		await t.open();
		const next = await t.oracle.rect(".tc-day-nav .tc-arrow[aria-label='Next day']");
		if (t.platform === "phone") await t.input.tap(next.x, next.y);
		else await t.input.click(next.x, next.y);
		await t.sleep(700);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Tomorrow"]), "the arrow turns to tomorrow");
		const tomorrow = await t.oracle.cards("day");
		const due = await t.cdp.eval(`[...document.querySelectorAll('[data-list="day"] .tc-card')].filter((c) => c.querySelector(".tc-due-day")).length`);
		t.expect(tomorrow.length > 0 && due === 0, `tomorrow's list shows the tasks due then, without their date: ${tomorrow.length} cards, ${due} dated`);
		const heads = await t.cdp.eval(`[...document.querySelectorAll('[data-list="day"] .tc-group-name')].map((h) => h.textContent)`);
		t.expect(heads.includes("Пустая секция"), `an empty Soon section shows in a future day's column: ${JSON.stringify(heads)}`);
		const title = await t.oracle.rect(".tc-day-title");
		if (t.platform === "phone") await t.input.tap(title.x, title.y);
		else await t.input.click(title.x, title.y);
		await t.sleep(600);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Today"]), "a tap on the day's title goes back to today");
	},
};
