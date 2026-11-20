import { cardBy } from "../lib/carry.mjs";
import { closingFaults, menuButton, menuFrames, menuNow } from "../lib/menu.mjs";

/**
 * E4, typing from the task menu (F107, F108, F117, F124, F298): Rename turns a list's card into the field holding its
 * title, the caret at its end, in the same tap the menu closes; Enter shows the new name at once, before the slow write is
 * read back, and writes it; Escape takes it back. On the calendar the block becomes the field. A calendar task with
 * subtasks shows them between its copy and the panel; a tap on one opens its own menu in the same sheet (no Add subtask,
 * no First step), where Rename turns that card into the field. Add subtask in a list opens the field under the task's last
 * subtask, a level deeper; on the calendar it types at the end of the stack, a subtask each Enter.
 */
export default {
	name: "e13-menu-fields",
	features: ["E4: Rename and Add subtask from the menu (F107, F108, F117, F124, F298)"],
	cases: ["list rename", "calendar", "list subtask"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (k, code = k, vk = 0, text = undefined) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
		};
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null, `the menu shows «${words}»: ${JSON.stringify((await menuNow(t))?.words)}`)) return;
			await tap(at);
			await t.sleep(300);
		};
		const field = () => t.cdp.eval(`(() => { const f = document.activeElement; if (!f?.isContentEditable) return null; const row = f.closest(".tc-quick-row"); const r = row.getBoundingClientRect(); const sel = getSelection(); return { text: f.textContent, atEnd: sel.anchorOffset === (sel.anchorNode?.textContent?.length ?? -1) || sel.anchorNode === f, left: r.left, top: r.top, width: r.width, renaming: row.dataset.renaming ?? null }; })()`);
		const bars = () => t.cdp.eval(`(() => { const b = document.querySelector(".tc-quick-bar"); if (!b) return null; const shifts = b.querySelector(".tc-bar-shifts")?.hidden ? [] : [...b.querySelectorAll(".tc-bar-shift")]; return { shifts: shifts.length, shiftsOff: shifts.filter((x) => x.disabled).length, flag: !!b.querySelector(".tc-bar-flag"), project: !!b.querySelector(".tc-bar-project"), place: b.querySelector(".tc-bar-place")?.textContent ?? null }; })()`);
		const file = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";

		if (item === "list rename") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[2];
			const card = await cardBy(t, title, "day");
			await tap(card);
			/** A mouse's click waits out a double click before the menu opens (Max, 2026-11-20); it has grown in by then. */
			await t.sleep(t.platform === "phone" ? 400 : 700);
			/** The verifier's find (2026-11-20): the menu's copy jumped to the window's corner as the card became the field. */
			const renameAt = await menuButton(t, "Rename");
			const closing = await menuFrames(t, () => tap(renameAt), 400);
			const faults = closingFaults(closing).filter((f) => !f.startsWith("still there"));
			t.expect(faults.length === 0, `the menu fades out where it stood as the card becomes the field: ${JSON.stringify(faults.slice(0, 4))}`);
			const f = await field();
			t.expect(await t.cdp.eval(`!!document.querySelector(".task-calendar.is-entering")`), "while renaming the screen is entering (Obsidian's phone toolbar stays away)");
			t.expect(f && f.text === title && f.renaming === card.id, `the card itself is the field, its title in it, the focus in it: ${JSON.stringify(f)}`);
			t.expect(f && Math.abs(f.top - card.top) <= 1 && Math.abs(f.left - card.left) <= 1, `the field stands where the card stood: ${JSON.stringify(f)} card ${JSON.stringify(card)}`);
			t.expect((await menuNow(t)) === null || (await t.cdp.eval(`!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)")`)), "the menu has closed");
			/** Max, 2026-11-20: «Rename and creating a task are literally one interface»: the same field with the same bar. */
			const bar = await bars();
			t.expect(bar && bar.shifts === 2 && bar.shiftsOff === 2 && bar.flag && bar.project && bar.place === "Now", `the rename has quick add's bar: the level buttons off, the flag, the project, the place: ${JSON.stringify(bar)}`);
			await key("Tab", "Tab", 9);
			await t.sleep(150);
			const tabbed = await field();
			t.expect(tabbed && tabbed.text === title, `Tab never types a tab into the name: ${JSON.stringify(tabbed?.text)}`);
			await t.shot("renaming");
			await t.stand("setDelay(300)");
			await t.cdp.send("Input.insertText", { text: " и ещё" });
			await key("Enter", "Enter", 13);
			await t.sleep(80);
			t.expect((await t.oracle.cards("day")).includes(`${title} и ещё`), "Enter shows the new name at once, before the write is read back (F298)");
			await t.sleep(500);
			t.expect((await file(`${title} и ещё`)) !== "", `and writes it: ${await file(title)}`);
			const next = await field();
			const renamedCard = await cardBy(t, `${title} и ещё`, "day");
			t.expect(next && next.text === "" && next.renaming === null && next.top > renamedCard.top && Math.abs(next.left - renamedCard.left) <= 1, `and a new task's field opens right under it, as the plugin's rename (quick-add spec §4.8): ${JSON.stringify(next)} card ${JSON.stringify(renamedCard)}`);
			await key("Escape", "Escape", 27);
			await t.sleep(300);
			await t.stand("setDelay(30)");
			const other = (await t.oracle.cards("day"))[4];
			await tap(await cardBy(t, other, "day"));
			await t.sleep(400);
			await press("Rename");
			await t.cdp.send("Input.insertText", { text: " нет" });
			await key("Escape", "Escape", 27);
			await t.sleep(300);
			t.expect((await t.oracle.cards("day")).includes(other) && !(await t.file()).includes(`${other} нет`), "Escape takes the rename back, nothing written");
		}
		if (item === "calendar") {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			/** The folded task, named on the calendar by its next step; a person scrolls the calendar to see it whole. */
			await t.cdp.eval(`(() => { const b = [...document.querySelectorAll("[data-block]")].find((e) => e.textContent.includes("Упаковать книги")); b.scrollIntoView({ block: "center" }); return 1; })()`);
			await t.sleep(300);
			const blockNow = () => t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Упаковать книги")); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12, left: r.left, top: r.top, bottom: r.bottom }; })()`);
			await tap(await blockNow());
			await t.sleep(450);
			const stack = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-subtasks > [data-stack]")].map((c) => { const r = c.getBoundingClientRect(); return { text: c.textContent, top: r.top, left: r.left }; })`);
			const menu = await menuNow(t);
			t.expect(JSON.stringify(stack.map((s) => s.text)) === JSON.stringify(["Упаковать книги", "Заказать машину"]), `its open subtasks stand under its copy (F107): ${JSON.stringify(stack)}`);
			t.expect(stack.length === 2 && Math.abs(stack[0].top - (menu.copy.bottom + 2)) <= 1 && Math.abs(stack[0].left - menu.copy.left) <= 1, `right under the copy, 2 px apart: ${JSON.stringify(stack[0])} copy ${JSON.stringify(menu.copy)}`);
			await t.shot("stack");
			await tap({ x: stack[1].left + 30, y: stack[1].top + 15 });
			await t.sleep(450);
			const sub = await menuNow(t);
			t.expect(sub && sub.words.includes("Done") && !sub.words.includes("Subtask") && !sub.words.includes("First step"), `a tap on a subtask opens its own menu, no Subtask or First step: ${JSON.stringify(sub?.words)}`);
			t.expect(await t.cdp.eval(`getComputedStyle(document.querySelector(".tc-backdrop.tc-menu-layer")).opacity === "1"`), "in the same sheet: the backdrop stays");
			await t.shot("subtask-menu");
			await press("Rename");
			const f = await field();
			t.expect(f && f.text === "Заказать машину" && Math.abs(f.top - stack[1].top) <= 1, `Rename turns that card into the field in its place (F108): ${JSON.stringify(f)}`);
			const subBar = await bars();
			t.expect(subBar && subBar.shifts === 0 && subBar.flag && !subBar.project && subBar.place === null, `a stack card's rename has the bar with the flag only: ${JSON.stringify(subBar)}`);
			t.expect(await t.cdp.eval(`getComputedStyle(document.querySelector(".tc-backdrop.tc-menu-layer")).opacity === "1"`), "the sheet stays while the stack's card is renamed");
			await t.cdp.send("Input.insertText", { text: " на субботу" });
			await key("Enter", "Enter", 13);
			await t.sleep(500);
			t.expect((await file("Заказать машину на субботу")) !== "", "Enter writes it");
			t.expect((await menuNow(t)) === null, "and the menu closes");

			await tap(await blockNow());
			await t.sleep(450);
			await press("Subtask");
			const typing = await field();
			t.expect(typing && typing.text === "", `Add subtask types at the end of the stack (F108): ${JSON.stringify(typing)} ${JSON.stringify(await blockNow())} ${JSON.stringify(await menuNow(t))} ${await t.cdp.eval("document.activeElement?.className")}`);
			await t.cdp.send("Input.insertText", { text: "Отключить интернет" });
			await key("Tab", "Tab", 9);
			await t.sleep(150);
			t.expect((await field())?.text === "Отключить интернет", `Tab never types a tab into the stack's field: ${JSON.stringify((await field())?.text)}`);
			await key("Enter", "Enter", 13);
			await t.sleep(400);
			const after = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-subtasks > [data-stack]")].map((c) => c.textContent)`);
			t.expect(after.includes("Отключить интернет") && (await field())?.text === "", `the new subtask joins the stack and the field is empty for the next: ${JSON.stringify(after)}`);
			const lines = (await t.file()).split("\n");
			const parent = lines.findIndex((l) => l.includes("Переезд"));
			const child = lines.findIndex((l) => l.includes("Отключить интернет"));
			t.expect(parent >= 0 && child > parent && lines[child].startsWith("\t- [ ]"), `written as the task's last subtask: ${lines.slice(parent, child + 1).join(" | ")}`);
			await key("Escape", "Escape", 27);
			await t.sleep(400);
			t.expect((await menuNow(t)) === null, "Escape closes the menu");

			await tap(await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Обед")); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; })()`));
			await t.sleep(450);
			await press("Rename");
			const blockField = await field();
			t.expect(blockField?.text === "Обед", `a block's Rename makes the block the field: ${JSON.stringify(blockField)}`);
			const blockBar = await bars();
			t.expect(blockBar && blockBar.shifts === 0 && blockBar.flag && blockBar.project && blockBar.place === null, `a block's rename has the calendar field's bar, the flag and the project: ${JSON.stringify(blockBar)}`);
			await t.shot("block-rename");
			await t.cdp.send("Input.insertText", { text: " с Олей" });
			await key("Enter", "Enter", 13);
			await t.sleep(500);
			t.expect((await file("Обед с Олей")) !== "" && (await t.cdp.eval(`[...document.querySelectorAll("[data-block]")].some((b) => b.textContent.includes("Обед с Олей"))`)), "written, and the block shows it");
		}
		if (item === "list subtask") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-subtasks"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const rows = await t.cdp.eval(`(() => { const list = document.querySelector('[data-list="inbox"]'); return [...list.querySelectorAll(".tc-card[data-id]")].map((c) => ({ text: c.querySelector(".tc-card-title").textContent, level: +getComputedStyle(c).getPropertyValue("--tc-level") || 0 })); })()`);
			const at = rows.findIndex((r, i) => r.level === 0 && rows[i + 1]?.level === 1);
			t.expect(at >= 0, `a task with subtasks in Inbox: ${JSON.stringify(rows)}`);
			const parent = rows[at].text;
			let last = at + 1;
			while (rows[last + 1] && rows[last + 1].level > 0) last++;
			await tap(await cardBy(t, parent, "inbox"));
			await t.sleep(400);
			await press("Subtask");
			const f = await field();
			const lastCard = await cardBy(t, rows[last].text, "inbox");
			const parentCard = await cardBy(t, parent, "inbox");
			t.expect(f && f.text === "" && f.top > lastCard.top && f.left - parentCard.left >= 19, `the field opens under the last subtask, a level deeper: ${JSON.stringify(f)} last ${JSON.stringify(lastCard)}`);
			await t.cdp.send("Input.insertText", { text: "Новый шаг" });
			await key("Enter", "Enter", 13);
			await t.sleep(500);
			const lines = (await t.file()).split("\n");
			const p = lines.findIndex((l) => l.includes(parent));
			const c = lines.findIndex((l) => l.includes("Новый шаг"));
			const between = lines.slice(p + 1, c);
			t.expect(p >= 0 && c > p && lines[c].startsWith("\t- [ ]") && between.every((l) => l.startsWith("\t")), `written as the task's last subtask: ${lines.slice(p, c + 1).join(" | ")}`);
			await key("Escape", "Escape", 27);
		}
	},
};
