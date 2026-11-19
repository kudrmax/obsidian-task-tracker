import { calendarTools } from "../lib/calendar.mjs";

/**
 * Every frame of the calendar while a press on its empty time ends, sampled in the page on each animation frame: whether
 * the calendar is there and seen (its room, its canvas, their opacity and visibility up to the page, its hour lines in
 * sight), where it is scrolled, and whether the new task's dashed place or its field stands on it. Read from the DOM as it
 * is painted.
 */
const SAMPLER = String.raw`(() => {
	const state = { frames: [], run: true, t0: performance.now() };
	const seen = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none") return 0; o *= +cs.opacity; } return +o.toFixed(2); };
	const tick = () => {
		if (!state.run) return;
		const room = document.querySelector(".tc-timeline");
		const canvas = room?.querySelector(".tc-canvas");
		const r = room?.getBoundingClientRect();
		const lines = !room ? 0 : [...room.querySelectorAll(".tc-hour-line")].filter((l) => { const b = l.getBoundingClientRect(); return b.top >= r.top && b.top <= r.bottom && seen(l) > 0.99; }).length;
		state.frames.push({
			t: Math.round(performance.now() - state.t0),
			room: !!room && r.width > 0 && r.height > 0,
			canvas: canvas ? seen(canvas) : 0,
			lines,
			scroll: room ? Math.round(room.scrollTop) : null,
			slot: !!document.querySelector(".tc-block.is-new-slot"),
			field: !!document.querySelector(".tc-calendar-entry"),
		});
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__tcCalendarFrames = { stop: () => { state.run = false; return state.frames; } };
	return 1;
})()`;

/**
 * E3, a press on the calendar's empty time (F101) as the plugin's long tap, the clock at noon. A press that moves before
 * it was held (the mouse dragged at once, a finger sliding) is no long tap: no new task's place, nothing written. A press
 * held still and let go opens the field there, and the calendar stays on the screen every frame from the release until
 * the field (Max, 2026-11-19: the calendar's column flashed white before the purple field). Held, then moved, the place
 * follows the pointer by the snap step, its start written on it, as the carried plus's does, and let go the field opens
 * at that time.
 */
export default {
	name: "e8-calendar-press",
	features: ["E3: a press on empty time is a long tap: moved first, nothing; held, the place follows; let go, the field, the calendar seen every frame (F101)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		await cal.scrollTo(12 * 60, 120);
		await t.sleep(300);
		const placeTime = () => t.cdp.eval(`document.querySelector(".tc-block.is-new-slot .tc-slot-time")?.textContent ?? null`);
		const fieldTime = () => t.cdp.eval(`document.querySelector(".tc-calendar-entry .tc-field-time")?.textContent ?? null`);
		const focused = () => t.cdp.eval(`!!document.activeElement?.closest(".tc-calendar-entry")`);
		const record = () => t.cdp.eval(SAMPLER);
		const frames = () => t.cdp.eval(`window.__tcCalendarFrames.stop()`);
		const pointAt = async (minute) => {
			const line = await cal.lineAt(minute);
			return { line, p: { x: line.room.left + (line.room.right - line.room.left) * 0.6, y: line.y + 4 } };
		};
		const escape = async () => {
			await cal.key("Escape", "Escape", 27);
			await t.sleep(300);
		};

		/**
		 * (a) Pressed and swiped at once (60 px in about a tenth of a second, well before the long press's time): no place, no
		 * field, nothing written. A finger's swipe scrolls the calendar natively.
		 */
		const before = await cal.file();
		const { p: from } = await pointAt(16 * 60);
		await record();
		const swiped = await cal.pull(from, { x: from.x, y: from.y - 60 }, { holdMs: 0, steps: 8, stepMs: 12 });
		await swiped();
		const swipeFrames = await frames();
		const placed = swipeFrames.filter((f) => f.slot || f.field).length;
		t.expect(placed === 0, `a press moved at once is no long tap: no new task's place or field in any of its ${swipeFrames.length} frames (${placed} had one)`);
		t.expect(!(await focused()) && (await cal.file()) === before, "a press moved at once opens no field and writes nothing");
		await escape();
		await cal.scrollTo(12 * 60, 120);
		await t.sleep(300);

		/**
		 * (b) Held and let go: the field opens there, the calendar seen in every frame from the release on. The hand drifts
		 * 3 px while it holds, as a hand does, inside the long press's tolerance: still a hold, not a move.
		 */
		const { p: still } = await pointAt(17 * 60);
		const held = await cal.pull(still, { x: still.x + 2, y: still.y + 2 }, { holdMs: 450, steps: 2 });
		const heldTime = await placeTime();
		t.expect(heldTime === "22:00", `a press held still lifts the new task's place at its time: «${heldTime}»`);
		await record();
		await held();
		const releaseFrames = await frames();
		const opened = releaseFrames.findIndex((f) => f.field);
		const gone = releaseFrames.filter((f) => !f.room || f.canvas < 0.99 || f.lines === 0);
		const jumped = releaseFrames.filter((f, i) => i > 0 && f.scroll !== releaseFrames[i - 1].scroll);
		t.expect(opened >= 0, `held and let go, the field opens (${releaseFrames.length} frames)`);
		t.expect(gone.length === 0, `the calendar is seen in every frame from the release to the field: ${gone.length} of ${releaseFrames.length} frames without it ${JSON.stringify(gone.slice(0, 3))}`);
		t.expect(jumped.length === 0, `the calendar does not scroll as the field opens: ${JSON.stringify(jumped.slice(0, 3))}`);
		t.expect((await fieldTime()) === "22:00" && (await focused()), `the field stands at 22:00 with the focus: «${await fieldTime()}»`);
		await t.shot("held-field");
		await escape();

		/** (c) Held, then moved: the place follows by the snap step, its start on it; let go, the field at that time, the calendar seen every frame. */
		const { line: hold, p: start } = await pointAt(18 * 60);
		await record();
		const carried = await cal.pull(start, { x: start.x, y: start.y + hold.hour / 2 }, { holdMs: 450 });
		const followed = await placeTime();
		await t.shot("held-moved");
		await carried();
		const moveFrames = await frames();
		const lost = moveFrames.filter((f) => !f.room || f.canvas < 0.99 || f.lines === 0);
		t.expect(followed === "23:30", `held then moved half an hour, the place follows and writes 23:30: «${followed}»`);
		t.expect(lost.length === 0, `the calendar is seen in every frame of the hold, the move and the release: ${lost.length} of ${moveFrames.length} frames without it`);
		t.expect((await fieldTime()) === "23:30" && (await focused()), `let go, the field opens at 23:30: «${await fieldTime()}»`);
		await t.cdp.send("Input.insertText", { text: "Вечерний чай" });
		await cal.key("Enter", "Enter", 13);
		await t.sleep(500);
		const tea = await cal.timeOf("Вечерний чай");
		t.expect(tea?.start === 18 * 60 + 30 && tea.end === null, `written at 23:30 without a length: ${JSON.stringify(tea)}`);
	},
};
