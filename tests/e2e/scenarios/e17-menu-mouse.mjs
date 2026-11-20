import { cardBy } from "../lib/carry.mjs";
import { menuNow } from "../lib/menu.mjs";

/**
 * E4, the mouse on a task (the audit's findings 1–3 and 16; `docs/plugin/tasks.md`, `docs/plugin/screen.md`): a double
 * click on a list's card, a calendar's block or a card of a calendar menu's stack renames it, as the plugin's: the first
 * click opens the menu, a second press within a double click closes it and the card becomes the field, no word of the copy
 * selected; two clicks farther apart leave the menu open.
 */
export default {
	name: "e17-menu-mouse",
	features: ["E4: double click renames (F117)"],
	platforms: ["desktop"],
	cases: ["double click", "right click", "free room"],
	async run(t, item) {
		const press = async (p, count = 1) => {
			await t.input.move(p.x, p.y);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: count });
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: count });
		};
		const double = async (p) => {
			await press(p, 1);
			await t.sleep(90);
			await press(p, 2);
			await t.sleep(400);
		};
		const field = () => t.cdp.eval(`(() => { const f = document.activeElement; if (!f?.isContentEditable) return null; const row = f.closest(".tc-quick-row"); return { text: f.textContent, renaming: row.dataset.renaming ?? null, selected: getSelection().toString() }; })()`);
		const escape = async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(400);
		};
		const right = async (p) => {
			await t.input.move(p.x, p.y);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "right", buttons: 2, clickCount: 1 });
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "right", buttons: 0, clickCount: 1 });
			await t.sleep(450);
		};
		const block = (title) => t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes(${JSON.stringify(title)})); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; })()`);

		if (item === "right click") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("soon"))[1];
			await right(await cardBy(t, title, "soon"));
			const menu = await menuNow(t);
			t.expect(menu && menu.words.includes("Done") && menu.words.includes("Rename"), `a right click on a list's card opens its menu: ${JSON.stringify(menu?.words)}`);
			await escape();
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			await right(await block("Обед"));
			t.expect((await menuNow(t))?.words.includes("Rename"), "and on a calendar's block");
			await escape();
			await right(await block("Упаковать книги"));
			const stackCard = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-menu-subtasks > [data-stack]")].find((e) => e.textContent.includes("Заказать машину")); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 15 }; })()`);
			await right(stackCard);
			const sub = await menuNow(t);
			t.expect(sub && sub.words.includes("Done") && !sub.words.includes("Add subtask"), `and on a stack's card, its own menu: ${JSON.stringify(sub?.words)}`);
			return;
		}
		if (item === "free room") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-menu"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const room = await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="soon"]'); const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 30 }; })()`);
			t.expect(await t.cdp.eval(`!document.elementFromPoint(${room.x}, ${room.y}).closest(".tc-drag-source")`), "the point is the list's free room under its cards");
			await press(room, 1);
			await t.sleep(60);
			await press(room, 2);
			await t.sleep(400);
			const f = await t.cdp.eval(`(() => { const f = document.activeElement; if (!f?.isContentEditable) return null; const row = f.closest(".tc-quick-row"); const list = row.closest("[data-list]"); const items = [...list.querySelectorAll(".tc-list-item")].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); return { list: list.dataset.list, last: items[items.length - 1].contains(row), renaming: row.dataset.renaming ?? null }; })()`);
			t.expect(f && f.list === "soon" && f.last && f.renaming === null, `a double click on Soon's free room opens a new task's field at its end: ${JSON.stringify(f)}`);
			return;
		}
		await t.setStop("soon");
		const title = (await t.oracle.cards("day"))[1];
		const card = await cardBy(t, title, "day");
		await double(card);
		const f = await field();
		t.expect(f && f.text === title && f.renaming === card.id && f.selected === "", `a double click on a list's card renames it, no word selected: ${JSON.stringify(f)}`);
		t.expect((await menuNow(t)) === null || (await t.cdp.eval(`!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)")`)), "and the menu has gone");
		await escape();
		await press(card);
		await t.sleep(400);
		await press(card);
		await t.sleep(400);
		t.expect((await field()) === null && (await menuNow(t)) !== null, "two clicks farther apart than a double click leave the menu open, nothing renamed");
		await escape();

		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		await double(await block("Обед"));
		const b = await field();
		t.expect(b && b.text === "Обед", `a double click on a calendar's block renames it: ${JSON.stringify(b)}`);
		await escape();
		/** A click elsewhere lets the block go (F102): the next first click selects it again. */
		await press(await t.cdp.eval(`(() => { const r = document.querySelector(".task-calendar").getBoundingClientRect(); return { x: r.left + 6, y: r.top + 6 }; })()`));
		await t.sleep(200);
		/** Where the selected block's bottom dot stands once the first click selects it: the second press lands on the dot. */
		const onDot = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Обед")); const r = el.getBoundingClientRect(); return { x: r.left + 30, y: r.bottom - 2 }; })()`);
		await press(onDot);
		await t.sleep(90);
		const under = await t.cdp.eval(`document.elementFromPoint(${onDot.x}, ${onDot.y})?.className ?? ""`);
		await press(onDot, 2);
		await t.sleep(400);
		const dotted = await field();
		t.expect(dotted && dotted.text === "Обед", `a double click whose second press lands on the selected block's dot (${under}) renames it too, as the plugin's: ${JSON.stringify(dotted)}`);
		await escape();
		await press(await block("Упаковать книги"));
		await t.sleep(450);
		const stackCard = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-menu-subtasks > [data-stack]")].find((e) => e.textContent.includes("Заказать машину")); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 15 }; })()`);
		await double(stackCard);
		const s = await field();
		t.expect(s && s.text === "Заказать машину" && s.selected === "", `a double click on a stack's card renames it in its place: ${JSON.stringify(s)}`);
		t.expect(await t.cdp.eval(`getComputedStyle(document.querySelector(".tc-backdrop.tc-menu-layer")).opacity === "1"`), "the sheet stays");
	},
};
