/**
 * The window changes its width (a pane split, a window dragged narrower): the ribbon stands on its place at the new width,
 * its columns fill the window exactly, and the divider keeps its share (docs/plugin/settings.md: the list's width is kept
 * as a share of the window).
 */
export default {
	name: "resize",
	features: ["F25", "F53"],
	platforms: ["desktop"],
	async run(t) {
		const fits = async (label) => {
			const view = await t.oracle.rect(".task-calendar");
			const day = await t.oracle.rect(".tc-stage-col.is-day");
			const timeline = await t.oracle.rect(".tc-stage-col.is-timeline");
			t.expect(Math.abs(day.left - view.left) <= 1 && Math.abs(timeline.right - view.right) <= 1, `${label}: the day list from the window's left edge, the timeline to its right edge: ${day.left}–${timeline.right} in ${view.left}–${view.right}`);
			return { day: day.width, view: view.width };
		};
		const wide = await fits("1280 px");
		await t.cdp.eval(`(() => { require("@electron/remote").getCurrentWindow().setContentSize(900, 820); return 1; })()`);
		await t.sleep(900);
		const narrow = await fits("900 px");
		const share = (m) => m.day / (m.view - 16);
		t.expect(Math.abs(share(wide) - share(narrow)) < 0.01, `the list keeps its share of the window: ${share(wide).toFixed(3)} and ${share(narrow).toFixed(3)}`);
		await t.cdp.eval(`(() => { require("@electron/remote").getCurrentWindow().setContentSize(1280, 820); return 1; })()`);
		await t.sleep(900);
		await fits("1280 px again");
	},
};
