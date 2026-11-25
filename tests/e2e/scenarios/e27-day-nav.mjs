/**
 * Day navigation (docs/plugin/screen.md, «Свайп по экрану и дни»; F41–F48; Decision 146): the day's arrows and its title
 * turn the day as a swipe does, on the same day turn (Decision 127). The arrows stand still while the pages turn; a tap
 * while the day turns waits its turn and the days go by one by one; the title goes back to today in one page from however
 * far; the arrow back from today reaches yesterday; a finger on the turning day takes it where it shows and drops the
 * taps waiting. The oracle: the titles a person sees, frame by frame, and the calendar's own day (its now line on today).
 */

/** Every frame's day titles a person sees in the day's column, and the arrows' places. */
const RECORD = `(() => {
	window.__tcNav = [];
	let run = true;
	const lane = () => document.querySelector(".tc-stage-col.is-day");
	const tick = () => {
		if (!run) return;
		const col = lane();
		const box = col?.getBoundingClientRect();
		const seen = box ? [...col.querySelectorAll(".tc-slide")].map((page) => { const r = page.getBoundingClientRect(); return { title: page.querySelector(".tc-day-title")?.textContent.trim() ?? "", width: Math.min(r.right, box.right) - Math.max(r.left, box.left) }; }).filter((p) => p.width > 2) : [];
		const titles = seen.map((p) => p.title);
		const most = seen.sort((a, b) => b.width - a.width)[0]?.title ?? null;
		const arrows = [...document.querySelectorAll(".tc-day-nav .tc-arrow")].map((el) => Math.round(el.getBoundingClientRect().left));
		const pages = box ? [...col.querySelectorAll(".tc-slide")].map((page) => ({ title: page.querySelector(".tc-day-title")?.textContent.trim() ?? "", left: Math.round(page.getBoundingClientRect().left) })) : [];
		window.__tcNav.push({ titles, most, arrows, pages });
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	window.__tcNavStop = () => { run = false; return window.__tcNav; };
	return 1;
})()`;

/**
 * Frames where a page changed its day without moving (review of batch A, finding 4: a line changed under the eye): a page
 * standing where a page stood the frame before, showing another day.
 */
export const swapped = (frames) =>
	frames.flatMap((frame, i) => (i === 0 ? [] : frame.pages.filter((page) => frames[i - 1].pages.some((was) => Math.abs(was.left - page.left) <= 1 && was.title !== page.title)).map((page) => ({ i, ...page }))));

/** The days in order a run of frames showed, each once: a day seen again after another is listed again. */
const passed = (frames) => frames.map((f) => f.most).filter((title, i, all) => title !== null && (i === 0 || all[i - 1] !== title));

