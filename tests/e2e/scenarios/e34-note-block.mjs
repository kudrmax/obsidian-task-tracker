/** The block a person sees in the note's reading view. */
const BLOCK = ".markdown-reading-view .tc-note-block";

/** The block as it stands: its height, what its rows hold and show, its labels, its last card's bottom, its foot's top. */
const blockNow = (t) =>
	t.cdp.eval(`(() => {
		const block = document.querySelector('${BLOCK}');
		if (!block) return null;
		const rows = block.querySelector(".tc-note-rows");
		const cards = [...block.querySelectorAll(".tc-note-rows .tc-card[data-id]")];
		const last = cards.length ? Math.max(...cards.map((c) => c.getBoundingClientRect().bottom)) : null;
		const foot = block.querySelector("button.tc-plus").getBoundingClientRect();
		return { height: block.getBoundingClientRect().height, top: block.getBoundingClientRect().top, scrolls: rows.scrollHeight > rows.clientHeight + 1, cards: cards.length, labels: [...block.querySelectorAll(".tc-row-label")].map((e) => e.textContent), last, footTop: foot.top, view: !!block.querySelector("button.tc-view-btn"), tallest: parseFloat(getComputedStyle(block).maxHeight) };
	})()`);

/**
 * A project note's block (F278–F282; `docs/plugin/screen.md` «Блок в заметке проекта»): its lists stacked under their
 * labels as Rows draws them, no calendar; the frame as tall as its tasks, growing with a new one, the note scrolling past
 * it; a very long one scrolls inside the frame, which stops at the tallest a block may be. Its bottom row: Undo, the view
 * button with the note's own modes, the plus.
 */
export default {
	name: "e34-note-block",
	features: ["F278–F282: a project note's block, as tall as its tasks"],
	cases: ["as tall as its tasks", "a long one scrolls inside", "rows and the view button"],
	async run(t, item) {
		if (item === "as tall as its tasks") {
			/** A project's block as the plugin mounts it: «Отпуск», with one task of its own. */
			await t.stand('step("step-one-column")');
			await t.stand("openNote()");
			await t.stand('setProject("Отпуск")');
			await t.stand('addFromOutside("inbox", "Взять палатку 🗂️ Отпуск")');
			await t.sleep(1200);
			const before = await blockNow(t);
			t.expect(before && before.cards > 0 && !before.scrolls && before.height < before.tallest, `a short block is as tall as its tasks, nothing scrolls in it: ${JSON.stringify(before)}`);
			t.expect(before.last !== null && before.last <= before.footTop, `its last card stands over its bottom row: ${JSON.stringify(before)}`);
			await t.stand('addFromOutside("inbox", "Купить карту 🗂️ Отпуск")');
			const after = await t.waitFor(async () => {
				const now = await blockNow(t);
				return now && now.cards > before.cards ? now : null;
			});
			t.expect(!!after && after.height > before.height + 20 && after.height < before.height + 60, `a new task makes the block a card taller: ${before.height} → ${after?.height}`);
			await t.shot("note-short");
		}

		if (item === "a long one scrolls inside") {
			await t.stand("openNote()");
			await t.sleep(1500);
			const now = await blockNow(t);
			t.expect(now && Math.abs(now.height - now.tallest) <= 1 && now.scrolls, `a long block stops at the tallest a block may be and scrolls inside: ${JSON.stringify(now)}`);
			await t.shot("note-long");
		}

		if (item === "rows and the view button") {
			await t.stand('step("step-one-column")');
			await t.stand("openNote()");
			await t.sleep(1200);
			const now = await blockNow(t);
			t.expect(JSON.stringify(now.labels) === JSON.stringify(["Inbox", "Backlog", "Soon", "Today"]), `the block's lists stacked under their labels: ${JSON.stringify(now.labels)}`);
			t.expect(now.view, "the view button stands in the block's bottom row");
			t.expect((await t.oracle.rect(`${BLOCK} .tc-timeline`)) === null, "no calendar in the block");
			const button = await t.oracle.rect(`${BLOCK} button.tc-view-btn`);
			if (t.platform === "phone") await t.input.tap(button.left + button.width / 2, button.top + button.height / 2);
			else await t.input.click(button.left + button.width / 2, button.top + button.height / 2);
			const menu = await t.waitFor(() => t.cdp.eval(`(() => { const p = document.querySelector(".tc-panel.is-view"); return p ? [...p.querySelectorAll(".tc-menu-row")].map((r) => r.textContent) : null; })()`));
			t.expect(JSON.stringify(menu) === JSON.stringify(["Rows"]), `the block's View offers the note's own modes (By project once the engine draws it, Decision 149): ${JSON.stringify(menu)}`);
			await t.shot("note-view");
		}
	},
};
