/**
 * E0, the ribbon on the Mac trackpad (spec, «Gestures that are not drag»; stage 0 round six): each stroke turns the screen
 * one stop its way at once, the momentum tail nothing, a vertical scroll nothing; past the day's calendar the days turn,
 * the day sliding in as one region from the side it comes from. What is checked is what a person reads.
 */
export default {
	name: "e0-ribbon-trackpad",
	features: ["E0: ribbon (trackpad), Slide"],
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
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);

		await is(["Today"], "opens at the day and its calendar");
		const back = await t.frames(() => strokes(-1, 1), { cast: "stroke-back", maxStep: 400, monotonic: "x" });
		await is(["Soon", "Today"], "one stroke back: Soon beside the day");
		t.expect(back.length === 0, `frames of a stroke back: ${JSON.stringify(back.slice(0, 5))}`);
		await strokes(-1, 1);
		await is(["Inbox", "Soon"], "another stroke back: Inbox beside Soon");
		await strokes(-1, 1);
		await is(["Inbox", "Soon"], "a stroke back at Inbox moves nothing");

		const tail = await t.frames(() => strokes(1, 1, { tail: 2.5, decay: 0.02 }), { cast: "long-tail", maxStep: 400, monotonic: "x" });
		await is(["Soon", "Today"], "a stroke with a long momentum tail turns one stop only");
		t.expect(tail.length === 0, `frames of a long tail: ${JSON.stringify(tail.slice(0, 5))}`);
		await strokes(1, 1);
		await is(["Today"], "on to the day's calendar");

		let mid = null;
		const day = await t.frames(async () => {
			const stroke = t.input.stroke(at.x, at.y, 1);
			await t.sleep(90);
			mid = await t.cdp.eval(`[...document.querySelectorAll(".tc-day-title")].map((e) => e.textContent)`);
			await stroke;
			await t.sleep(750);
		}, { cast: "day-slide", maxStep: 400, monotonic: "x" });
		t.expect(JSON.stringify(mid) === JSON.stringify(["Today", "Tomorrow"]), `mid-slide the day going out still shows its own title beside the day coming in: ${JSON.stringify(mid)}`);
		await is(["Tomorrow"], "a stroke on at the calendar turns to tomorrow");
		t.expect(day.length === 0, `frames of the day sliding: ${JSON.stringify(day.slice(0, 5))}`);
		await strokes(-1, 1);
		await is(["Today"], "and back to today");

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
