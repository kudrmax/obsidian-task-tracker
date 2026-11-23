/**
 * A filtered empty list (F64; `docs/plugin/screen.md` «Проекты: панель и фильтр»): under a project with nothing in a list (the stand's «Дом» has nothing in Backlog),
 * the list shows a «No tasks» plate where its first card would stand; a tap on it opens a new task's field in that list.
 * Without a filter an empty list stays empty (the core's plates).
 */
export default {
	name: "e32-empty-plate",
	features: ["F64: a filtered empty list's No tasks plate"],
	async run(t) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		await t.setStop("inbox");
		t.expect((await t.cdp.eval(`document.querySelectorAll(".tc-group-empty").length`)) === 0, "without a filter no list shows the plate");
		await t.stand(`setProject("Дом")`);
		await t.sleep(700);
		const plate = await t.oracle.rect('[data-list="backlog"] .tc-group-empty');
		const words = await t.cdp.eval(`document.querySelector('[data-list="backlog"] .tc-group-empty')?.textContent ?? null`);
		t.expect(plate !== null && words === "No tasks", `under a filter, the empty list says so: ${words}`);
		t.expect((await t.cdp.eval(`document.querySelectorAll('[data-list="inbox"] .tc-group-empty').length`)) === 0, "a list with its tasks under the filter shows none");
		await t.shot("plate");
		await tap(plate);
		await t.sleep(500);
		const field = await t.cdp.eval(`(() => { const f = document.activeElement?.closest(".tc-quick-row"); return f ? f.closest("[data-list]")?.dataset.list ?? null : null; })()`);
		t.expect(field === "backlog", `a tap on it opens a new task's field in that list: ${field}`);
		await t.stand("setProject(null)");
	},
};
