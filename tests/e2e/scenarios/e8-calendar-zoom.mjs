import { writeFileSync } from "node:fs";
import { join } from "node:path";
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
 * Every frame while the calendar zooms, read off the screen (Max, 2026-11-19: «Купить молоко» at 18:30 stood at 16:00 in
 * the middle of a zoom, the hour lines already drawn at the new scale): for each task and event on the calendar, how far
 * its top stands from where the hour lines drawn in that frame put its minute, `minutes` naming each one's minute; and,
 * for every task, stacked ones too, how far its top stands from its own place at the scale drawn (a glide lagging the zoom).
 */
const ZOOM_FRAMES = (minutes) => `(() => {
	const minutes = ${JSON.stringify(minutes)};
	const state = { frames: [], run: true };
	const tick = () => {
		if (!state.run) return;
		const room = document.querySelector(".tc-timeline");
		const canvas = room?.querySelector(".tc-canvas");
		if (canvas) {
			const lines = [...room.querySelectorAll(".tc-hour-mark > .tc-hour-label:not(.is-minor)")].map((l) => l.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top);
			const lineOf = (minute) => { const i = Math.floor(minute / 60); return lines[i] + (lines[i + 1] - lines[i]) * ((minute % 60) / 60); };
			const top = canvas.getBoundingClientRect().top;
			const items = [];
			for (const el of room.querySelectorAll(".tc-items > .tc-block, .tc-items > .tc-event")) {
				const title = (el.querySelector(".tc-card-title, .tc-item-title")?.textContent) ?? "";
				const r = el.getBoundingClientRect();
				const inset = el.classList.contains("tc-event") ? parseFloat(getComputedStyle(el).getPropertyValue("--tc-item-inset")) : 0;
				const own = top + parseFloat(el.style.getPropertyValue("--tc-y")) + inset;
				items.push({ title, lag: +(r.top - own).toFixed(1), off: title in minutes ? +(r.top - inset - lineOf(minutes[title])).toFixed(1) : null });
			}
			state.frames.push({ hour: Number(room.dataset.hourPx), items });
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__tcZoomFrames = () => { state.run = false; return state.frames; };
	return 1;
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

		/**
		 * The zoom's frames: every task and event stays on its minute against the hour lines drawn in the same frame, and every
		 * task, stacked ones too, stands at its own place at the scale drawn: a change of scale is no move, nothing glides to it.
		 * `onLines` names the items whose top is their minute through the whole zoom (unstacked at every zoom it passes).
		 */
		const zoomFrames = async (gesture, onLines, label) => {
			await t.cdp.eval(ZOOM_FRAMES(onLines));
			await gesture();
			const frames = await t.cdp.eval(`window.__tcZoomFrames()`);
			const scales = new Set(frames.map((f) => f.hour)).size;
			const worst = (key) => frames.flatMap((f) => f.items.filter((i) => i[key] !== null).map((i) => ({ hour: f.hour, title: i.title, [key]: i[key] }))).reduce((w, i) => (w === null || Math.abs(i[key]) > Math.abs(w[key]) ? i : w), null);
			const lag = worst("lag");
			const off = worst("off");
			const seen = new Set(frames.flatMap((f) => f.items.filter((i) => i.off !== null).map((i) => i.title)));
			console.log(`${label}: ${frames.length} frames, ${scales} scales, worst lag ${JSON.stringify(lag)}, worst off its line ${JSON.stringify(off)}`);
			writeFileSync(join(t.out, `zoom-frames-${label}.json`), JSON.stringify({ frames: frames.length, scales, lag, off }));
			t.expect(scales > 3, `${label}: the zoom is seen over several frames: ${scales} scales in ${frames.length} frames`);
			t.expect(Object.keys(onLines).every((title) => seen.has(title)), `${label}: the items on their lines are measured: ${[...seen].join(", ")} of ${Object.keys(onLines).join(", ")}`);
			t.expect(!lag || Math.abs(lag.lag) <= 1, `${label}: every task stands at its place at the scale drawn in every frame: worst ${JSON.stringify(lag)}`);
			t.expect(!off || Math.abs(off.off) <= 1.5, `${label}: every task and event stays on its minute against the hour lines in every frame: worst ${JSON.stringify(off)}`);
		};

		const before = await t.cdp.eval(MIDDLE);
		const base = await hour();
		t.expect(base === 56 && (await step()) === 15, `the calendar opens at the base zoom, its snap 15 minutes: ${base}, ${await step()}`);
		/** At 12:00 the stand puts «Тренировка» at 18:00 and «Стендап» at 10:00, minutes from 05:00. */
		await zoomFrames(() => pinch(1.8, 2), { Тренировка: 13 * 60, Стендап: 5 * 60 }, "in");
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

		await zoomFrames(() => pinch(0.4, 4), { Стендап: 5 * 60 }, "out");
		const whole = await hour();
		/** The whole day fills what a person sees of the calendar: from the room's top to where the screen's foot begins (review 6). */
		const fits = await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const first = room.querySelector('[data-hour="05"]').getBoundingClientRect(); const lines = room.querySelectorAll(".tc-hour-mark > .tc-hour-line:not(.is-minor)"); const last = lines[lines.length - 1].getBoundingClientRect(); const r = room.getBoundingClientRect(); const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height; const hour = Number(room.dataset.hourPx); return { top: first.top >= r.top - 1, end: last.top + hour, visibleBottom: r.bottom - foot, hour }; })()`);
		t.expect(whole < base && fits.top && Math.abs(fits.end - fits.visibleBottom) <= 10, `pinched in past the whole day, it stops at the whole day, which fills what is seen down to the foot: ${JSON.stringify(fits)}`);
		t.expect((await step()) === 30 || (await step()) === 60, `the snap at the whole day is coarse: ${await step()}`);
		await t.shot("whole-day");

		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		t.expect(Math.abs((await hour()) - whole) <= 1, `the zoom is kept on the device: opened again at ${await hour()} for ${whole}`);

		if (t.platform === "desktop") {
			/** Review 4: Cmd + wheel zooms too on the Mac. */
			const from = await hour();
			for (let i = 0; i < 12; i++) {
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: mid.x, y: mid.y, deltaX: 0, deltaY: -8, modifiers: 4 });
				await t.sleep(16);
			}
			await t.sleep(400);
			t.expect((await hour()) > from + 10, `Cmd + wheel zooms: ${from} → ${await hour()}`);
		} else {
			/** Review 2: a second finger landing while a long press on a card waits makes it part of a pinch: nothing is lifted. */
			const card = await cardBy(t, "Полить цветы", "day");
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: card.x, y: card.y, id: 0 }] });
			await t.sleep(100);
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: card.x, y: card.y, id: 0 }, { x: card.x, y: card.y + 120, id: 1 }] });
			await t.sleep(400);
			const lifted = await t.cdp.eval(`!!document.querySelector(".tc-overlay .tc-card")`);
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			await t.sleep(300);
			t.expect(!lifted, "a second finger landing while a long press waits: nothing is lifted");
		}
		await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
	},
};
