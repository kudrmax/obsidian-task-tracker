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
	features: ["E3: zoom by pinch and Ctrl + wheel, the minute under the pointer kept, finer marks, the snap following the zoom, kept on the device, the whole day refitting (F97–F100)"],
	cases: ["flow", "anchor in and out", "anchor at the day's edges", "whole day refits", "the day's ends and the all-day band"],
	async run(t, item) {
		if (item === "anchor in and out") return anchorInAndOut(t);
		if (item === "anchor at the day's edges") return anchorAtEdges(t);
		if (item === "whole day refits") return wholeDayRefits(t);
		if (item === "the day's ends and the all-day band") return dayEndsAndBand(t);
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

/**
 * Every frame from the gesture's first input on, read off the screen: where the hour lines drawn in that frame put
 * `minute`, against where the pointer is (the mouse of a Ctrl + wheel, the fingers' centre of a pinch, read off the input
 * events as the page gets them), and the calendar's scroll against its limits.
 */
const ANCHOR_FRAMES = (minute) => `(() => {
	const state = { frames: [], run: true, y: null, inputs: 0 };
	const opts = { capture: true, passive: true };
	const touch = (e) => { if (e.touches.length >= 2) { state.y = (e.touches[0].clientY + e.touches[1].clientY) / 2; state.inputs++; } };
	const wheel = (e) => { state.y = e.clientY; state.inputs++; };
	window.addEventListener("touchstart", touch, opts);
	window.addEventListener("touchmove", touch, opts);
	window.addEventListener("wheel", wheel, opts);
	const tick = () => {
		if (!state.run) return;
		const room = document.querySelector(".tc-timeline");
		const lines = [...room.querySelectorAll(".tc-hour-mark > .tc-hour-label:not(.is-minor)")].map((l) => l.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top);
		const i = Math.min(Math.floor(${minute} / 60), lines.length - 2);
		const at = lines[i] + (lines[i + 1] - lines[i]) * ((${minute} - i * 60) / 60);
		if (state.inputs > 0) state.frames.push({ hour: Number(room.dataset.hourPx), at: +at.toFixed(2), off: +(at - state.y).toFixed(2), scroll: room.scrollTop, max: room.scrollHeight - room.clientHeight, inputs: state.inputs });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__tcAnchorFrames = () => {
		state.run = false;
		window.removeEventListener("touchstart", touch, opts);
		window.removeEventListener("touchmove", touch, opts);
		window.removeEventListener("wheel", wheel, opts);
		return state.frames;
	};
	return 1;
})()`;

/** The minute (from the day's start) the hour lines drawn now put at `y`. */
const MINUTE_AT = (y) => `(() => {
	const room = document.querySelector(".tc-timeline");
	const lines = [...room.querySelectorAll(".tc-hour-mark > .tc-hour-label:not(.is-minor)")].map((l) => l.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top);
	for (let i = 0; i + 1 < lines.length; i++) if (lines[i] <= ${y} && lines[i + 1] > ${y}) return (i + (${y} - lines[i]) / (lines[i + 1] - lines[i])) * 60;
	return null;
})()`;

/** The calendar's room as a person sees it: its box, and where its foot (the fade over the screen's foot) begins. */
const ROOM = `(() => { const room = document.querySelector(".tc-timeline"); const r = room.getBoundingClientRect(); const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height; return { top: r.top, bottom: r.bottom - foot, x: (r.left + r.right) / 2, scroll: room.scrollTop, max: room.scrollHeight - room.clientHeight }; })()`;

async function openCalendar(t, clock = "12:00") {
	await t.setClock(clock);
	await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
	await t.open();
	await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
}

/**
 * A zoom at `p`: `steps` Ctrl + wheel notches on the desktop (`dir` 1 in, -1 out), on the phone a pinch of two fingers
 * 40 px either side of `p` spread by `factor` per step's worth (`dir` 1 apart, -1 together), their centre moving `drift` px
 * on the way (the fingers moving together as they pinch).
 */
async function zoomAt(t, p, dir, steps, drift = 0) {
	if (t.platform === "phone") {
		const from = 40;
		const to = dir > 0 ? Math.min(from * (1 + steps * 0.12), 140) : from / (1 + steps * 0.12);
		const at = (d, c) => [{ x: p.x, y: c - d, id: 0 }, { x: p.x, y: c + d, id: 1 }];
		await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(from, p.y) });
		for (let i = 1; i <= 12; i++) {
			await t.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(from + ((to - from) * i) / 12, p.y + (drift * i) / 12) });
			await t.sleep(16);
		}
		await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
	} else {
		for (let i = 0; i < steps; i++) {
			await t.input.wheel(p.x, p.y, 0, dir > 0 ? -8 : 8, true);
			await t.sleep(16);
		}
	}
	/** Past the wheel's end (@use-gesture's) and the snap the zoom settles on. */
	await t.sleep(600);
}

