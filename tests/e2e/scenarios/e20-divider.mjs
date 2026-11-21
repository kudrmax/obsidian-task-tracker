import { listWidths } from "../../../core/application/listWidth.ts";

const DIVIDER = 16;
const LINE = ".tc-rule-strip.is-divider .tc-divider-line";
const HANDLE = ".tc-rule-strip.is-divider .tc-divider-handle";

/** Each frame: where the divider's line stands and how wide the day's list column is, until `__tcDividerStop()`. */
const RECORD = `(() => { window.__tcDivider = []; let run = true; const tick = () => { if (!run) return; const line = document.querySelector(${JSON.stringify(LINE)}).getBoundingClientRect(); window.__tcDivider.push({ line: line.left + line.width / 2, day: document.querySelector(".tc-stage-col.is-day").getBoundingClientRect().width }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__tcDividerStop = () => { run = false; return window.__tcDivider; }; return 1; })()`;

/**
 * E2, the divider (F51–F53; docs/plugin/screen.md, «Лента колонок»; the design's «Разделитель»; CLAUDE.md, «Behaviours Max
 * had to ask for twice»): at the day and its calendar the divider sets the list's width, dragged by its handle or its line;
 * brought slowly near the middle it holds there, a fast drag passes by; it stays within the core's bounds and is kept on
 * the device; the calendar takes the rest. At Inbox and at Soon the two columns split the window in half whatever the
 * divider was set to, and between Soon and the calendar the list and the divider go from the one to the other with the
 * strip. Past the calendar a narrower list's pages still follow the fingers one to one.
 */
