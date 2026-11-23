import { menuButton, menuNow } from "../lib/menu.mjs";

/** A card in a list by the title on it (a folded card's small one too): its box, its counter's box, its two lines. */
const cardOf = (t, title) =>
	t.cdp.eval(`(() => {
		const card = [...document.querySelectorAll(".tc-card[data-id]")].find((c) => (c.querySelector(".tc-card-over-text") ?? c.querySelector(".tc-card-title"))?.textContent === ${JSON.stringify(title)});
		if (!card) return null;
		const r = card.getBoundingClientRect();
		const count = card.querySelector(".tc-count")?.getBoundingClientRect();
		return { x: r.left + 24, y: r.top + r.height / 2, count: count ? { x: count.left + count.width / 2, y: count.top + count.height / 2 } : null, step: card.classList.contains("is-two-line") ? card.querySelector(".tc-card-title")?.textContent ?? "" : null, folded: card.dataset.collapsed === "true", field: !!card.querySelector(".tc-first-step-field") };
	})()`);
const shownTitles = (t) => t.cdp.eval(`[...document.querySelectorAll(".tc-card[data-id] .tc-card-title")].map((e) => e.textContent)`);
/** The task's line in the file and the lines under it, deeper. */
const treeOf = async (t, title) => {
	const lines = (await t.file()).split("\n");
	const at = lines.findIndex((line) => /^\t*- \[.\] /.test(line) && line.replace(/^\t*- \[.\] /, "").startsWith(title));
	if (at < 0) return [];
	const depth = lines[at].match(/^\t*/)[0].length;
	const out = [lines[at]];
	for (let i = at + 1; i < lines.length && (lines[i].match(/^\t*/)[0].length > depth && lines[i].trim()); i++) out.push(lines[i]);
	return out;
};

/**
 * Subtasks, folding and First step (F79, F195–F201; `docs/plugin/tasks.md` «Подзадачи», `docs/plugin/screen.md` «Карточка
 * задачи»): a tap on a list card's counter folds the subtasks away (📁 in the file) and shows them again; a folded card is
 * two lines, the task's title small over its next step, and a tap anywhere on it opens the whole task's menu, whose status
 * tiles act on the shown step; First step folds the task in the same tap, its card's second line the field, Enter writing
 * the step first under the task, Escape writing nothing; on the calendar the block's line is the field.
 */