/**
 * The minute under the pointer as the zoom begins stays within a pixel of the pointer in every frame of the zoom and after
 * it settles, wherever the calendar can still scroll; where its scroll stands at the day's start or end the day's edge
 * holds instead, with no jump between frames, and nothing moves once the gesture is over.
 */
async function anchoredZoom(t, label, p, dir, steps, { drift = 0, clampExpected = false } = {}) {
	const minute = await t.cdp.eval(MINUTE_AT(p.y));
	t.expect(minute !== null, `${label}: a minute stands under the pointer at ${p.y}`);
	if (minute === null) return;
	await t.cdp.eval(ANCHOR_FRAMES(minute));
	await zoomAt(t, p, dir, steps, drift);
	const frames = await t.cdp.eval(`window.__tcAnchorFrames()`);
	const clamped = (f) => f.scroll <= 0.5 || f.scroll >= f.max - 0.5;
	const free = frames.filter((f) => !clamped(f));
	const worst = free.reduce((w, f) => (w === null || Math.abs(f.off) > Math.abs(w.off) ? f : w), null);
	const scales = new Set(frames.map((f) => f.hour)).size;
	const jumps = frames.slice(1).map((f, i) => Math.abs(f.at - frames[i].at));
	const jump = Math.max(0, ...jumps);
	const last = frames[frames.length - 1];
	const settled = frames.filter((f) => f.inputs === last.inputs).slice(-15);
	const drift_ = settled.length ? Math.max(...settled.map((f) => Math.abs(f.at - last.at))) : 0;
	const report = { minute: +minute.toFixed(1), frames: frames.length, scales, free: free.length, clamped: frames.length - free.length, worst: worst && { off: worst.off, hour: worst.hour, scroll: worst.scroll }, jump: +jump.toFixed(2), drift: +drift_.toFixed(2), end: { off: last.off, hour: last.hour, scroll: last.scroll, max: last.max } };
	console.log(`${label}: ${JSON.stringify(report)}`);
	writeFileSync(join(t.out, `anchor-${label.replace(/\W+/g, "-")}.json`), JSON.stringify({ report, frames }));
	t.expect(scales > 3, `${label}: the zoom is seen over several frames: ${scales} scales in ${frames.length} frames`);
	/** A zoom that never needs the scroll past the day's ends holds the minute in every frame, those at an edge before it starts too. */
	const worstAll = frames.reduce((w, f) => (w === null || Math.abs(f.off) > Math.abs(w.off) ? f : w), null);
	t.expect(clampExpected || Math.abs(worstAll.off) <= 1, `${label}: the minute under the pointer stays within 1 px of it in every frame, at the day's edge too: worst ${JSON.stringify(worstAll)}`);
	t.expect(free.length > 0 && worst !== null && Math.abs(worst.off) <= 1, `${label}: the minute under the pointer stays within 1 px of it in every frame: worst ${JSON.stringify(worst)} of ${free.length} frames`);
	t.expect(jump <= 25, `${label}: the anchored minute never jumps between frames: ${jump.toFixed(1)} px`);
	t.expect(drift_ <= 1, `${label}: nothing moves once the zoom is let go: ${drift_.toFixed(2)} px`);
	if (clampExpected) t.expect(frames.some(clamped), `${label}: the zoom reaches the day's edge`);
}

/** Ctrl + wheel and pinch, in and out, near the top and near the bottom of what is seen, and fingers moving as they pinch. */
async function anchorInAndOut(t) {
	await openCalendar(t);
	const room = await t.cdp.eval(ROOM);
	const top = { x: room.x, y: room.top + 70 };
	const bottom = { x: room.x, y: room.bottom - 70 };
	await anchoredZoom(t, "in near the top", top, 1, 12);
	await anchoredZoom(t, "out near the top", top, -1, 5);
	await anchoredZoom(t, "in near the bottom", bottom, 1, 8);
	await anchoredZoom(t, "out near the bottom", bottom, -1, 5);
	if (t.platform === "phone") {
		await anchoredZoom(t, "in, the fingers moving up", { x: room.x, y: room.bottom - 120 }, 1, 6, { drift: -60 });
		await anchoredZoom(t, "out, the fingers moving down", { x: room.x, y: room.top + 90 }, -1, 4, { drift: 60 });
	}
	await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
}

