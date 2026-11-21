import { cardBy } from "../lib/carry.mjs";
import { menuNow } from "../lib/menu.mjs";

/**
 * E4, the mouse on a task (the audit's findings 1–3 and 16): a click on a list's card, a calendar's block or a card of a
 * calendar menu's stack opens its menu at once, a right click too; a double click on a task renames nothing (withdrawn by
 * Max, 2026-11-20: the wait it needs felt like lag; Rename is the menu's). A double click on a list's free room still opens
 * a new task's field at its end.
 */
export default {
	name: "e17-menu-mouse",
	features: ["E4: the mouse on a task: a click opens its menu, a right click too (double click withdrawn, Max 2026-11-20)"],
	platforms: ["desktop"],
	cases: ["two clicks", "right click", "free room"],
	async run(t, item) {
		const press = async (p, count = 1) => {
			await t.input.move(p.x, p.y);
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: count });
			await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: count });
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
			const stackCard = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-menu-subtasks [data-stack]")].find((e) => e.textContent.includes("Заказать машину")); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 15 }; })()`);
			await right(stackCard);
			const sub = await menuNow(t);
			t.expect(sub && sub.words.includes("Done") && !sub.words.includes("Add subtask"), `and on a stack's card, its own menu: ${JSON.stringify(sub?.words)}`);
			return;
		}
		if (item === "free room") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-menu"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			await t.setStop("soon");
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
		/** Max, 2026-11-20: double click withdrawn for now (the wait it needs felt like lag): a click opens the menu at once; a second quick click renames nothing (it lands on the menu or its backdrop). */
		const opened = () => t.cdp.eval(`!!document.querySelector(".tc-menu-block")`);
		const twice = async (p, what) => {
			await press(p, 1);
			await t.sleep(40);
			t.expect(await opened(), `${what}: the first click opens the menu at once`);
			await press(p, 2);
			await t.sleep(400);
			t.expect((await field()) === null, `${what}: the second click renames nothing`);
			await escape();
		};
		await t.setStop("soon");
		const title = (await t.oracle.cards("day"))[1];
		await twice(await cardBy(t, title, "day"), "a list's card");
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		await twice(await block("Обед"), "a calendar's block");
		await press(await block("Упаковать книги"));
		await menuNow(t);
		const stackCard = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-menu-subtasks [data-stack]")].find((e) => e.textContent.includes("Заказать машину")); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 15 }; })()`);
		await press(stackCard, 1);
		await t.sleep(40);
		await press(stackCard, 2);
		await t.sleep(400);
		t.expect((await field()) === null, "two quick clicks on a stack's card rename nothing");
	},
};
