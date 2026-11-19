/**
 * Step 7, slice 2: past the calendar the days (docs/plugin/screen.md, «Свайп по экрану и дни»; spec 2026-11-18, Decision
 * 65). From the day and its calendar a stroke on turns to tomorrow, the next to the day after; strokes back return day by
 * day to today and then to Soon. The strip stands; in the day's list and in its calendar the day slides out as the next
 * comes in, each as one picture (every card of the list, every block of the calendar moving by the same pixels a frame,
 * none up or down), the header and the hours standing still; each stroke one day, on the trackpad and under a finger.
 */
/** Two fingers on the trackpad, uneven as fingers are, then macOS's momentum (as e9-ribbon-follow-frames). */
const FINGERS = [
	[0, 4],
	[3, 9],
	[14, 3],
	[16, 12],
	[30, 6],
	[37, 8],
	[57, 5],
	[61, 11],
	[70, 14],
	[73, 9],
];
const MOMENTUM = [30, 30, 29, 28, 28, 27, 26, 25, 24, 23, 22, 21, 20, 18, 17, 16, 14, 13, 12, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1];
const FRAME_MS = 1000 / 120;
/** Pixels two items of one picture may part by in a frame: each is read rounded to a tenth, a clip may round a pixel. */
const ONE_PICTURE_PX = 1;

/** The frames' faults of one picture: within the day's list (cards) and within the calendar (blocks), every item seen in two frames moves by the same x, none by y. */
export function apart(frames) {
	const faults = [];
	for (let i = 1; i < frames.length; i++) {
		const before = new Map(frames[i - 1].items.map((it) => [`${it.kind}:${it.id}`, it]));
		for (const kind of ["card", "block"]) {
			const moves = frames[i].items.filter((it) => it.kind === kind && before.has(`${kind}:${it.id}`)).map((it) => ({ id: it.id, dx: it.x - before.get(`${kind}:${it.id}`).x, dy: it.y - before.get(`${kind}:${it.id}`).y }));
			if (moves.length === 0) continue;
			const xs = moves.map((m) => m.dx);
			const spread = Math.max(...xs) - Math.min(...xs);
			const rose = moves.find((m) => Math.abs(m.dy) > ONE_PICTURE_PX);
			if (spread > ONE_PICTURE_PX) faults.push({ t: frames[i].t, kind: `${kind}s apart`, spread: +spread.toFixed(1), moves: moves.slice(0, 4) });
			if (rose) faults.push({ t: frames[i].t, kind: `${kind} up or down`, ...rose });
		}
	}
	return faults;
}

