import { carry, cardBy } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

/** The minute (from 05:00) a person reads at the calendar's middle: between the two hour lines around it. */
const MIDDLE = `(() => {
	const room = document.querySelector(".tc-timeline").getBoundingClientRect();
	const y = room.top + room.height / 2;
	const lines = [...document.querySelectorAll(".tc-timeline .tc-hour-mark > .tc-hour-label:not(.is-minor)")].map((l) => ({ hour: Number(l.dataset.hour), y: l.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top }));
	for (let i = 0; i + 1 < lines.length; i++) if (lines[i].y <= y && lines[i + 1].y > y) return (i + (y - lines[i].y) / (lines[i + 1].y - lines[i].y)) * 60;
	return null;
})()`;

/**
 * E3, the zoom (F97–F100; the design's «Шаг привязки», «Деления между часами»), the clock at noon: a pinch (two fingers on
 * the phone, Ctrl + wheel on the desktop) grows the hours, the minute in the middle staying there; finer marks come with
 * it, and the snap follows it (5 minutes from 108 px an hour): a card dropped at 15:05 is written at 15:05. Pinched out
 * past the whole day it stops at the whole day; the zoom is kept on the device, the page opened again shows it.
 */
export default {
	name: "e8-calendar-zoom",
	features: ["E3: zoom by pinch and Ctrl + wheel, the minute kept, finer marks, the snap following the zoom, kept on the device (F97–F100)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const hour = async () => Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.hourPx`));
		const step = async () => Number(await t.cdp.eval(`document.querySelector(".tc-timeline").dataset.step`));
		const room = (await cal.lineAt(7 * 60)).room;
		const mid = { x: (room.left + room.right) / 2, y: (room.top + room.bottom) / 2 };
		/** A pinch at the calendar's middle: `factor` above 1 spreads the fingers (zooms in), under 1 closes them. */
		const pinch = async (factor, rounds = 1) => {
			for (let r = 0; r < rounds; r++) {
				if (t.platform === "phone") {
					const from = 40;
					const to = from * factor;
					const at = (d) => [{ x: mid.x, y: mid.y - d, id: 0 }, { x: mid.x, y: mid.y + d, id: 1 }];
					await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from) });
					for (let i = 1; i <= 12; i++) {
						await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(from + ((to - from) * i) / 12) });
						await t.sleep(16);
					}
					await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
				} else {
					for (let i = 0; i < 12; i++) {
						await t.input.wheel(mid.x, mid.y, 0, factor > 1 ? -8 : 8, true);
						await t.sleep(16);
					}
				}
				await t.sleep(400);
			}
		};

		const before = await t.cdp.eval(MIDDLE);
		const base = await hour();
		t.expect(base === 56 && (await step()) === 15, `the calendar opens at the base zoom, its snap 15 minutes: ${base}, ${await step()}`);
		await pinch(1.8, 2);
		const bigger = await hour();
		const after = await t.cdp.eval(MIDDLE);
		t.expect(bigger >= 108, `a pinch out grows the hours: ${base} → ${bigger}`);
		t.expect(before !== null && after !== null && Math.abs(after - before) <= 6, `the minute in the middle stays there: ${before} → ${after}`);
		t.expect((await step()) === 5, `the snap follows the zoom: ${await step()} minutes at ${bigger} px an hour`);
		t.expect((await t.cdp.eval(`document.querySelectorAll(".tc-timeline .tc-hour-label.is-minor").length`)) > 20, "finer marks come with the zoom");
		await t.shot("zoomed-in");

		/** The snap at 5 minutes: a card dropped with its top at 15:05 is written at 15:05. */
		await cal.scrollTo(10 * 60, 200);
		await t.sleep(300);
		const milk = await cardBy(t, "Купить молоко", "day");
		const line = await cal.lineAt(10 * 60);
		await carry(t, milk, async () => ({ x: line.x, y: line.y + (bigger * 5) / 60 + (milk.y - milk.top) + 1 }));
		await t.sleep(500);
		const milkAt = await cal.timeOf("Купить молоко");
		t.expect(milkAt?.start === 10 * 60 + 5, `a card dropped at 15:05 at this zoom is written at 15:05: ${JSON.stringify(milkAt)}`);

		await pinch(0.4, 4);
		const whole = await hour();
		const fits = await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const first = room.querySelector('[data-hour="05"]').getBoundingClientRect(); const last = room.querySelector('[data-hour="04"]').getBoundingClientRect(); const r = room.getBoundingClientRect(); return { top: first.top >= r.top - 1, bottom: last.bottom <= r.bottom + 1, hour: Number(room.dataset.hourPx) }; })()`);
		t.expect(whole < base && fits.top && fits.bottom, `pinched in past the whole day, it stops at the whole day, every hour on screen: ${JSON.stringify(fits)}`);
		t.expect((await step()) === 30 || (await step()) === 60, `the snap at the whole day is coarse: ${await step()}`);
		await t.shot("whole-day");

		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		t.expect(Math.abs((await hour()) - whole) <= 1, `the zoom is kept on the device: opened again at ${await hour()} for ${whole}`);
		await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
	},
};
