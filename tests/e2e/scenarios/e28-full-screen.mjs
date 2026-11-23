import { cardBy } from "../lib/carry.mjs";
import { menuButton, menuNow } from "../lib/menu.mjs";

/**
 * Step 7, batch C: the full-screen task (F239–F249; the design's «Задача на весь экран»): Open full screen in the menu
 * shows the title, every subtask as a tree and the notes; a circle ticks a subtask done and leaves it struck in place,
 * the counter following; a subtask's menu opens over its card and its Open full screen goes a level in, its task over its
 * title leading back up; the plus types a new last subtask; Close (and Escape on the Mac) returns to the main screen.
 */
export default {
	name: "e28-full-screen",
	features: ["Step 7 C: the full-screen task (F239–F249)"],
	cases: ["tree and circles", "levels and close", "plus"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (k, code = k, vk = 0) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
		};
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null, `the menu shows «${words}»: ${JSON.stringify((await menuNow(t))?.words)}`)) return;
			await tap(at);
			await t.sleep(400);
		};
		const at = (selector, index = 0) => t.cdp.eval(`(() => { const b = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const pressAt = async (selector, index = 0) => {
			const p = await at(selector, index);
			if (!t.expect(p !== null, `${selector} shows`)) return;
			await tap(p);
			await t.sleep(400);
		};
		const sheet = () =>
			t.cdp.eval(`(() => { const s = document.querySelector(".tc-full.is-shown"); if (!s) return null; return { title: s.querySelector(".tc-full-title")?.textContent ?? null, parent: s.querySelector(".tc-full-parent-text")?.textContent ?? null, rows: [...s.querySelectorAll(".tc-full-list > .tc-card")].map((c) => ({ title: c.querySelector(".tc-card-title")?.textContent, depth: Number(getComputedStyle(c).getPropertyValue("--tc-level") || 0), done: c.dataset.mark === "done", struck: getComputedStyle(c.querySelector(".tc-card-title")).textDecorationLine === "line-through", count: c.querySelector(".tc-count")?.textContent ?? null })), notes: !!s.querySelector(".tc-full-desc") }; })()`);
		await t.stand(`step("step-subtasks")`);
		await t.sleep(700);
		await t.setStop("inbox");
		const card = await cardBy(t, "Спланировать отпуск", "inbox");
		if (!t.expect(card !== null, "the task shows")) return;
		await tap(card);
		await t.sleep(450);
		await press("Open full screen");
		const first = await sheet();
		t.expect(first?.title === "Спланировать отпуск" && first.parent === null && first.notes, `the task over the whole screen, its notes' editor: ${JSON.stringify(first)}`);
		t.expect(JSON.stringify(first?.rows.map((r) => [r.title, r.depth])) === JSON.stringify([["Выбрать даты", 0], ["Купить билеты", 0], ["Сравнить цены", 1], ["Забронировать отель", 0]]), `every subtask as a tree: ${JSON.stringify(first?.rows)}`);
		if (item === "tree and circles") {
			await t.shot("full-screen");
			await pressAt(".tc-full-list .tc-pick", 0);
			await t.sleep(300);
			const ticked = await sheet();
			t.expect(ticked?.rows[0].done && ticked.rows[0].struck && ticked.rows[0].title === "Выбрать даты", `the circle fills, the title struck, the row in its place: ${JSON.stringify(ticked?.rows[0])}`);
			t.expect((await t.file()).includes("- [x] Выбрать даты"), "written done");
			await t.shot("full-screen-ticked");
			await pressAt(".tc-full-list .tc-pick", 2);
			await t.sleep(300);
			const parent = (await sheet())?.rows[1];
			t.expect(parent?.count === "1/1", `the counter of the subtask with subtasks follows at once: ${JSON.stringify(parent)}`);
		}
		if (item === "levels and close") {
			await pressAt(".tc-full-list > .tc-card", 1);
			t.expect((await menuNow(t)) !== null, "a tap on a subtask opens its menu");
			await press("Open full screen");
			const inner = await sheet();
			t.expect(inner?.title === "Купить билеты" && inner.parent === "Спланировать отпуск", `a level in, its task over its title: ${JSON.stringify(inner)}`);
			await pressAt(".tc-full-parent");
			t.expect((await sheet())?.title === "Спланировать отпуск", "the task over the title leads a level up");
			if (t.platform === "desktop") await key("Escape", "Escape", 27);
			else await pressAt(".tc-sheet-bar > button");
			await t.sleep(400);
			t.expect((await sheet()) === null && !(await t.cdp.eval(`!!document.querySelector(".tc-full")`)), `${t.platform === "desktop" ? "Escape" : "Close"} returns to the main screen`);
		}
		if (item === "plus") {
			await pressAt(".tc-full button.tc-plus");
			t.expect(await t.cdp.eval(`document.activeElement?.closest(".tc-full-list") !== null`), "the plus opens a field last among the subtasks");
			await t.cdp.send("Input.insertText", { text: "Взять зарядку" });
			await key("Enter", "Enter", 13);
			await t.sleep(500);
			const rows = (await sheet())?.rows.map((r) => r.title) ?? [];
			t.expect(rows[rows.length - 1] === "Взять зарядку", `written as the last subtask: ${JSON.stringify(rows)}`);
			t.expect(/Забронировать отель\n\t- \[ \] Взять зарядку/.test(await t.file()), "in the file under the task");
			await t.shot("full-screen-plus");
		}
	},
};
