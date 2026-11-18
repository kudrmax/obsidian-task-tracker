/**
 * The ribbon on the Mac trackpad (docs/plugin/screen.md, «Лента колонок», «Свайп по экрану и дни»; spec, «Phone vs
 * desktop»): each stroke turns the screen one place its way, the momentum tail nothing; past Now–calendar the days turn.
 * What is checked is what a person reads: the column titles wholly in the window.
 */
export default {
	name: "ribbon-trackpad",
	features: ["F24", "F25", "F28", "F34", "F35", "F38", "F40", "F292"],
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

		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), `opens at Now–calendar: the day's title alone over the lists, got ${JSON.stringify(await columns())}`);
		t.expect((await t.oracle.rect(".tc-seg")) !== null, "the wheel shows in two columns");

		const back = await t.frames(() => strokes(-1, 1), { cast: "stroke-back", maxStep: 400 });
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `one stroke back: Soon beside Today, got ${JSON.stringify(await columns())}`);
		t.expect(back.length === 0, `frames of a stroke back: ${JSON.stringify(back.slice(0, 5))}`);

		const shows = async (list, fileList, filter = () => true) => {
			const shown = (await t.oracle.cards(list)).slice(0, 5);
			const wanted = (await t.oracle.tasks(fileList)).filter(filter).slice(0, 5).map((task) => task.title);
			t.expect(shown.length === 5 && JSON.stringify(shown) === JSON.stringify(wanted), `${list} shows the file's first tasks in order: ${JSON.stringify(shown)} against ${JSON.stringify(wanted)}`);
		};
		await shows("soon", "Soon", (task) => !task.dated && !task.timed);
		const soon = await t.oracle.rect(".tc-stage-col.is-soon");
		const day = await t.oracle.rect(".tc-stage-col.is-day");
		t.expect(Math.abs(soon.width - day.width) <= 1, `at Soon–Now the columns split the window in half: ${soon.width} and ${day.width}`);

		await strokes(-1, 1);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), `another stroke back: Inbox over Backlog beside Soon, got ${JSON.stringify(await columns())}`);
		await shows("inbox", "Inbox");
		await shows("backlog", "Backlog");
		await strokes(-1, 1);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), "a stroke back at Inbox moves nothing");

		const tail = await t.frames(() => strokes(1, 1, { tail: 2.5, decay: 0.02 }), { cast: "long-tail", maxStep: 400 });
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `a stroke with a long momentum tail turns one place only, got ${JSON.stringify(await columns())}`);
		t.expect(tail.length === 0, `frames of a long tail: ${JSON.stringify(tail.slice(0, 5))}`);

		await strokes(1, 1);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), "on to Now–calendar");
		await strokes(1, 1);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Tomorrow"]), `a stroke on at the calendar turns to tomorrow, got ${JSON.stringify(await columns())}`);
		await strokes(-1, 1);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), "and back to today");

		const vertical = await t.frames(async () => {
			for (let i = 0; i < 20; i++) {
				void t.input.wheel(at.x, at.y, 1, 30);
				await t.sleep(16);
			}
		});
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), "a vertical scroll never turns the ribbon");
		t.expect(vertical.length === 0, `frames of a vertical scroll: ${JSON.stringify(vertical.slice(0, 5))}`);
		await t.shot("calendar");
	},
};