export default {
	name: "e9-ribbon-days",
	features: ["Step 7: swipe the columns past the calendar (the days)"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-swipe"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);
		const hours = () => t.cdp.eval(`[...document.querySelectorAll(".tc-hour-label")].slice(0, 3).map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })`);
		const track = () => t.cdp.eval(`document.querySelector(".tc-ribbon-track").getBoundingClientRect().left`);
		const ribbon = await t.oracle.rect(".tc-ribbon");
		const strip = await track();
		const hoursBefore = JSON.stringify(await hours());
		const date = await t.cdp.eval(`(() => { const d = new Date(Date.now() - 5 * 3600_000); d.setDate(d.getDate() + 2); return d.getDate(); })()`);
		const dayAfter = (titles) => titles.length === 1 && new RegExp(`\\b${date}\\b`).test(titles[0]);

		const check = async (cast, gesture, after) => {
			/** Each item's place in its own column's room (the day's lane, the calendar's room), every frame. */
			await t.cdp.eval(`(() => { window.__tcDayFrames = []; let run = true; const tick = () => { if (!run) return; const items = []; for (const el of document.querySelectorAll(".task-calendar [data-id], .task-calendar [data-block]")) { const r = el.getBoundingClientRect(); const host = el.closest(".tc-day-lane, .tc-timeline"); if (!host) continue; const h = host.getBoundingClientRect(); if (r.right < h.left + 2 || r.left > h.right - 2 || r.bottom < h.top + 2 || r.top > h.bottom - 2) continue; items.push({ id: el.dataset.id ?? el.dataset.block, kind: el.dataset.id ? "card" : "block", x: r.left, y: r.top }); } window.__tcDayFrames.push({ t: performance.now(), items }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__tcDayStop = () => { run = false; return window.__tcDayFrames; }; return 1; })()`);
			const faults = await t.frames(gesture, { cast, maxStep: 400 });
			const frames = await t.cdp.eval("window.__tcDayStop()");
			const moved = frames.some((f, i) => i > 0 && f.items.length > 0 && frames[i - 1].items.length > 0);
			t.expect(moved, `${cast}: the day's items were seen moving`);
			const broken = apart(frames);
			t.expect(broken.length === 0, `${cast}: each column's day moves as one picture: ${JSON.stringify(broken.slice(0, 3))}`);
			t.expect(faults.length === 0, `${cast}: frames: ${JSON.stringify(faults.slice(0, 3))}`);
			t.expect(Math.abs((await track()) - strip) < 0.5, `${cast}: the strip stands at the calendar while the days turn`);
			t.expect(JSON.stringify(await hours()) === hoursBefore, `${cast}: the hours stand still: ${JSON.stringify(await hours())} against ${hoursBefore}`);
			await after();
		};

		if (t.platform === "phone") {
			const head = await t.oracle.rect(".tc-stage-col.is-day .tc-stage-head");
			const y = head.y + ribbon.height * 0.4;
			const view = await t.oracle.rect(".task-calendar");
			/**
			 * A slow finger is drawn over the headers: over a card or the calendar a finger that has barely moved when the long
			 * press is up (5 px in 250 ms) lifts what is under it, as it should; the cards are watched all the same.
			 */
			const held = (from, to) => t.input.swipe({ x: view.left + view.width * from, y: head.y }, { x: view.left + view.width * to, y: head.y }, { steps: Math.ceil((Math.abs(to - from) * view.width) / 2.5), stepMs: 12, restMs: 200 });
			const flick = (dir) => t.input.swipe({ x: view.left + view.width * (dir > 0 ? 0.7 : 0.3), y }, { x: view.left + view.width * (dir > 0 ? 0.3 : 0.7), y: y + 2 }, { steps: 6, stepMs: 12 });
			await check("held-into-tomorrow", () => held(0.9, 0.2), () => is(["Tomorrow"], "held past half-way into tomorrow and let go"));
			await check("flick-on", () => flick(1), async () => t.expect(dayAfter(await columns()), `a flick on: the day after tomorrow, one day: ${JSON.stringify(await columns())}`));
			await check("held-short", () => held(0.2, 0.4), async () => t.expect(dayAfter(await columns()), `held under half a day back and let go: the same day: ${JSON.stringify(await columns())}`));
			await flick(-1);
			await t.sleep(500);
			await is(["Tomorrow"], "a flick back: tomorrow");
			await check("flick-back", () => flick(-1), () => is(["Today"], "a flick back: today"));
			await flick(-1);
			await t.sleep(500);
			await is(["Soon", "Today"], "a flick back from today: Soon, one stop");
			return;
		}

		const at = { x: ribbon.left + ribbon.width * 0.5, y: ribbon.top + ribbon.height * 0.5 };
		/** One stroke of two fingers and its momentum, `way` 1 on, -1 back: the deltas as e9-ribbon-follow-frames sends them, each with its own time. */
		const stroke = async (way) => {
			const epoch = Date.now() / 1000;
			const t0 = performance.now();
			const send = (ms, dx) => t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: way * dx, deltaY: 0, timestamp: epoch + ms / 1000 });
			const wait = async (ms) => {
				const due = ms - (performance.now() - t0);
				if (due > 1) await t.sleep(due);
			};
			for (const [ms, dx] of FINGERS) {
				await wait(ms);
				await send(ms, dx);
			}
			const lift = FINGERS.at(-1)[0] + FRAME_MS;
			for (let i = 0; i < MOMENTUM.length; i++) {
				await wait(lift + i * FRAME_MS);
				await send(lift + i * FRAME_MS, MOMENTUM[i]);
			}
		};
		await check("stroke-on", () => stroke(1), () => is(["Tomorrow"], "a stroke on at the calendar: tomorrow"));
		await check("stroke-on-again", () => stroke(1), async () => t.expect(dayAfter(await columns()), `another: the day after tomorrow, one day: ${JSON.stringify(await columns())}`));
		await check("stroke-back", () => stroke(-1), () => is(["Tomorrow"], "a stroke back: tomorrow"));
		await check("stroke-back-again", () => stroke(-1), () => is(["Today"], "another: today"));
		await stroke(-1);
		await t.sleep(600);
		await is(["Soon", "Today"], "a stroke back from today: Soon, one stop");
		await stroke(1);
		await t.sleep(600);
		await is(["Today"], "and on again: the calendar, today");
	},
};
