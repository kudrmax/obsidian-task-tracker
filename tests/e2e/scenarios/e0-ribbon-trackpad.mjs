/**
 * E0, the ribbon on the Mac trackpad (spec, «Gestures that are not drag»; stage 0 round six): each stroke turns the screen
 * one stop its way, the momentum tail nothing, a vertical scroll nothing; past the day's calendar the days turn, the
 * day's list as a page with its header, the next day's page beside it (Decision 127). What is checked is what a person reads.
 *
 * The strokes carry macOS's own times (`Input.stroke`), so a loaded machine never makes the gesture another one; the place
 * each stroke lands on is checked on every run. Without macOS's touch and lift the page reads the lift from @use-gesture's
 * wheel end, a timer on the page's clock: when the browser hands the page a stroke's events later than that end (a
 * delivery stall under load, `deliveryStalled`), the columns let go and the same stroke takes them on again as its events
 * arrive (Decision 129, 11), one place all the same. Such a stroke's frames show the stall, not the ribbon, so they are
 * held to the jumps only, not to going one way.
 */

/** @use-gesture's wheel end: this long without an event the page takes the fingers as gone. */
const WHEEL_END_MS = 140;
export default {
	name: "e0-ribbon-trackpad",
	features: ["E0: ribbon (trackpad), the day turn"],
	platforms: ["desktop"],
	async run(t) {
		const view = await t.oracle.rect(".task-calendar");
		const at = { x: view.left + view.width * 0.3, y: view.top + view.height * 0.5 };
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const strokes = async (dir, n, opts) => {
			for (let i = 0; i < n; i++) {
				await t.input.stroke(at.x, at.y, dir, opts);
				await t.sleep(350);
			}
			await t.sleep(400);
		};
		/** A gesture's frames, checked for going one way only when the page got its events in time (see above). */
		const strokeFrames = async (gesture, options) => {
			await t.cdp.eval(`(() => { window.__tcArrivals = []; window.__tcArrive ??= (e) => window.__tcArrivals.push(performance.now()); window.addEventListener("wheel", window.__tcArrive, { capture: true, passive: true }); return 1; })()`);
			const faults = await t.frames(gesture, options);
			const arrivals = await t.cdp.eval(`(() => { window.removeEventListener("wheel", window.__tcArrive, { capture: true }); return window.__tcArrivals; })()`);
			const stalled = arrivals.slice(1).some((a, i) => a - arrivals[i] >= WHEEL_END_MS);
			return stalled ? faults.filter((f) => f.kind !== "went back") : faults;
		};
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);

		await is(["Today"], "opens at the day and its calendar");
		const back = await strokeFrames(() => strokes(-1, 1), { cast: "stroke-back", maxStep: 400, monotonic: "x" });
		await is(["Soon", "Today"], "one stroke back: Soon beside the day");
		t.expect(back.length === 0, `frames of a stroke back: ${JSON.stringify(back.slice(0, 5))}`);
		await strokes(-1, 1);
		await is(["Inbox", "Soon"], "another stroke back: Inbox beside Soon");
		await strokes(-1, 1);
		await is(["Inbox", "Soon"], "a stroke back at Inbox moves nothing");

		const tail = await strokeFrames(() => strokes(1, 1, { tail: 2.5, decay: 0.02 }), { cast: "long-tail", maxStep: 400, monotonic: "x" });
		await is(["Soon", "Today"], "a stroke with a long momentum tail turns one stop only");
		t.expect(tail.length === 0, `frames of a long tail: ${JSON.stringify(tail.slice(0, 5))}`);
		await strokes(1, 1);
		await is(["Today"], "on to the day's calendar");

		const day = await strokeFrames(() => strokes(1, 1), { cast: "day-slide", maxStep: 400, monotonic: "x" });
		await is(["Tomorrow"], "a stroke on at the calendar turns to tomorrow");
		t.expect(day.length === 0, `frames of the day sliding: ${JSON.stringify(day.slice(0, 5))}`);
		await strokes(-1, 1);
		await is(["Today"], "and back to today");

		/** Mid-turn (turned by the key, so no probe runs inside a stroke's stream) the page going out still shows its own day, the page coming in beside it. */
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
		await t.sleep(60);
		const mid = await t.cdp.eval(`[...document.querySelectorAll(".tc-day-lane .tc-day-title")].map((e) => e.textContent)`);
		t.expect(mid.indexOf("Tomorrow") === mid.indexOf("Today") + 1 && mid.indexOf("Today") >= 0, `mid-turn the day going out still shows its own title beside the day coming in: ${JSON.stringify(mid)}`);
		await t.sleep(700);
		await strokes(-1, 1);
		await is(["Today"], "back to today again");

		const vertical = await t.frames(async () => {
			for (let i = 0; i < 20; i++) {
				void t.input.wheel(at.x, at.y, 1, 30);
				await t.sleep(16);
			}
		});
		await is(["Today"], "a vertical scroll never turns the ribbon");
		t.expect(vertical.length === 0, `frames of a vertical scroll: ${JSON.stringify(vertical.slice(0, 5))}`);
	},
};
