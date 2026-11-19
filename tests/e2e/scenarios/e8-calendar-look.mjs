import { calendarTools } from "../lib/calendar.mjs";

/**
 * E3, the calendar as it stands (the design's «Задачи на таймлайне», «Правая колонка — календарь дня»; F87, F88, F91–F96),
 * the clock at noon, read from the screen and the file: a task without a length is a card's height, one with a length its
 * length's height; tasks standing close stack, each writing its start on the right; a length shorter than a card is
 * written; an open task whose time has passed rides the now line, its time in the file unchanged; a folded task is named
 * by its next step; events overlapping lie shifted right, the one over faded, a task over an event right of it; the
 * all-day event is a row over the calendar; the now line stands at its time.
 */
export default {
	name: "e8-calendar-look",
	features: ["E3: the calendar's tasks, stack, events, all-day rows, the now line and a task riding it"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const hourPx = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		await cal.scrollTo(6 * 60, 20);
		await t.sleep(300);
		await t.shot("calendar-morning");

		const now = await t.cdp.eval(`(() => { const n = document.querySelector(".tc-now"); const line = n.querySelector(".tc-now-line").getBoundingClientRect(); return { label: n.querySelector(".tc-now-pill").textContent, y: line.top + line.height / 2 }; })()`);
		const noon = await cal.lineAt(7 * 60);
		t.expect(now.label === "12:00" && Math.abs(now.y - noon.y) <= 1.5, `the now line «${now.label}» stands on its time: ${now.y} against ${noon.y}`);

		const late = await cal.blockBy("Прошедшая по времени");
		const lateAt = await cal.timeOf("Прошедшая по времени");
		t.expect(late && Math.abs(late.top - now.y) <= 2.5 && lateAt?.start === 6 * 60 + 15, `an open task past its time rides the now line, its time in the file unchanged: top ${late?.top} at ${now.y}, file ${JSON.stringify(lateAt)}`);
		t.expect(late?.corner === "30:MIN", `a length shorter than a card is written on it: ${late?.corner}`);

		const call = await cal.blockBy("Созвон с командой");
		const notes = await cal.blockBy("Заметки к созвону");
		t.expect(notes && call && Math.abs(notes.top - (call.top + call.height + 2)) <= 1, `a task standing close under another stacks one gap under its head: ${notes?.top} under ${call?.top}+${call?.height}`);
		t.expect(call?.corner === "13:00" && notes?.corner === "13:05", `every task of a stack writes its start: ${call?.corner}, ${notes?.corner}`);
		t.expect(Math.abs((notes?.height ?? 0) - 35) <= 1, `a task without a length is a card's height: ${notes?.height}`);

		const gym = await cal.blockBy("Тренировка");
		t.expect(gym && Math.abs(gym.height - (1.5 * hourPx - 2)) <= 1.5, `a task with a length is its length's height: ${gym?.height} for 90 minutes at ${hourPx}`);
		t.expect(gym?.corner === null, `a lone task with a length writes nothing on the right: ${gym?.corner}`);

		const moving = await cal.blockBy("Упаковать книги");
		t.expect(moving !== null && (await cal.blockBy("Переезд")) === null, "a folded task's card is named by its next step");

		const events = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline .tc-event")].map((e) => { const r = e.getBoundingClientRect(); return { title: e.textContent, left: r.left, past: e.classList.contains("is-past"), fill: getComputedStyle(e).backgroundImage }; })`);
		const byTitle = (title) => events.find((e) => e.title === title);
		t.expect(byTitle("Стендап")?.past === true && byTitle("Звонок с клиентом")?.past === false, `the event that is over fades, the others not: ${JSON.stringify(events.map((e) => [e.title, e.past]))}`);
		t.expect(Math.abs(byTitle("Звонок с клиентом").left - byTitle("Планирование квартала").left - 18) <= 1, `an event starting during another lies over it, 18 px right: ${JSON.stringify(events.map((e) => [e.title, e.left]))}`);
		t.expect(gym && gym.left >= byTitle("Встреча с дизайнером").left + 16, `a task over an event lies right of it: ${gym?.left} against ${byTitle("Встреча с дизайнером").left}`);
		const allDay = await t.cdp.eval(`(() => { const row = document.querySelector(".tc-allday"); const room = document.querySelector(".tc-timeline").getBoundingClientRect(); if (!row) return null; const r = row.getBoundingClientRect(); return { title: row.textContent, bottom: r.bottom, room: room.top, height: r.height }; })()`);
		t.expect(allDay?.title === "День рождения Кости" && Math.abs(allDay.height - 22) <= 0.5, `the all-day event is a row over the calendar: ${JSON.stringify(allDay)}`);

		await cal.scrollTo(7 * 60, 20);
		await t.sleep(300);
		await t.shot("calendar");
		await cal.scrollTo(12 * 60, 20);
		await t.sleep(300);
		await t.shot("calendar-events");
	},
};
