/**
 * Step 7 past the calendar, the calendar's side (Max, 2026-11-21; spec 2026-11-18, Decision 127): while the fingers hold
 * the day's list off its day the calendar stands on the shown day, unchanged and at full strength; let go onto the next
 * day, the quick switch (the old day nudged out and faded, then the new one in), never both in sight, timed by the list's
 * own landing so that the list and the calendar come to rest on the same frame; let go short, the calendar never moves.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Each frame: the left of the list's page nearest the lane's edge, the calendar's days in sight (their left and strength; a day faded out is not), and the calendar's own strength; exact. */
const RECORD = `(() => { window.__tcCal = []; let run = true; const t0 = performance.now(); const home = document.querySelector(".tc-stage-col.is-day").getBoundingClientRect().left; const tick = () => { if (!run) return; const pages = [...document.querySelectorAll(".tc-day-lane > .tc-slide")].map((s) => s.getBoundingClientRect().left); const page = pages.reduce((a, x) => (Math.abs(x - home) < Math.abs(a - home) ? x : a), Infinity); const days = [...document.querySelectorAll(".tc-stage-col.is-timeline .tc-items")].map((i) => [i.getBoundingClientRect().left, +getComputedStyle(i).opacity]).filter((d) => d[1] > 0.001); const col = document.querySelector(".tc-stage-col.is-timeline"); window.__tcCal.push({ t: performance.now() - t0, page, cal: days, opacity: +getComputedStyle(col).opacity * +getComputedStyle(col.querySelector(".tc-stage-body")).opacity }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__tcCalStop = () => { run = false; return window.__tcCal; }; return 1; })()`;

/** The first frame the calendar changes. */
const calMovesAt = (frames) => frames.findIndex((f, i) => i > 0 && JSON.stringify(f.cal) !== JSON.stringify(frames[i - 1].cal));

/** The first frame from which `value` stays as it ends. */
function restsAt(frames, value) {
	const last = JSON.stringify(value(frames.at(-1)));
	let i = frames.length - 1;
	while (i > 0 && JSON.stringify(value(frames[i - 1])) === last) i--;
	return i;
}

export default {
	name: "e9-ribbon-days-calendar",
	features: ["Step 7: the calendar as the days turn"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		const ribbon = await t.oracle.rect(".tc-ribbon");
		const lane = await t.oracle.rect(".tc-stage-col.is-day");
		const desk = !(await t.cdp.eval(`document.body.classList.contains("is-mobile")`));
		const title = () => t.cdp.eval(`[...document.querySelectorAll(".tc-day-lane .tc-slide")].map((s) => [Math.abs(s.getBoundingClientRect().left - ${lane.left}), s.querySelector(".tc-day-title")?.textContent]).sort((a, b) => a[0] - b[0])[0][1]`);

		/** A drag on by `share` of the lane, held `restMs`, then let go: past half a day it lands on tomorrow, short of it back on today. */
		const drag = async (share, restMs) => {
			if (desk) {
				const at = { x: ribbon.left + ribbon.width * 0.25, y: ribbon.top + ribbon.height * 0.5 };
				const steps = Math.ceil((lane.width * share) / 6);
				for (let i = 0; i < steps; i++) {
					await t.input.wheel(at.x, at.y, 6, 0);
					await sleep(16);
				}
				await sleep(restMs);
			} else {
				const y = lane.top + 30;
				await t.input.swipe({ x: lane.left + lane.width * 0.9, y }, { x: lane.left + lane.width * (0.9 - share), y }, { steps: Math.ceil((lane.width * share) / 3), stepMs: 12, restMs });
			}
		};

		const run = async (share, restMs) => {
			await t.cdp.eval(RECORD);
			await drag(share, restMs);
			await sleep(700);
			return t.cdp.eval("window.__tcCalStop()");
		};

		const on = await run(0.7, 60);
		t.expect(on.every((f) => f.opacity === 1), `the calendar never dims: ${JSON.stringify(on.filter((f) => f.opacity !== 1).slice(0, 2))}`);
		t.expect(on.slice(0, calMovesAt(on)).every((f) => f.cal.length === 1 && f.cal[0][1] === 1), `held, the calendar's day stands whole: ${JSON.stringify(on.slice(0, 3))}`);
		t.expect(on.every((f) => f.cal.length <= 1), `never two days in the calendar: ${JSON.stringify(on.filter((f) => f.cal.length > 1).slice(0, 2))}`);
		const pageMoves = on.findIndex((f, i) => i > 0 && f.page !== on[i - 1].page);
		const calMoves = on.findIndex((f, i) => i > 0 && JSON.stringify(f.cal) !== JSON.stringify(on[i - 1].cal));
		const held = on.slice(pageMoves, calMoves);
		t.expect(pageMoves > 0 && calMoves > pageMoves + 3, `while the list follows the fingers the calendar stands: the list moves at frame ${pageMoves}, the calendar at ${calMoves}`);
		t.expect(new Set(held.map((f) => JSON.stringify(f.cal))).size === 1, `the calendar's day stands while held: ${JSON.stringify([...new Set(held.map((f) => JSON.stringify(f.cal)))].slice(0, 3))}`);
		const listRest = restsAt(on, (f) => f.page);
		const calRest = restsAt(on, (f) => f.cal);
		t.expect(listRest === calRest, `the list and the calendar come to rest on the same frame: ${listRest} and ${calRest}`);
		t.expect((await title()) === "Tomorrow", `the list shows tomorrow: ${await title()}`);
		console.log(`e9-ribbon-days-calendar: held ${held.length} frames, the change ${(on[calRest].t - on[calMoves].t).toFixed(0)} ms, the list and the calendar at rest on frame ${listRest} and ${calRest}`);

		const back = await run(0.2, 120);
		const still = new Set(back.map((f) => JSON.stringify(f.cal)));
		t.expect(still.size === 1 && back.every((f) => f.opacity === 1), `held short and let go, the calendar never moves nor dims: ${JSON.stringify([...still].slice(0, 3))}`);
		t.expect((await title()) === "Tomorrow", `the list stays on tomorrow: ${await title()}`);
	},
};