/** At the day's start and end the scroll stops at the edge: zoomed out there, the edge holds, no jump, no drift after. */
async function anchorAtEdges(t) {
	await openCalendar(t);
	const room = await t.cdp.eval(ROOM);
	const top = { x: room.x, y: room.top + 70 };
	const bottom = { x: room.x, y: room.bottom - 70 };
	await t.cdp.eval(`(() => { document.querySelector(".tc-timeline").scrollTop = 0; return 1; })()`);
	await t.sleep(200);
	await anchoredZoom(t, "in at the day's start", top, 1, 8);
	await anchoredZoom(t, "out to the whole day from the day's start", top, -1, 24, { clampExpected: true });
	await anchoredZoom(t, "in again at the day's start", top, 1, 8);
	await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); room.scrollTop = room.scrollHeight; return 1; })()`);
	await t.sleep(200);
	await anchoredZoom(t, "in at the day's end", bottom, 1, 6);
	await anchoredZoom(t, "out to the whole day from the day's end", bottom, -1, 24, { clampExpected: true });
	await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
}

/** The whole day, from the room's top to where its foot begins: the label's room over the first hour equal to that under the last, and nothing to scroll but what a stack of cards runs past the day's end. */
const WHOLE_DAY = `(() => {
	const room = document.querySelector(".tc-timeline");
	const r = room.getBoundingClientRect();
	const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height;
	const first = room.querySelector('[data-hour="05"]').parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top;
	const lines = room.querySelectorAll(".tc-hour-mark > .tc-hour-line:not(.is-minor)");
	const hour = Number(room.dataset.hourPx);
	const end = lines[lines.length - 1].getBoundingClientRect().top + hour;
	const stackOver = Math.max(0, parseFloat(room.querySelector(".tc-canvas").style.getPropertyValue("--tc-stack-end")) - 24 * hour);
	return { hour, over: +(first - r.top).toFixed(2), under: +(r.bottom - foot - end).toFixed(2), scroll: room.scrollTop, max: room.scrollHeight - room.clientHeight, stackOver: +stackOver.toFixed(2) };
})()`;

/** F98: zoomed out to the whole day, the window made shorter and taller: the day keeps fitting it exactly. */
async function wholeDayRefits(t) {
	await openCalendar(t);
	const room = await t.cdp.eval(ROOM);
	const mid = { x: room.x, y: (room.top + room.bottom) / 2 };
	for (let i = 0; i < 3; i++) await zoomAt(t, mid, -1, 24);
	const fits = (w, label) => t.expect(Math.abs(w.over - w.under) <= 1 && w.max <= w.stackOver + 1, `${label}: the whole day fits exactly: ${JSON.stringify(w)}`);
	const first = await t.cdp.eval(WHOLE_DAY);
	fits(first, "zoomed out");
	const { width, height } = t.platform === "phone" ? { width: 390, height: 844 } : { width: 1280, height: 820 };
	await t.setViewport(width, height - 220);
	const shorter = await t.cdp.eval(WHOLE_DAY);
	fits(shorter, "the window shorter");
	t.expect(shorter.hour < first.hour - 5, `the window shorter, the hours shorter: ${first.hour} → ${shorter.hour}`);
	await t.setViewport(width, height + 80);
	const taller = await t.cdp.eval(WHOLE_DAY);
	fits(taller, "the window taller");
	t.expect(taller.hour > first.hour + 1, `the window taller, the hours taller: ${first.hour} → ${taller.hour}`);
	await t.shot("whole-day-refit");
	await t.setViewport(width, height);
	await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
}

/**
 * The calendar's bounds as a person sees them, the room scrolled to `to` ("start", "end" or a pixel offset): the divider
 * under the all-day band and the room's top; the first hour line and the day's end against the room's top and where its
 * foot begins (the label's room each side); what the stack runs past the day's end; and what is hit at points along the
 * band, just over the divider, the room's own things being what must never show there.
 */
const BOUNDS = (to) => `(() => {
	const room = document.querySelector(".tc-timeline");
	room.scrollTop = ${JSON.stringify(to)} === "start" ? 0 : ${JSON.stringify(to)} === "end" ? room.scrollHeight : ${JSON.stringify(to)};
	const r = room.getBoundingClientRect();
	const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height;
	const hour = Number(room.dataset.hourPx);
	const lines = [...room.querySelectorAll(".tc-hour-mark > .tc-hour-label:not(.is-minor)")].map((l) => l.parentElement.querySelector(".tc-hour-line").getBoundingClientRect().top);
	const backing = document.querySelector(".tc-allday-rows > .tc-allday-backing");
	const band = backing?.getBoundingClientRect();
	const style = backing && getComputedStyle(backing);
	const canvas = room.querySelector(".tc-canvas");
	const stackOver = Math.max(0, parseFloat(canvas.style.getPropertyValue("--tc-stack-end")) - 24 * hour);
	const over = [];
	if (band) for (let x = r.left + 2; x < r.right; x += 6) for (const y of [band.bottom - 1.5, band.bottom - 4, band.top + 2]) { const hit = document.elementFromPoint(x, y); if (hit && room.contains(hit)) over.push({ x: Math.round(x), y, hit: hit.className }); }
	return {
		hour, scroll: room.scrollTop, max: room.scrollHeight - room.clientHeight,
		roomTop: r.top, first: +(lines[0] - r.top).toFixed(2), under: +(r.bottom - foot - (lines[lines.length - 1] + hour)).toFixed(2), stackOver: +stackOver.toFixed(2),
		divider: band ? { bottom: band.bottom, width: style.borderBottomWidth, colour: style.borderBottomColor, ground: style.backgroundColor } : null,
		over: over.slice(0, 5), overCount: over.length,
	};
})()`;

/**
 * The calendar's bounds (Max, 2026-11-19: they looked random): at every zoom the scroll stops with the day's start right
 * under the all-day band's divider and the day's end where the screen's foot begins, the label's room each side and no
 * blank room beyond; zoomed out, the whole day fits exactly. The all-day rows stand on a solid band with a hairline divider,
 * the room beginning right under it: nothing of a block scrolled up shows over the divider or through the band.
 */
async function dayEndsAndBand(t) {
	await openCalendar(t);
	const lift = 7;
	const room = await t.cdp.eval(ROOM);
	const mid = { x: room.x, y: (room.top + room.bottom) / 2 };
	const check = async (label) => {
		const start = await t.cdp.eval(BOUNDS("start"));
		const end = await t.cdp.eval(BOUNDS("end"));
		console.log(`${label}: start ${JSON.stringify(start)} end ${JSON.stringify(end)}`);
		t.expect(start.divider !== null && start.divider.width === "1px" && Math.abs(start.divider.bottom - start.roomTop) <= 0.5, `${label}: the room begins right under the all-day band's hairline divider: ${JSON.stringify(start.divider)}, room at ${start.roomTop}`);
		t.expect(start.divider !== null && !/rgba\(.*, 0\)|transparent/.test(start.divider.ground), `${label}: the band is solid: ${start.divider?.ground}`);
		t.expect(Math.abs(start.first - lift) <= 1, `${label}: scrolled to the start, the day's first hour line stands the label's room under the divider: ${start.first}`);
		t.expect(Math.abs(end.under - lift - end.stackOver) <= 1, `${label}: scrolled to the end, the day ends the label's room over where the foot begins (or the stack's end does): ${end.under}, the stack ${end.stackOver} past the day`);
		for (const to of [37, 61, 140, 333]) {
			const at = await t.cdp.eval(BOUNDS(to));
			t.expect(at.overCount === 0, `${label}: scrolled ${to} px, nothing of the room shows over the divider or through the band: ${at.overCount} points, ${JSON.stringify(at.over)}`);
		}
		await t.cdp.eval(BOUNDS(300));
	};
	await check("base zoom");
	await zoomAt(t, mid, 1, 10);
	await check("zoomed in");
	await t.shot("zoomed-in-band");
	for (let i = 0; i < 3; i++) await zoomAt(t, mid, -1, 24);
	await check("whole day");
	const whole = await t.cdp.eval(BOUNDS("start"));
	t.expect(Math.abs(whole.first - lift) <= 1 && Math.abs(whole.under - lift) <= 1 && whole.max <= whole.stackOver + 1, `the whole day fills the room from the divider to the foot: ${JSON.stringify(whole)}`);
	await t.shot("whole-day-bounds");
	/** Today opened late at night or early in the morning: the now line as near half as the day's ends let it, no room kept beyond them. */
	for (const clock of ["03:40", "05:20"]) {
		await openCalendar(t, clock);
		const start = await t.cdp.eval(BOUNDS("start"));
		const end = await t.cdp.eval(BOUNDS("end"));
		t.expect(Math.abs(start.first - lift) <= 1 && Math.abs(end.under - lift - end.stackOver) <= 1, `opened at ${clock}: the day's start under the divider, its end over the foot, nothing beyond: start ${start.first}, end ${end.under}`);
	}
	await t.cdp.eval(`(() => { localStorage.clear(); return 1; })()`);
}
