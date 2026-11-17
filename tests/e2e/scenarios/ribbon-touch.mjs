/**
 * The ribbon under a finger on the phone (docs/plugin/screen.md, «Свайп по экрану и дни»; CLAUDE.md, «Behaviours Max had to
 * ask for twice»): it follows the finger, never past the neighbour; let go it goes on if it passed half-way or was
 * flicked, else comes back; one swipe is exactly one step from the first swipe; a vertical drag scrolls a list.
 */
export default {
	name: "ribbon-touch",
	features: ["F9", "F24", "F25", "F27", "F30", "F35", "F36", "F37"],
	platforms: ["phone"],
	async run(t) {
		const view = await t.oracle.rect(".task-calendar");
		const y = view.top + view.height * 0.45;
		const columns = () => t.oracle.columns();
		const flick = (dir) => t.input.swipe({ x: view.left + view.width * (dir > 0 ? 0.7 : 0.3), y }, { x: view.left + view.width * (dir > 0 ? 0.3 : 0.7), y: y + 4 }, { steps: 6, stepMs: 12 });

		const first = await t.frames(() => flick(-1), { cast: "first-flick", maxStep: 260 });
		await t.sleep(500);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `the first flick after opening moves exactly one place: ${JSON.stringify(await columns())}`);
		t.expect(first.length === 0, `frames of the first flick: ${JSON.stringify(first.slice(0, 3))}`);

		await flick(-1);
		await t.sleep(600);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), `a second flick, one more: ${JSON.stringify(await columns())}`);

		const rubber = await t.frames(() => flick(-1), { maxStep: 260 });
		await t.sleep(500);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), "past Inbox the screen gives and springs back");
		t.expect(rubber.length === 0, `frames of the rubber band: ${JSON.stringify(rubber.slice(0, 3))}`);

		const short = await t.frames(() => t.input.swipe({ x: view.left + view.width * 0.6, y }, { x: view.left + view.width * 0.45, y }, { steps: 30, stepMs: 25, restMs: 150 }), { cast: "slow-short", follow: { tolerance: 3, until: 60 } });
		await t.sleep(500);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), `a slow drag short of half-way comes back: ${JSON.stringify(await columns())}`);
		t.expect(short.length === 0, `the screen follows the finger: ${JSON.stringify(short.slice(0, 3))}`);

		await t.input.swipe({ x: view.left + view.width * 0.85, y }, { x: view.left + view.width * 0.1, y }, { steps: 40, stepMs: 25, restMs: 150 });
		await t.sleep(600);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `a slow drag past half-way moves one place: ${JSON.stringify(await columns())}`);

		await flick(1);
		await t.sleep(90);
		await flick(1);
		await t.sleep(700);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Tomorrow"]), `two quick flicks on, the second during the landing: two steps, to tomorrow's calendar: ${JSON.stringify(await columns())}`);
		await flick(-1);
		await t.sleep(600);

		const list = await t.oracle.rect('[data-list="day"]');
		const before = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		const scroll = await t.frames(() => t.input.swipe({ x: list.x, y: list.top + list.height * 0.7 }, { x: list.x + 6, y: list.top + list.height * 0.2 }, { steps: 12, stepMs: 16 }), { cast: "vertical" });
		await t.sleep(400);
		const after = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		t.expect(after > before + 100, `a vertical drag scrolls the list: ${before} → ${after}`);
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Today"]), "and moves no place");
		t.expect(scroll.length === 0, `frames of a scroll: ${JSON.stringify(scroll.slice(0, 3))}`);
		const faded = await t.cdp.eval(`document.querySelector('[data-list="day"]').classList.contains("is-under-top")`);
		t.expect(faded, "scrolled, the list fades under its top edge");
	},
};
