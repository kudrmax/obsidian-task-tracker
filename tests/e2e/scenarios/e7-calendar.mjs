import { carry, cardBy } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

/** A person aims at what they saw before the screen moved under the card: the place found once. */
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/**
 * Step 6 (spec 2026-11-18, «Decisions» 25 and 27): Soon, today's list and today's calendar side by side, the clock at noon.
 * A card carried onto the calendar stands as the card it will be, at the hour its top is over, its start written on its
 * dashed place, and is written there without a length; a block carried to another hour moves there, its length kept; into
 * today's list it loses its time, into Soon too (F157); under today's last card, in the list's empty room, it goes to the
 * list's end. Cancelled, nothing is written. A tall block taken low keeps its plate under the finger, and held at the
 * calendar's edge the calendar scrolls under it. The carried task is seen every frame.
 */
export default {
	name: "e7-calendar",
	features: ["Step 6: onto and off the calendar (F155–F157, F162)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const { file, timeOf, blockBy } = cal;
		const onHour = (minute, grabbed) => cal.onHour(minute, grabbed);
		const base = (await timeOf("Созвон с командой")).start - 60;
		await cal.scrollTo(base + 60);
		await t.sleep(300);

		const mail = await cardBy(t, "Разобрать почту", "day");
		let written = null;
		const intoCalendar = await t.frames(() => carry(t, mail, once(() => onHour(base + 3 * 60, mail)), { during: async () => (written = await cal.placeTime()) }), { maxStep: 80, carried: { id: mail.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const mailAt = await timeOf("Разобрать почту");
		t.expect(mailAt?.start === base + 3 * 60 && mailAt.end === null, `a card onto the calendar: written at the hour its top was over, without a length (Decision 27): ${JSON.stringify(mailAt)} for ${base + 3 * 60}`);
		t.expect(written === "15:00", `its dashed place on the calendar writes the start it will take: «${written}»`);
		const mailBox = await blockBy("Разобрать почту");
		t.expect(mailBox && Math.abs(mailBox.height - 35) <= 1, `a task without a length is a card's height: ${mailBox?.height}`);
		t.expect(mailBox !== null && !(await t.oracle.cards("day")).includes("Разобрать почту"), "on the screen it is on the calendar now, gone from today's list");
		t.expect(intoCalendar.length === 0, `card → calendar frames: ${JSON.stringify(intoCalendar.slice(0, 4))}`);

		const lunch = await blockBy("Обед");
		const lunchFaults = await t.frames(() => carry(t, lunch, once(() => onHour(base + 5 * 60, lunch))), { maxStep: 80, carried: { id: lunch.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const lunchAt = await timeOf("Обед");
		t.expect(lunchAt?.start === base + 5 * 60 && lunchAt.end === base + 6 * 60, `a block to another hour: there, its length kept (F156): ${JSON.stringify(lunchAt)}`);
		t.expect(lunchFaults.length === 0, `block → another hour frames: ${JSON.stringify(lunchFaults.slice(0, 4))}`);

		const review = await blockBy("Ревью дизайна");
		const flowers = await cardBy(t, "Полить цветы", "day");
		const reviewFaults = await t.frames(() => carry(t, review, once(async () => ({ x: flowers.x, y: flowers.top + 4 }))), { maxStep: 80, carried: { id: review.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const day = await t.oracle.cards("day");
		t.expect((await timeOf("Ревью дизайна")) === null && day.indexOf("Ревью дизайна") === day.indexOf("Полить цветы") - 1, `a block into today's list: a task there without a time, before «Полить цветы»: ${JSON.stringify(day)}`);
		t.expect(reviewFaults.length === 0, `block → list frames: ${JSON.stringify(reviewFaults.slice(0, 4))}`);

		/** Soon takes a timed task as the plugin does, its time erased (F157, Decision 27): its place opens there, let go it is a task of Soon without a time. */
		const doctor = await blockBy("Звонок врачу");
		const report = await cardBy(t, "Сдать отчёт", "soon");
		let over = null;
		const soonFaults = await t.frames(
			() =>
				carry(t, doctor, once(async () => ({ x: report.x, y: report.top + 4 })), {
					during: async () => (over = await t.cdp.eval(`({ inSoon: !!document.querySelector('[data-list="soon"] .tc-drag-source.is-lifted'), home: !!document.querySelector(".tc-block > .tc-drag-source.is-lifted") })`)),
				}),
			{ maxStep: 80, carried: { id: doctor.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		const soon = await t.oracle.tasks("Soon");
		t.expect(over && over.inSoon && !over.home, `over Soon its place opens there: ${JSON.stringify(over)}`);
		t.expect((await timeOf("Звонок врачу")) === null && soon.some((task) => task.title === "Звонок врачу" && !task.timed && !task.dated), `let go over Soon, it is a task of Soon without a time or a date: ${JSON.stringify(soon.slice(0, 4))}`);
		t.expect(soonFaults.length === 0, `block → Soon frames: ${JSON.stringify(soonFaults.slice(0, 4))}`);

		/** Max's find (Decision 27): a block carried under today's last card, into the list's empty room, goes to the list's end, not back onto the calendar. */
		const moved = await blockBy("Обед");
		const lastTitle = (await t.oracle.cards("day")).at(-1);
		const last = await cardBy(t, lastTitle, "day");
		const roomFaults = await t.frames(() => carry(t, moved, once(async () => ({ x: last.x, y: last.bottom + 120 }))), { maxStep: 80, carried: { id: moved.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const dayNow = await t.oracle.cards("day");
		t.expect((await timeOf("Обед")) === null && dayNow.at(-1) === "Обед", `carried under today's last card, it goes to the list's end without a time: ${JSON.stringify(dayNow)}`);
		t.expect(roomFaults.length === 0, `block → the list's empty room frames: ${JSON.stringify(roomFaults.slice(0, 4))}`);

		/** Cancelled (Escape on the desktop; on the phone brought back and let go where it was taken), a block writes nothing. */
		const unchanged = await file();
		const mailBlock = await blockBy("Разобрать почту");
		const away = await onHour(base + 5 * 60, mailBlock);
		await carry(t, mailBlock, t.platform === "phone" ? (() => { let i = 0; return async () => (i++ === 0 ? away : { x: mailBlock.x, y: mailBlock.y }); })() : once(async () => away), { end: "cancel" });
		await t.sleep(500);
		const after = await file();
		t.expect(after === unchanged, `a block's drag cancelled writes nothing: ${JSON.stringify(after.split("\n").filter((l) => !unchanged.split("\n").includes(l)))}`);

		/** The reviewer of E1, 2026-11-18: a tall block taken near its bottom kept its plate a card's height above the finger. */
		const gym = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === "Тренировка"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { id: el.dataset.block, x: r.left + r.width / 2, y: r.bottom - 8, top: r.top, height: r.height }; })()`);
		await t.sleep(300);
		const gymNow = await blockBy("Тренировка");
		const low = { ...gym, x: gymNow.x, y: gymNow.top + gym.height - 8, top: gymNow.top };
		let plate = null;
		await carry(t, low, once(async () => ({ x: low.x, y: low.y - 30 })), { end: "cancel", during: async () => (plate = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-overlay .tc-card")?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom } : null; })()`)) });
		await t.sleep(400);
		t.expect(plate && low.y - 30 >= plate.top - 1 && low.y - 30 <= plate.bottom + 1, `a tall block taken near its bottom: the plate under the finger: ${JSON.stringify(plate)} at ${low.y - 30}`);

		/** Decision 41: a block taken from a stack (drawn below its time), carried away and brought back where it was taken, writes nothing (away from the edges, where a held card scrolls the calendar). */
		await cal.scrollTo(base + 60, 200);
		await t.sleep(300);
		const stacked = await blockBy("Заметки к созвону");
		const kept = await file();
		t.expect(stacked?.corner === "13:05", `«Заметки к созвону» stands in a stack, writing its start: ${stacked?.corner}`);
		await carry(t, stacked, (() => {
			let i = 0;
			return async () => (i++ === 0 ? { x: stacked.x, y: stacked.y + 90 } : { x: stacked.x, y: stacked.y });
		})());
		await t.sleep(500);
		t.expect((await file()) === kept, `a stacked block brought back where it was taken writes nothing: ${JSON.stringify(await timeOf("Заметки к созвону"))}`);

		/** Review 5: a card lifted near the calendar's bottom edge and held there, never heading into it, leaves it as it is. */
		/** The calendar scrolled so a block's head stands in the room's bottom edge, where a card heading there would scroll it. */
		const nearEdge = await t.cdp.eval(`(async () => { const roomEl = document.querySelector(".tc-timeline"); const el = [...document.querySelectorAll(".tc-block-card")].find((b) => b.querySelector(".tc-card-title")?.textContent === "Тренировка"); let room = roomEl.getBoundingClientRect(); roomEl.scrollTop += el.getBoundingClientRect().top - (room.bottom - room.height * 0.1); await new Promise((r) => setTimeout(r, 300)); room = roomEl.getBoundingClientRect(); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + 10; return document.elementFromPoint(x, y)?.closest(".tc-block-card") === el && y > room.bottom - room.height * 0.15 ? { id: el.dataset.block, x, y, top: r.top, scroll: roomEl.scrollTop } : null; })()`);
		if (nearEdge) {
			const unmovedFile = await file();
			await carry(t, nearEdge, once(async () => ({ x: nearEdge.x, y: nearEdge.y })), { holdMs: 1200 });
			await t.sleep(400);
			/** On the phone page Chromium sends no move under its touch slop (Decision 18): the press stayed a hold, and let go its menu opened (F106); closed by its backdrop. */
			if (await t.cdp.eval(`!!document.querySelector(".tc-floating-menu")`)) {
				await cal.tap({ x: 8, y: 8 });
				await t.sleep(400);
			}
			const after = await t.cdp.eval(`document.querySelector(".tc-timeline").scrollTop`);
			t.expect(after === nearEdge.scroll && (await file()) === unmovedFile, `a card lifted near the edge and held there scrolls nothing: ${nearEdge.scroll} → ${after}`);
		} else t.expect(false, "a block near the calendar's bottom edge to lift");

		/** The reviewer of E1, 2026-11-18: held at the calendar's bottom edge, the calendar scrolls under the card (dnd-kit's auto-scroll), and the card lands later in the day. */
		await t.cdp.eval(`(() => { document.querySelector(".tc-timeline").scrollTop = 0; return 1; })()`);
		await t.sleep(300);
		const early = await cardBy(t, "Оплатить свет", "day");
		const room = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-timeline").getBoundingClientRect(); return { x: r.left + r.width / 2, bottom: r.bottom, top: r.top }; })()`);
		const scrolledFrom = await t.cdp.eval(`document.querySelector(".tc-timeline").scrollTop`);
		await carry(t, early, once(async () => ({ x: room.x, y: room.bottom - 6 })), { holdMs: 1500 });
		await t.sleep(500);
		const scrolled = await t.cdp.eval(`document.querySelector(".tc-timeline").scrollTop`);
		const lastShown = Math.floor(((room.bottom - room.top) / Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`))) * 60);
		const lightAt = await timeOf("Оплатить свет");
		t.expect(scrolled > scrolledFrom + 100 && lightAt !== null && lightAt.start > lastShown, `held at the calendar's bottom edge it scrolls, and the card lands past the hours first shown: scrolled ${scrolledFrom} → ${scrolled}, written at ${JSON.stringify(lightAt)}, first shown up to ${lastShown}`);

		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
