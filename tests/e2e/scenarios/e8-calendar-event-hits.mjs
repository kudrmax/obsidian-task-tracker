import { calendarTools } from "../lib/calendar.mjs";

/**
 * Only what is drawn of an event takes the pointer (Decision 57, amends 52), the clock at noon, the stand's dense evening:
 * a later event's box runs from its true start, unseen, over an earlier event's title; a press on that title is the
 * title's own event's. At 56 and 46 px an hour and the whole day, every point of each title's text (where no task is drawn
 * over it) finds that title's own event, and a click on each title, clear of the tasks, opens that event's menu.
 */
const TITLES = ["Планирование квартала", "Звонок с клиентом", "Синк с Олей"];
const ZOOMS = { "56": 56, "46": 46, wholeDay: "wholeDay" };

/**
 * Every 2 px of each event title's text as drawn, and what the page finds there: its event, a task over it, or anything
 * else; and whether a finger there is clear of every task (Chrome's touch adjustment moves a tap a pixel beside a task's
 * card onto the card, as a finger landing on its edge).
 */
const HITS = `(() => { const tasks = [...document.querySelectorAll(".tc-items > .tc-block")].map((b) => b.getBoundingClientRect()); const CLEAR = 12; return [...document.querySelectorAll(".tc-timeline .tc-items > .tc-event")].map((el) => {
	const title = el.querySelector(".tc-item-title");
	const range = document.createRange();
	range.selectNodeContents(title);
	const text = range.getBoundingClientRect();
	const shown = title.getBoundingClientRect();
	const right = Math.min(text.right, shown.right);
	const points = [];
	for (let y = text.top + 1; y < text.bottom - 0.5; y += 2)
		for (let x = text.left + 1; x < right - 0.5; x += 2) {
			const hit = document.elementFromPoint(x, y);
			const clear = tasks.every((r) => x < r.left - CLEAR || x > r.right + CLEAR || y < r.top - CLEAR || y > r.bottom + CLEAR);
			points.push({ x, y, event: hit?.closest("[data-event]")?.dataset.event ?? null, task: !!hit?.closest(".tc-block"), clear });
		}
	return { id: el.dataset.event, title: title.textContent, points };
}); })()`;

export default {
	name: "e8-calendar-event-hits",
	features: ["E3: a press on an event's title is that event's, never a later event's unseen box (Decision 57)"],
	cases: Object.keys(ZOOMS),
	async run(t, zoom) {
		await t.setClock("12:00");
		await t.cdp.eval(`(() => { localStorage.clear(); localStorage.setItem("task-calendar-stand-zoom", ${JSON.stringify(JSON.stringify(ZOOMS[zoom]))}); return 1; })()`);
		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const hour = Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		t.expect(zoom === "wholeDay" ? hour < 40 : hour === ZOOMS[zoom], `opened at ${zoom}: ${hour} px an hour`);
		const cal = calendarTools(t);
		await cal.scrollTo(13 * 60 + 30, 30);
		await t.sleep(300);
		await t.shot(`event-hits-${zoom}`);
		await t.cdp.eval(`(() => { window.__tcHit = null; document.addEventListener("click", (e) => { window.__tcHit = e.target.closest?.("[data-event]")?.dataset.event ?? null; }, true); return 1; })()`);

		const events = await t.cdp.eval(HITS);
		for (const name of TITLES) {
			const own = events.find((e) => e.title === name);
			t.expect(own, `${zoom}: «${name}» is drawn`);
			if (!own) continue;
			const seen = own.points.filter((p) => !p.task);
			const wrong = seen.filter((p) => p.event !== own.id);
			t.expect(seen.length > 0 || own.points.every((p) => p.task), `${zoom}: «${name}»'s title is seen, or a task lies over all of it: ${seen.length} of ${own.points.length} points`);
			t.expect(wrong.length === 0, `${zoom}: every point of «${name}»'s title finds its own event: ${wrong.length} of ${seen.length} find ${JSON.stringify([...new Set(wrong.map((p) => p.event))])}`);

			const ownPoints = seen.filter((p) => p.event === own.id && p.clear);
			/** A person taps a title in its middle. */
			const aim = ownPoints[Math.floor(ownPoints.length / 2)];
			t.expect(aim || name !== "Звонок с клиентом", `${zoom}: «${name}»'s title can be clicked clear of the tasks`);
			if (!aim) continue;
			await t.cdp.eval(`(() => { window.__tcHit = null; return 1; })()`);
			await cal.tap(aim);
			await t.sleep(400);
			const opened = await t.cdp.eval(`({ menu: !!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)"), hit: window.__tcHit })`);
			t.expect(opened.menu && opened.hit === own.id, `${zoom}: a click on «${name}»'s title opens its own menu: ${JSON.stringify(opened)} for ${own.id} at ${JSON.stringify(aim)}`);
			/** The menu closed as a person closes it, a tap beside it. */
			await cal.tap({ x: 8, y: 8 });
			await t.sleep(400);
			t.expect(!(await t.cdp.eval(`!!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)")`)), `${zoom}: «${name}»'s menu closes on a tap beside it`);
		}
	},
};
