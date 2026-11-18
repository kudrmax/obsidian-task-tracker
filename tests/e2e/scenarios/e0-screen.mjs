/**
 * E0, the store over the port, rendering and the long list (spec 2026-11-18, «The owners»: Screen state, Data and writes,
 * Rendering, Where things stand, Long lists): each stop shows its two columns, each list the file's tasks in the file's
 * order, the long Inbox all of them by scrolling natively; at Inbox and at Soon the two columns split the window in half.
 */
export default {
	name: "e0-screen",
	features: ["E0: store, port, rendering, layout, long lists"],
	async run(t) {
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const firstFive = async (list, fileList, keep = () => true) => {
			const shown = (await t.oracle.cards(list)).slice(0, 5);
			const wanted = (await t.oracle.tasks(fileList)).filter((task) => task.status !== "x").filter(keep).slice(0, 5).map((task) => task.title);
			t.expect(shown.length === 5 && JSON.stringify(shown) === JSON.stringify(wanted), `${list} shows the file's first tasks in order: ${JSON.stringify(shown)} against ${JSON.stringify(wanted)}`);
		};

		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), `opens at the day and its calendar: ${JSON.stringify(await columns())}`);
		await firstFive("day", "Now", (task) => !task.timed);
		await t.shot("calendar");

		await t.setStop("soon");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `Soon beside the day: ${JSON.stringify(await columns())}`);
		await firstFive("soon", "Soon", (task) => !task.dated);
		const soon = await t.oracle.rect(".tc-stage-col.is-soon");
		const day = await t.oracle.rect(".tc-stage-col.is-day");
		const view = await t.oracle.rect(".task-calendar");
		t.expect(Math.abs(soon.width - view.width / 2) <= 1 && Math.abs(day.width - view.width / 2) <= 1, `at Soon the two columns split the window in half: ${soon.width}, ${day.width} of ${view.width}`);
		await t.shot("soon");

		await t.setStop("inbox");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Soon"]), `Inbox beside Soon: ${JSON.stringify(await columns())}`);
		await firstFive("inbox", "Inbox");
		const inbox = await t.oracle.rect(".tc-stage-col.is-inbox");
		t.expect(Math.abs(inbox.width - view.width / 2) <= 1, `at Inbox the two columns split the window in half: ${inbox.width} of ${view.width}`);
		const mounted = await t.cdp.eval(`document.querySelectorAll('[data-list="inbox"] .tc-card').length`);
		const all = (await t.oracle.tasks("Inbox")).length;
		t.expect(mounted < all, `the long list mounts only the cards in sight: ${mounted} of ${all}`);
		await t.shot("inbox");

		const list = await t.oracle.rect('[data-list="inbox"]');
		const scrolled = await t.frames(async () => {
			for (let i = 0; i < 40; i++) {
				await t.input.wheel(list.x, list.y, 0, 120);
				await t.sleep(16);
			}
		}, { cast: "scroll", settleMs: 500 });
		const last = (await t.oracle.cards("inbox")).at(-1);
		const fileLast = (await t.oracle.tasks("Inbox")).at(-1)?.title;
		t.expect(last === fileLast, `scrolled to its end, the list ends with the file's last Inbox task: ${last} against ${fileLast}`);
		t.expect(scrolled.length === 0, `frames of a scroll: ${JSON.stringify(scrolled.slice(0, 4))}`);
		await t.shot("inbox-end");
	},
};