export default {
	name: "e20-divider",
	features: ["E2: the divider (F51–F53), halves at Inbox and Soon (Max)"],
	async run(t) {
		const phone = t.platform === "phone";
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		const view = await t.oracle.rect(".tc-ribbon");
		const half = (view.width - DIVIDER) / 2;
		/** What a person sees: the list ends where the divider's strip begins, half of it before the line. */
		const list = async () => {
			const line = await t.oracle.rect(LINE);
			return line.x - view.left - DIVIDER / 2;
		};
		const calendar = () => t.oracle.rect(".tc-stage-col.is-timeline");
		const near = (a, b, by) => Math.abs(a - b) <= by;
		/** A hand on the divider: the mouse on the desktop, a finger on the phone. */
		const drag = (from, to, pace) => (phone ? t.input.swipe(from, to, pace) : t.input.drag(from, to, pace));

		t.expect(near(await list(), half, 1), `the list opens at the middle: ${await list()} for ${half}`);
		const opened = await t.oracle.rect(HANDLE);
		t.expect(near(opened.top - (await t.oracle.rect(".tc-rule-strip.is-divider")).top, 260, 1) && near(opened.width, 10, 0.5) && near(opened.height, 52, 0.5), `the handle is the design's, 260 under the columns' top: ${JSON.stringify(opened)}`);
		await t.shot("opened");

		const narrower = Math.min(60, half - 120);
		const at = await t.oracle.rect(HANDLE);
		const by = { x: at.x - narrower, y: at.y };
		const held = await t.frames(() => drag(at, by, { steps: 12, stepMs: 20 }), { cast: "divider-drag", maxStep: 120 });
		await t.sleep(300);
		t.expect(near(await list(), half - narrower, 1.5), `dragged by its handle, the list follows the hand: ${await list()} for ${half - narrower}`);
		t.expect(near((await t.oracle.rect(HANDLE)).x, by.x, 1.5), `the handle stays under the hand: ${(await t.oracle.rect(HANDLE)).x} for ${by.x}`);
		const cal = await calendar();
		t.expect(near(cal.right, view.right, 1) && near(cal.left, view.left + (await list()) + DIVIDER / 2, 1), `the calendar takes the rest: ${cal.left}–${cal.right} of ${view.right}`);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Today"]), `a drag of the divider never swipes the ribbon: ${JSON.stringify(await t.oracle.columns())}`);
		t.expect(held.length === 0, `frames of the divider dragged: ${JSON.stringify(held.slice(0, 3))}`);

		const line = await t.oracle.rect(".tc-rule-strip.is-divider");
		const low = { x: line.x, y: line.top + line.height * 0.75 };
		await drag(low, { x: low.x + narrower - 4, y: low.y }, { steps: 40, stepMs: 40 });
		await t.sleep(400);
		t.expect(near(await list(), half, 0.5), `brought slowly near the middle by its line, it holds to the middle: ${await list()} for ${half}`);

		const middle = await t.oracle.rect(HANDLE);
		await drag(middle, { x: middle.x + 40, y: middle.y }, { steps: 4, stepMs: 10 });
		await t.sleep(400);
		t.expect(near(await list(), half + 40, 1.5), `a fast drag passes the middle by: ${await list()} for ${half + 40}`);

		const bounds = listWidths(0.5, view.width, DIVIDER);
		const wide = await t.oracle.rect(HANDLE);
		await drag(wide, { x: view.right + 200, y: wide.y }, { steps: 10, stepMs: 16 });
		await t.sleep(400);
		t.expect(near(await list(), bounds.max, 1), `the list grows no wider than the core lets it: ${await list()} for ${bounds.max}`);
		const narrow = await t.oracle.rect(HANDLE);
		await drag(narrow, { x: view.left - 200, y: narrow.y }, { steps: 10, stepMs: 16 });
		await t.sleep(400);
		t.expect(near(await list(), bounds.min, 1), `nor narrower: ${await list()} for ${bounds.min}`);

		const back = await t.oracle.rect(HANDLE);
		const set = Math.round(half - narrower);
		await drag(back, { x: back.x + set - bounds.min, y: back.y }, { steps: 16, stepMs: 16 });
		await t.sleep(400);
		t.expect(near(await list(), set, 1.5), `set again by the hand: ${await list()} for ${set}`);
		const kept = await list();
		await t.shot("set");

		/** Past the calendar the day's pages are the list's width: the page under the fingers follows them one to one. */
		const lane = await t.oracle.rect(".tc-stage-col.is-day");
		const page = () => t.cdp.eval(`Math.min(...[...document.querySelectorAll(".tc-day-lane > .tc-slide")].map((s) => s.getBoundingClientRect().left).filter((x) => x <= ${lane.left} + 1))`);
		const home = await page();
		const pulled = Math.round(lane.width * 0.3);
		if (phone) {
			/** On the day's title, as a person swipes the days: a finger held on a card would lift it. */
			const y = lane.top + 20;
			await t.input.touch("touchStart", [{ x: lane.left + lane.width * 0.8, y }]);
			for (let i = 1; i <= 20; i++) {
				await t.input.touch("touchMove", [{ x: lane.left + lane.width * 0.8 - (pulled * i) / 20, y }]);
				await t.sleep(16);
			}
			await t.sleep(120);
			t.expect(near(home - (await page()), pulled, 2), `held, the day's page is under the finger: ${home - (await page())} for ${pulled}`);
			await t.input.touch("touchEnd", []);
		} else {
			const steps = pulled / 6;
			for (let i = 0; i < steps; i++) {
				await t.input.wheel(lane.x, lane.y, 6, 0);
				await t.sleep(16);
			}
			await t.sleep(40);
			t.expect(near(home - (await page()), pulled, 7), `held, the day's page is under the fingers: ${home - (await page())} for ${pulled}`);
		}
		await t.sleep(900);
		t.expect(near(await list(), kept, 1) && near(await page(), home, 1), `let go short, the day's list is back where it was: ${await page()} for ${home}`);

		await t.setStop("soon");
		const middleRule = await t.oracle.rect(".tc-ribbon-track > .tc-rule:nth-child(4) .tc-divider-line");
		t.expect(near(middleRule.x, view.left + view.width / 2, 1), `at Soon the two columns split the window in half whatever the divider says: the line at ${middleRule.x} of ${view.width}`);
		t.expect((await t.oracle.rect(HANDLE)).left >= view.right, `and the divider's handle waits past the right edge: ${(await t.oracle.rect(HANDLE)).left}`);
		const soonCard = await t.oracle.rect('[data-list="soon"] .tc-card');
		const dayCard = await t.oracle.rect('[data-list="day"] .tc-card');
		t.expect(near(soonCard.right, view.left + half - 2, 1) && near(dayCard.left, view.left + half + DIVIDER + 2, 1), `each half the design's: Soon's cards to ${soonCard.right}, the day's from ${dayCard.left}`);
		await t.shot("soon-halves");
		await t.setStop("inbox");
		const inboxRule = await t.oracle.rect(".tc-ribbon-track > .tc-rule:nth-child(2) .tc-divider-line");
		t.expect(near(inboxRule.x, view.left + view.width / 2, 1), `and at Inbox: the line at ${inboxRule.x}`);

		/** Between Soon and the calendar the list goes from a half to the divider's width with the strip, never jumping, never back. */
		await t.setStop("soon");
		await t.cdp.eval(RECORD);
		await t.cdp.eval(`(() => { window.__tcStand.setStop("calendar"); return 1; })()`);
		await t.sleep(700);
		const frames = await t.cdp.eval("window.__tcDividerStop()");
		const backward = frames.findIndex((f, i) => i > 0 && (f.line > frames[i - 1].line + 0.5 || f.day > frames[i - 1].day + 0.5));
		t.expect(backward === -1, `the divider comes in from the right edge and the list narrows, never back: ${JSON.stringify(frames.slice(Math.max(0, backward - 1), backward + 1))}`);
		const jump = frames.findIndex((f, i) => i > 0 && frames[i - 1].line - f.line > view.width * 0.4);
		t.expect(jump === -1, `nothing jumps: ${JSON.stringify(frames.slice(Math.max(0, jump - 1), jump + 1))}`);
		t.expect(near(frames[0].line, view.right + DIVIDER / 2, 1) && near(await list(), kept, 1), `from past the right edge to the divider's width: ${frames[0].line} to ${await list()}`);

		/** Kept on the device: the screen opened again stands the divider where it was let go. */
		await t.open();
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		t.expect(near(await list(), kept, 1), `opened again, the divider stands where it was let go: ${await list()} for ${kept}`);

		if (!phone) {
			/** A window narrower than the list kept: the list drawn within the core's bounds for that window. */
			const grip = await t.oracle.rect(HANDLE);
			await drag(grip, { x: view.right + 200, y: grip.y }, { steps: 10, stepMs: 16 });
			await t.sleep(400);
			const share = (await list()) / (view.width - DIVIDER);
			await t.setViewport(700, 820);
			const small = await t.oracle.rect(".tc-ribbon");
			await t.setStop("calendar");
			const narrowView = async () => (await t.oracle.rect(LINE)).x - small.left - DIVIDER / 2;
			t.expect(near(await narrowView(), listWidths(share, small.width, DIVIDER).width, 1), `in a narrower window the list is the core's width for it: ${await narrowView()} for ${listWidths(share, small.width, DIVIDER).width}`);
		}
	},
};
