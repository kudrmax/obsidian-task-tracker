import { carry, cardBy } from "../lib/carry.mjs";

/** A person aims at what they saw before the screen moved under the card: the place found once. */
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};
const pad = (n) => String(n).padStart(2, "0");
const clock = (minute) => `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
/** Minutes from 05:00, the day's start, of a clock time «HH:MM». */
const minuteOf = (time) => {
	const [h, m] = time.split(":").map(Number);
	return ((h - 5 + 24) % 24) * 60 + m;
};

/**
 * Step 6 (spec 2026-11-18, «Decisions» 25): Soon, today's list and today's calendar side by side. A card carried onto the
 * calendar stands as the block it will be, at the hour its top is over, and is written there; a block carried to another
 * hour moves there, into today's list it loses its time; over Soon, which takes no task with a time, its place goes back
 * where it was taken and, let go, it flies back with nothing written; back onto the calendar from there it lands where it
 * is let go. Cancelled, nothing is written. A tall block taken low keeps its plate under the finger, and held at the
 * calendar's edge the calendar scrolls under it. The carried task is seen every frame.
 */
export default {
	name: "e7-calendar",
	features: ["Step 6: onto and off the calendar; a place that refuses"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const file = () => t.cdp.eval(`window.__tcStand.fileText()`);
		/** A task's time in the file as minutes from the day's start, or null without one. */
		const timeOf = async (title) => {
			const line = (await file()).split("\n").find((l) => l.includes(`] ${title} `) || l.endsWith(`] ${title}`));
			const m = line && /📌 \S+ (\d\d:\d\d)-(\d\d:\d\d)/u.exec(line);
			return m ? { start: minuteOf(m[1]), end: minuteOf(m[2]) } : null;
		};
		const base = (await timeOf("Созвон с командой")).start - 60;
		/** The calendar scrolled so the blocks' first hour is near its top, as a person scrolls to where they plan. */
		await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const line = document.querySelector('[data-hour="${clock(base + 5 * 60).slice(0, 2)}"]'); room.scrollTop += line.getBoundingClientRect().top - room.getBoundingClientRect().top - 40; return 1; })()`);
		await t.sleep(300);
		/** Where the pointer goes for the carried task's top to stand on the hour line of `minute` (from 05:00): its grab offset under the line. */
		const onHour = async (minute, grabbed) => {
			const line = await t.cdp.eval(`(() => { const label = document.querySelector('[data-hour="${clock(minute + 5 * 60).slice(0, 2)}"]'); const r = label.parentElement.querySelector(".tc-hour-line").getBoundingClientRect(); const room = document.querySelector(".tc-timeline").getBoundingClientRect(); return { y: r.top, x: room.left + room.width / 2 }; })()`);
			return { x: line.x, y: line.y + (grabbed.y - grabbed.top) + 3 };
		};
		const blockBy = (title) => t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(title)}); if (!el) return null; const r = el.getBoundingClientRect(); return { id: el.dataset.block, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 14), top: r.top }; })()`);

		const mail = await cardBy(t, "Разобрать почту", "day");
		const intoCalendar = await t.frames(() => carry(t, mail, once(() => onHour(base + 3 * 60, mail))), { maxStep: 80, carried: { id: mail.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const mailAt = await timeOf("Разобрать почту");
		t.expect(mailAt?.start === base + 3 * 60 && mailAt.end === base + 4 * 60, `a card onto the calendar: written at the hour its top was over, an hour long: ${JSON.stringify(mailAt)} for ${base + 3 * 60}`);
		t.expect((await blockBy("Разобрать почту")) !== null && !(await t.oracle.cards("day")).includes("Разобрать почту"), "on the screen it is a block now, gone from today's list");
		t.expect(intoCalendar.length === 0, `card → calendar frames: ${JSON.stringify(intoCalendar.slice(0, 4))}`);

		const lunch = await blockBy("Обед");
		const lunchFaults = await t.frames(() => carry(t, lunch, once(() => onHour(base + 5 * 60, lunch))), { maxStep: 80, carried: { id: lunch.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const lunchAt = await timeOf("Обед");
		t.expect(lunchAt?.start === base + 5 * 60 && lunchAt.end === base + 6 * 60, `a block to another hour: there, its length kept: ${JSON.stringify(lunchAt)}`);
		t.expect(lunchFaults.length === 0, `block → another hour frames: ${JSON.stringify(lunchFaults.slice(0, 4))}`);

		const review = await blockBy("Ревью дизайна");
		const flowers = await cardBy(t, "Полить цветы", "day");
		const reviewFaults = await t.frames(() => carry(t, review, once(async () => ({ x: flowers.x, y: flowers.top + 4 }))), { maxStep: 80, carried: { id: review.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const day = await t.oracle.cards("day");
		t.expect((await timeOf("Ревью дизайна")) === null && day.indexOf("Ревью дизайна") === day.indexOf("Полить цветы") - 1, `a block into today's list: a task there without a time, before «Полить цветы»: ${JSON.stringify(day)}`);
		t.expect(reviewFaults.length === 0, `block → list frames: ${JSON.stringify(reviewFaults.slice(0, 4))}`);

		const before = await file();
		const doctor = await blockBy("Звонок врачу");
		const report = await cardBy(t, "Сдать отчёт", "soon");
		let over = null;
		const refusedFaults = await t.frames(
			() =>
				carry(t, doctor, once(async () => ({ x: report.x, y: report.top + 4 })), {
					during: async () => (over = await t.cdp.eval(`({ inSoon: !!document.querySelector('[data-list="soon"] .tc-drag-source.is-lifted'), home: !!document.querySelector(".tc-block > .tc-drag-source.is-lifted"), inDay: !!document.querySelector('[data-list="day"] .tc-drag-source.is-lifted') })`)),
				}),
			{ maxStep: 80, carried: { id: doctor.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		t.expect(over && !over.inSoon && !over.inDay && over.home, `over Soon, which takes no task with a time, no place opens there: the place is back on the calendar where it was taken: ${JSON.stringify(over)}`);
		t.expect((await file()) === before, "let go over Soon, it flies back and nothing is written");
		t.expect(refusedFaults.length === 0, `refused frames: ${JSON.stringify(refusedFaults.slice(0, 4))}`);
		/** The reviewer of E1, 2026-11-18: refused over Soon, then back onto the calendar at another hour, it lands there. */
		const doctorAgain = await blockBy("Звонок врачу");
		const back = await carry(t, doctorAgain, (() => {
			let i = 0;
			return async () => (i++ === 0 ? { x: report.x, y: report.top + 4 } : onHour(base + 6 * 60 + 60, doctorAgain));
		})());
		await t.sleep(500);
		t.expect((await timeOf("Звонок врачу"))?.start === base + 7 * 60, `refused over Soon, then onto the calendar at another hour: written there: ${JSON.stringify(await timeOf("Звонок врачу"))}`);

		/** Cancelled (Escape on the desktop; on the phone brought back and let go where it was taken), a block writes nothing. */
		const unchanged = await file();
		const mailBlock = await blockBy("Разобрать почту");
		const away = await onHour(base + 8 * 60, mailBlock);
		await carry(t, mailBlock, t.platform === "phone" ? (() => { let i = 0; return async () => (i++ === 0 ? away : { x: mailBlock.x, y: mailBlock.y }); })() : once(async () => away), { end: "cancel" });
		await t.sleep(500);
		t.expect((await file()) === unchanged, "a block's drag cancelled writes nothing");

		/** The reviewer of E1, 2026-11-18: a tall block taken near its bottom kept its plate a card's height above the finger. */
		const gym = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === "Тренировка"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { id: el.dataset.block, x: r.left + r.width / 2, y: r.bottom - 8, top: r.top, height: r.height }; })()`);
		await t.sleep(300);
		const gymNow = await blockBy("Тренировка");
		const low = { ...gym, x: gymNow.x, y: gymNow.top + gym.height - 8, top: gymNow.top };
		let plate = null;
		await carry(t, low, once(async () => ({ x: low.x, y: low.y - 30 })), { end: "cancel", during: async () => (plate = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-overlay .tc-card")?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom } : null; })()`)) });
		await t.sleep(400);
		t.expect(plate && low.y - 30 >= plate.top - 1 && low.y - 30 <= plate.bottom + 1, `a tall block taken near its bottom: the plate under the finger: ${JSON.stringify(plate)} at ${low.y - 30}`);

		/** The reviewer of E1, 2026-11-18: held at the calendar's bottom edge, the calendar scrolls under the card (dnd-kit's auto-scroll), and the card lands later in the day. */
		await t.cdp.eval(`(() => { document.querySelector(".tc-timeline").scrollTop = 0; return 1; })()`);
		await t.sleep(300);
		const early = await cardBy(t, "Оплатить свет", "day");
		const room = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-timeline").getBoundingClientRect(); return { x: r.left + r.width / 2, bottom: r.bottom, top: r.top }; })()`);
		const scrolledFrom = await t.cdp.eval(`document.querySelector(".tc-timeline").scrollTop`);
		await carry(t, early, once(async () => ({ x: room.x, y: room.bottom - 6 })), { holdMs: 1500 });
		await t.sleep(500);
		const scrolled = await t.cdp.eval(`document.querySelector(".tc-timeline").scrollTop`);
		const lastShown = Math.floor(((room.bottom - room.top) / 56) * 60);
		const lightAt = await timeOf("Оплатить свет");
		t.expect(scrolled > scrolledFrom + 100 && lightAt !== null && lightAt.start > lastShown, `held at the calendar's bottom edge it scrolls, and the card lands past the hours first shown: scrolled ${scrolledFrom} → ${scrolled}, written at ${JSON.stringify(lightAt)}, first shown up to ${lastShown}`);

		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
