/**
 * The view modes stand as the core lays them out (docs/plugin/screen.md, «Режимы вида»): all columns side by side on the
 * desktop, the rows stacked under their labels beside the timeline, by project beside the timeline; in none of them does
 * the screen swipe, and the wheel shows only in two columns.
 */
export default {
	name: "modes",
	features: ["F10", "F12", "F16", "F17", "F18", "F38", "F49", "F229", "F230"],
	async run(t) {
		const view = await t.oracle.rect(".task-calendar");
		const at = { x: view.left + view.width * 0.3, y: view.top + view.height * 0.5 };
		const still = async (label) => {
			const before = await t.oracle.columns();
			const faults = await t.frames(async () => {
				if (t.platform === "desktop") await t.input.stroke(at.x, at.y, 1);
				else await t.input.swipe({ x: at.x + 120, y: at.y }, { x: at.x - 60, y: at.y + 4 }, { steps: 8, stepMs: 14 });
			}, { maxStep: 0.5 });
			t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(before), `${label}: a swipe leaves the screen standing`);
			t.expect(faults.length === 0, `${label}: nothing moves under a swipe: ${JSON.stringify(faults.slice(0, 3))}`);
			t.expect((await t.oracle.rect(".tc-seg")) === null, `${label}: no wheel`);
			t.expect((await t.oracle.rect(".tc-view-btn")) !== null, `${label}: the view button`);
		};

		if (t.platform === "desktop") {
			await t.setMode("allColumns");
			t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Inbox", "Backlog", "Soon", "Today"]), `all columns: Inbox over Backlog, Soon, the day, got ${JSON.stringify(await t.oracle.columns())}`);
			const widths = await t.cdp.eval(`[...document.querySelectorAll(".tc-stage > .tc-stage-col")].map((c) => Math.round(c.getBoundingClientRect().width))`);
			t.expect(widths.length === 4 && Math.max(...widths) - Math.min(...widths) <= 1, `at the middle share the four columns are equal: ${widths}`);
			t.expect((await t.oracle.rect(".tc-hour-label")) !== null, "all columns: the timeline on the right");
			await still("all columns");
		}

		await t.setMode("rows");
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Inbox", "Backlog", "Soon", "Today"]), `rows: the labels Inbox, Backlog, Soon and the day, top to bottom, got ${JSON.stringify(await t.oracle.columns())}`);
		const nav = await t.oracle.rect(".tc-stage-col.is-timeline .tc-day-title");
		t.expect(nav !== null, "rows: the day's title stands over the timeline");
		const rows = await t.cdp.eval(`[...document.querySelectorAll(".tc-rows-stack > .tc-row")].map((r) => { const list = r.querySelector(".tc-list"); return { h: Math.round(r.getBoundingClientRect().height), scrolls: list.scrollHeight > list.clientHeight + 1 }; })`);
		const stack = await t.oracle.rect(".tc-rows-stack");
		t.expect(rows.length === 4 && rows.every((r) => r.h > 0), `rows: four lists, each with room: ${JSON.stringify(rows)}`);
		t.expect(rows.reduce((sum, r) => sum + r.h, 0) <= stack.height + 1, `rows share the room and no more: ${rows.map((r) => r.h)} in ${stack.height}`);
		await still("rows");

		await t.setMode("byProject");
		t.expect((await t.oracle.rect(".tc-projects-list")) !== null, "by project: the node's list");
		const heads = await t.cdp.eval(`[...document.querySelectorAll(".tc-projects-list .tc-group-name")].map((h) => h.textContent)`);
		t.expect(heads.includes("Дом") && heads.includes("Работа") && heads.at(-1) === "No project", `by project, no filter: a part per top-level project, No project last: ${JSON.stringify(heads)}`);
		t.expect((await t.oracle.rect(".tc-stage-col.is-timeline .tc-day-title")) !== null, "by project: the day's title over the timeline");
		await still("by project");

		await t.setMode("twoColumns");
		t.expect((await t.oracle.rect(".tc-seg")) !== null, "two columns: the wheel is back");
	},
};
