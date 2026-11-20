/**
 * Step 7 past the calendar, the calendar's side (Max, 2026-11-21: «не красиво, колхозно»; spec 2026-11-18, Decision 127):
 * while the fingers hold the day's list off its day the calendar keeps the shown day where it stands, dimmed; as they let
 * go and the list lands on the next day, the calendar changes day in that same frame or the next, the old day going out
 * before the new one comes in, never two days at once; held short and let go, it brightens on the same day.
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FRAME_MS = 1000 / 60;

export default {
	name: "e9-ribbon-days-calendar",
	features: ["Step 7: the calendar as the days turn"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-swipe"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		const ribbon = await t.oracle.rect(".tc-ribbon");
		const lane = await t.oracle.rect(".tc-stage-col.is-day");
		const desk = !(await t.cdp.eval(`document.body.classList.contains("is-mobile")`));
		const record = () =>
			t.cdp.eval(`(() => { window.__tcCal = []; let run = true; const t0 = performance.now(); const tick = () => { if (!run) return; const col = document.querySelector(".tc-stage-col.is-timeline"); const items = [...col.querySelectorAll(".tc-items")]; const block = col.querySelector(".tc-items [data-block]"); const r = block ? block.getBoundingClientRect() : null; window.__tcCal.push({ t: performance.now() - t0, days: items.length, x: r ? Math.round(r.left * 10) / 10 : null, o: items[0] ? +getComputedStyle(items[0]).opacity : null, body: +getComputedStyle(col.querySelector(".tc-stage-body")).opacity }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__tcCalStop = () => { run = false; return window.__tcCal; }; return 1; })()`);
		const stop = () => t.cdp.eval("window.__tcCalStop()");
		const title = () => t.cdp.eval(`document.querySelector(".tc-stage-col.is-timeline") && [...document.querySelectorAll(".tc-day-lane .tc-slide")].map((s) => [Math.abs(s.getBoundingClientRect().left - ${lane.left}), s.querySelector(".tc-day-title")?.textContent]).sort((a, b) => a[0] - b[0])[0][1]`);

		/** A slow drag on, held, then let go: past half a day it lands on tomorrow, short of it back on today. */
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

		await record();
		await drag(0.7, 60);
		await sleep(700);
		const on = await stop();
		const held = on.filter((f) => f.body < 0.99 && f.days === 1 && f.o === 1);
		t.expect(held.length > 3, `while held the calendar dims: ${JSON.stringify(on.slice(0, 6))}`);
		const xs = new Set(held.map((f) => f.x));
		t.expect(xs.size === 1, `while held the calendar's day stands: ${JSON.stringify([...xs])}`);
		t.expect(on.every((f) => f.days <= 1), `never two days in the calendar: ${JSON.stringify(on.filter((f) => f.days > 1).slice(0, 2))}`);
		const brighten = on.findIndex((f, i) => i > 0 && f.body > on[i - 1].body + 0.001);
		const change = on.findIndex((f) => f.o !== null && f.o < 1);
		t.expect(brighten > 0 && change > 0, `it brightens and changes day: brighten ${brighten}, change ${change}`);
		t.expect(Math.abs(on[change].t - on[brighten].t) <= FRAME_MS + 1, `the calendar changes day within a frame of the list letting go: ${(on[change].t - on[brighten].t).toFixed(1)} ms`);
		const shown = on.findIndex((f, i) => i > change && f.o === 1);
		console.log(`e9-ribbon-days-calendar: held ${held.length} frames at x ${[...xs][0]}, day changes ${(on[change].t - on[brighten].t).toFixed(1)} ms from letting go, new day whole ${(on[shown].t - on[change].t).toFixed(0)} ms later`);
		t.expect(on.at(-1).o === 1 && on.at(-1).body === 1, `and stands bright on the new day: ${JSON.stringify(on.at(-1))}`);
		t.expect((await title()) === "Tomorrow", `the list shows tomorrow: ${await title()}`);

		await record();
		await drag(0.2, 120);
		await sleep(600);
		const back = await stop();
		t.expect(back.some((f) => f.body < 0.99), `held short, the calendar dims: ${JSON.stringify(back.slice(0, 4))}`);
		t.expect(back.every((f) => f.days === 1 && f.o === 1), `and changes no day: ${JSON.stringify(back.filter((f) => f.days !== 1 || f.o !== 1).slice(0, 2))}`);
		t.expect(back.at(-1).body === 1, `let go, it brightens again: ${back.at(-1).body}`);
		t.expect((await title()) === "Tomorrow", `the list stays on tomorrow: ${await title()}`);
	},
};