export default {
	name: "e29-fold-first-step",
	features: ["F195–F197: the counter and folding", "F79, F198: a folded card and its menu", "F199–F201: First step"],
	cases: ["fold", "folded menu", "first step", "first step escape", "first step on the calendar"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (name, code, keyCode) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: keyCode });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: keyCode });
			await t.sleep(500);
		};
		if (item !== "first step on the calendar") await t.cdp.eval(`(async () => { window.__tcStand.step("step-subtasks"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);

		if (item === "fold") {
			const card = await cardOf(t, "Спланировать отпуск");
			t.expect(card?.count !== null, "a task with subtasks shows its counter");
			await tap(card.count);
			await t.sleep(600);
			t.expect((await treeOf(t, "Спланировать отпуск"))[0]?.includes("📁"), `a tap on the counter folds it, in the file: ${(await treeOf(t, "Спланировать отпуск"))[0]}`);
			const folded = await cardOf(t, "Спланировать отпуск");
			t.expect(folded?.folded && folded.step === "Выбрать даты", `the card is two lines, its next step under its title: ${JSON.stringify(folded)}`);
			t.expect(!(await shownTitles(t)).includes("Забронировать отель"), "its subtasks are gone from the list");
			await t.shot("folded");
			t.expect((await menuNow(t)) === null, "and no menu opened");
			await tap(folded.count);
			await t.sleep(600);
			t.expect(!(await treeOf(t, "Спланировать отпуск"))[0]?.includes("📁"), "a tap again shows them");
			t.expect((await shownTitles(t)).includes("Забронировать отель"), "its subtasks are back in the list");
		}

		if (item === "folded menu") {
			await tap((await cardOf(t, "Спланировать отпуск")).count);
			await t.sleep(600);
			const folded = await cardOf(t, "Спланировать отпуск");
			await tap(folded);
			const menu = await menuNow(t);
			t.expect(menu?.copyText.includes("Спланировать отпуск"), `a tap on the folded card opens the whole task's menu: ${menu?.copyText}`);
			await tap(await menuButton(t, "Done"));
			await t.sleep(900);
			const tree = await treeOf(t, "Спланировать отпуск");
			t.expect(tree[0]?.startsWith("- [ ]") && tree.some((line) => line.includes("[x] Выбрать даты")), `Done closes the step, not the task: ${JSON.stringify(tree)}`);
			const next = await cardOf(t, "Спланировать отпуск");
			t.expect(next?.step === "Сравнить цены", `the card brings the next step: ${JSON.stringify(next)}`);
		}

		if (item === "first step") {
			await tap(await cardOf(t, "Позвонить маме"));
			await tap(await menuButton(t, "First step"));
			await t.sleep(500);
			const card = await cardOf(t, "Позвонить маме");
			t.expect(card?.field && card.folded, `the menu closes and the card folds, its second line the field: ${JSON.stringify(card)}`);
			t.expect(await t.cdp.eval(`!!document.activeElement?.closest(".tc-first-step-field")`), "the caret is in it");
			await t.cdp.send("Input.insertText", { text: "Найти номер" });
			await t.shot("first-step");
			await key("Enter", "Enter", 13);
			const tree = await treeOf(t, "Позвонить маме");
			t.expect(tree[0]?.includes("📁") && tree[1]?.includes("Найти номер"), `Enter writes the step first under the task, folded on it: ${JSON.stringify(tree)}`);
			const done = await cardOf(t, "Позвонить маме");
			t.expect(done?.step === "Найти номер" && !done.field, `the card shows the new step: ${JSON.stringify(done)}`);
		}

		if (item === "first step escape") {
			const before = await treeOf(t, "Спланировать отпуск");
			await tap(await cardOf(t, "Спланировать отпуск"));
			await tap(await menuButton(t, "First step"));
			await t.sleep(500);
			t.expect(!(await shownTitles(t)).includes("Выбрать даты"), "its subtasks slide under the card");
			await key("Escape", "Escape", 27);
			t.expect(JSON.stringify(await treeOf(t, "Спланировать отпуск")) === JSON.stringify(before), "Escape writes nothing");
			t.expect((await shownTitles(t)).includes("Выбрать даты") && !(await cardOf(t, "Спланировать отпуск"))?.field, "the card returns as it was, its subtasks back");
		}

		if (item === "first step on the calendar") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-menu"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const block = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-block-card[data-block]")].find((e) => !e.closest(".is-first-step") && e.querySelector(".tc-card-title")?.textContent); const r = b.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 8, title: b.querySelector(".tc-card-title").textContent }; })()`);
			await tap(block);
			const offered = await menuButton(t, "First step");
			if (!t.expect(offered !== null, `the block's menu offers First step: ${block.title}`)) return;
			await tap(offered);
			await t.sleep(500);
			const field = await t.cdp.eval(`(() => { const f = document.querySelector(".tc-block-card.is-first-step .tc-first-step-field"); return f ? { over: !!f.closest(".tc-block-card").querySelector(".tc-card-over") } : null; })()`);
			t.expect(field && !field.over, `the block's one line is the field, no small title in it: ${JSON.stringify(field)}`);
			await t.cdp.send("Input.insertText", { text: "Первый шаг блока" });
			await t.shot("first-step-block");
			await key("Enter", "Enter", 13);
			const tree = await treeOf(t, block.title);
			t.expect(tree[1]?.includes("Первый шаг блока"), `written first under the task: ${JSON.stringify(tree)}`);
			const named = await t.cdp.eval(`[...document.querySelectorAll(".tc-block-card[data-block] .tc-card-title")].some((e) => e.textContent === "Первый шаг блока")`);
			t.expect(named, "the block is named by the new step");
		}
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