export default {
	name: "e27-day-nav",
	features: ["F41", "F42", "F43", "F45", "F46", "F47", "F48"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("calendar");
		const titles = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const center = async (selector) => {
			const r = await t.oracle.rect(selector);
			return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		};
		const press = async (label) => {
			const at = await center(`.tc-day-nav .tc-arrow[aria-label="${label}"]`);
			if (t.platform === "phone") await t.input.tap(at.x, at.y);
			else await t.input.click(at.x, at.y);
		};
		const backToToday = async () => {
			const at = await t.cdp.eval(`(() => { const box = document.querySelector(".tc-day-lane").getBoundingClientRect(); const page = [...document.querySelectorAll(".tc-day-lane > .tc-slide")].sort((a, b) => Math.abs(a.getBoundingClientRect().left - box.left) - Math.abs(b.getBoundingClientRect().left - box.left))[0]; const r = page.querySelector(".tc-day-title").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			if (t.platform === "phone") await t.input.tap(at.x, at.y);
			else await t.input.click(at.x, at.y);
		};
		const hasNow = () => t.cdp.eval(`!!document.querySelector(".tc-stage-col.is-timeline .tc-now")`);
		/** Whether the calendar, once at rest, draws the now line: today's alone has it. */
		const nowLine = async () => {
			await t.sleep(400);
			return hasNow();
		};
		const date = (shift) => t.cdp.eval(`(() => { const d = new Date(Date.now() - 5 * 3600_000); d.setDate(d.getDate() + ${shift}); return d.getDate(); })()`);
		const isDay = async (shift, what) => {
			const shown = await t.waitFor(async () => {
				const now = await titles();
				return now.length === 1 && (shift === 0 ? now[0] === "Today" : shift === 1 ? now[0] === "Tomorrow" : shift === -1 ? now[0] === "Yesterday" : new RegExp(`\\b${await date(shift)}\\b`).test(now[0])) ? now : null;
			}, 3000);
			t.expect(!!shown, `${what}: the day ${shift} from today, not ${JSON.stringify(await titles())}`);
		};
		const hours = () => t.cdp.eval(`JSON.stringify([...document.querySelectorAll(".tc-hour-label")].slice(0, 3).map((el) => Math.round(el.getBoundingClientRect().top)))`);
		const hoursBefore = await hours();

		const record = async (gesture) => {
			await t.cdp.eval(RECORD);
			await gesture();
			await t.sleep(900);
			return t.cdp.eval("window.__tcNavStop()");
		};

		const one = await record(() => press("Next day"));
		await isDay(1, "Next day");
		t.expect(!(await nowLine()), "Next day: the calendar is tomorrow's too, no now line (F48)");
		t.expect(one.every((f) => f.arrows[0] === one[0].arrows[0]), `the arrow back stands still while the day turns: ${JSON.stringify([...new Set(one.map((f) => f.arrows[0]))])}`);
		t.expect(new Set(one.map((f) => f.arrows[1])).size <= 2, `the arrow on moves once, to the end of the new day's title, never with the pages: ${JSON.stringify([...new Set(one.map((f) => f.arrows[1]))])}`);
		t.expect(one.some((f) => f.titles.length === 2), "the day turned as a page: both days' titles were in sight on some frame");
		t.expect((await hours()) === hoursBefore, "the hours stand still");

		await press("Previous day");
		await isDay(0, "Previous day");
		t.expect(await nowLine(), "back on today: the now line");

		const queue = await record(async () => {
			await press("Next day");
			await t.sleep(60);
			await press("Next day");
			await t.sleep(60);
			await press("Next day");
		});
		await isDay(3, "three quick taps on Next day");
		const queuedDays = passed(queue);
		t.expect(queuedDays.length === 4 && queuedDays[0] === "Today" && queuedDays[1] === "Tomorrow", `three quick taps: the days go by one by one (F46): ${JSON.stringify(queuedDays)}`);

		await press("Next day");
		await isDay(4, "Next day again");
		await t.sleep(600);
		const home = await record(() => backToToday());
		await isDay(0, "the title tapped");
		const homeDays = passed(home);
		t.expect(homeDays.length === 2 && homeDays[1] === "Today", `back to today from four days on is one page, no day between (F45): ${JSON.stringify(homeDays)}`);
		const homeAgain = await record(() => backToToday());
		t.expect(passed(homeAgain).length === 1, "today's title tapped does nothing");

		await press("Previous day");
		await isDay(-1, "Previous day from today");
		t.expect(!(await nowLine()), "yesterday's calendar has no now line");
		await backToToday();
		await isDay(0, "back from yesterday");

		const key = async (code) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: code, code, windowsVirtualKeyCode: code === "ArrowLeft" ? 37 : 39 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: code, code, windowsVirtualKeyCode: code === "ArrowLeft" ? 37 : 39 });
		};
		const stopOf = async () => (await t.stand("debug()"))[0].stop;
		const ribbon = await t.oracle.rect(".tc-ribbon");
		const swipeBack = async () => {
			if (t.platform === "phone") {
				const y = ribbon.top + ribbon.height * 0.6;
				await t.input.swipe({ x: ribbon.left + ribbon.width * 0.3, y }, { x: ribbon.left + ribbon.width * 0.7, y: y + 2 }, { steps: 6, stepMs: 12 });
				return;
			}
			const at = { x: ribbon.left + ribbon.width * 0.5, y: ribbon.top + ribbon.height * 0.5 };
			for (let i = 0; i < 14; i++) {
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at.x, y: at.y, deltaX: -24, deltaY: 0 });
				await t.sleep(8);
			}
		};
		const noSwap = (frames, what) => {
			const faults = swapped(frames);
			t.expect(faults.length === 0, `${what}: no page changes its day without moving (finding 4): ${JSON.stringify(faults.slice(0, 3))}`);
		};

		await press("Previous day");
		await isDay(-1, "to yesterday again");
		await t.sleep(400);
		const keyed = await record(() => key("ArrowLeft"));
		await t.sleep(300);
		t.expect((await stopOf()) === "soon", `← on yesterday's calendar: Soon and the day (finding 4a): ${await stopOf()}`);
		t.expect(await nowLine(), "← on yesterday's calendar: the calendar switched to today on the way (finding 4a)");
		noSwap(keyed, "← on yesterday's calendar");
		t.expect(passed(keyed).at(-1) === "Today", `at Soon the day's list is today's: ${JSON.stringify(passed(keyed))}`);

		await t.setStop("soon");
		const fromSoon = await record(() => press("Previous day"));
		await isDay(-1, "Previous day from Soon");
		noSwap(fromSoon, "the back arrow at Soon (finding 4c)");
		t.expect(fromSoon[0]?.most === "Today" || passed(fromSoon)[0] === "Today", `the back arrow at Soon starts from today's page in sight: ${JSON.stringify(passed(fromSoon))}`);

		await t.sleep(400);
		const swiped = await record(swipeBack);
		await t.sleep(400);
		t.expect((await stopOf()) === "soon", `a swipe back from yesterday's calendar: Soon (finding 4b): ${await stopOf()}`);
		noSwap(swiped, "a swipe back from yesterday (finding 4b)");
		await t.setStop("calendar");

		if (t.platform === "phone") {
			const lane = await t.oracle.rect(".tc-day-lane");
			await press("Next day");
			await t.sleep(40);
			await press("Next day");
			await t.sleep(60);
			const y = lane.top + lane.height * 0.6;
			await t.input.swipe({ x: lane.left + lane.width * 0.5, y }, { x: lane.left + lane.width * 0.55, y }, { steps: 4, stepMs: 16 });
			await t.sleep(900);
			const caught = await titles();
			t.expect(caught.length === 1 && (caught[0] === "Today" || caught[0] === "Tomorrow"), `a finger on the turning day takes it where it shows; the tap waiting is dropped (F47): ${JSON.stringify(caught)}`);
		}
	},
};
