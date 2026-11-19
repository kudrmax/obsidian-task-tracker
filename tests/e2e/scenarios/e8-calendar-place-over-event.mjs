import { carry } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

/** The place of the carried task on the calendar, the time written on it, the carried copy, and what is drawn at the time's start under the copy (the copy follows the hand and may stand over it, by where it was grabbed). */
const PLACE = `(() => {
	const source = document.querySelector(".tc-items .tc-drag-source.is-lifted");
	const card = source?.querySelector(".tc-block-card");
	const time = card?.querySelector(".tc-slot-time");
	if (!card || !time) return null;
	const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
	const t = box(time);
	const carried = document.querySelector(".tc-overlay");
	const at = document.elementsFromPoint(t.left + 4, (t.top + t.bottom) / 2);
	const hit = at.find((el) => !carried?.contains(el));
	return { place: box(card), time: t, text: time.textContent, background: getComputedStyle(card).backgroundColor, hitsPlace: !!hit && card.contains(hit), hit: hit?.className ?? null, underCopy: !!carried && carried.contains(at[0]), copy: carried?.querySelector(".tc-carried") ? box(carried.querySelector(".tc-carried")) : null };
})()`;

/**
 * The place a carried task will land on the calendar reads over anything under it (Max, 2026-11-19, Decision 59: «нечитаемый
 * плейсхолдер поверх мероприятия, не окей»): carried over an event, the dashed place covers the event with the screen's
 * ground, so the event's tint and title never show through it, and its start is what is drawn where it is written.
 */
export default {
	name: "e8-calendar-place-over-event",
	features: ["E3: the carried task's place on the calendar covers an event under it, its time readable (Decision 59)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const doctor = await cal.timeOf("Звонок врачу");
		await cal.scrollTo(doctor.start - 30, 40);
		await t.sleep(300);
		const event = () => t.cdp.eval(`(() => { const e = [...document.querySelectorAll(".tc-event")].find((e) => e.querySelector(".tc-item-title")?.textContent === "Звонок с клиентом")?.querySelector(".tc-event-block"); if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
		const block = await cal.blockBy("Звонок врачу");
		t.expect(block && (await event()), "the doctor's call and the client's call are on the screen");
		let seen = null;
		await carry(t, { x: block.x, y: block.y }, async () => {
			const e = await event();
			return { x: block.x, y: e.top + 6 + (block.y - block.top) };
		}, {
			end: t.platform === "phone" ? "drop" : "cancel",
			during: async () => {
				seen = await t.cdp.eval(PLACE);
				await t.shot("place-over-event");
				const e = await event();
				await t.shot("place-over-event-zoom", { x: Math.max(0, e.left - 60), y: e.top - 60, width: Math.min(e.right + 10, t.platform === "phone" ? 390 : 1280) - Math.max(0, e.left - 60), height: 200 });
			},
		});
		console.log(JSON.stringify(seen));
		t.expect(seen, "a dashed place with its time stands on the calendar while the task is carried");
		const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(seen?.background ?? "");
		t.expect(seen && seen.background !== "transparent" && (!alpha || Number(alpha[1]) === 1), `the place covers what is under it: ${seen?.background}`);
		t.expect(seen?.hitsPlace, `under the carried copy, the place is what is drawn where its time is written, no event or card over it: ${seen?.hit}`);
	},
};
