import { cardBy } from "../lib/carry.mjs";
import { menuButton, menuNow } from "../lib/menu.mjs";

/**
 * Step 7, batch C: the task menu's part 2 pages (F120, F121, F125, F126, F199–F204): Repeat shows each tap at once and
 * writes its rule once, as the menu closes; Section moves the task into a section, New section names one in a field
 * over the task waiting at its list's end; First step folds the task in the tap and its step line is the field, Enter writing the first subtask; Open in
 * Obsidian leaves for the tasks file at the task's line. What is written is read from the tasks file.
 */
export default {
	name: "e27-menu-pages",
	features: ["Step 7 C: Repeat, Section, First step and Open in Obsidian from the menu (F120, F121, F125, F126, F199–F204)"],
	cases: ["repeat", "section", "first step", "open in obsidian"],
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
			await t.sleep(350);
		};
		const pressIn = async (selector) => {
			const at = await t.cdp.eval(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			if (!t.expect(at !== null, `${selector} shows`)) return;
			await tap(at);
			await t.sleep(250);
		};
		const line = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";
		const open = async (title, list) => {
			const card = await cardBy(t, title, list);
			if (!t.expect(card !== null, `the card «${title}» shows in ${list}`)) return;
			await tap(card);
			await t.sleep(450);
		};
		if (item === "repeat") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[3];
			await open(title, "day");
			await press("Repeat");
			const page = await menuNow(t);
			t.expect(page?.panels[0] && Math.abs(page.panels[0].width - 300) <= 0.5, `the Repeat page in the menu's place, 300 wide: ${JSON.stringify(page?.panels)}`);
			const seg = () => t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-repeat-seg-btn.is-on, .tc-menu-layer .tc-repeat-day.is-on")].map((b) => b.textContent)`);
			t.expect(JSON.stringify(await seg()) === JSON.stringify(["Schedule", "weeks", (await t.cdp.eval(`["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(Date.now() - 5 * 3600e3).getDay()]`))]), `a new rule: Schedule, weeks, the task's weekday: ${JSON.stringify(await seg())}`);
			await t.shot("repeat-page");
			await press("days");
			await pressIn(".tc-menu-layer .tc-repeat-step[aria-label=More]");
			t.expect((await t.cdp.eval(`document.querySelector(".tc-menu-layer .tc-repeat-count")?.textContent`)) === "2", "Every 2 shows at once");
			t.expect(!(await line(title)).includes("🔁"), "nothing is written while the menu is open");
			await key("Escape", "Escape", 27);
			await t.sleep(500);
			t.expect((await line(title)).includes("🔁 every 2 days"), `closing the menu writes the rule once: ${await line(title)}`);
		}
		if (item === "section") {
			await t.setStop("inbox");
			const title = (await t.oracle.cards("inbox"))[1];
			await open(title, "inbox");
			await press("Section");
			const words = (await menuNow(t))?.words ?? [];
			t.expect(words.includes("Section") && words.includes("Morning") && words.includes("New section"), `the Section page: the way back, the presets, New section: ${JSON.stringify(words)}`);
			await t.shot("section-page");
			await press("New section");
			const waiting = await t.cdp.eval(`(() => { const rows = [...document.querySelectorAll("[data-list=inbox] .tc-list-item")]; const at = rows.findIndex((r) => r.querySelector(".tc-new-section")); return { field: at >= 0 && document.activeElement?.closest(".tc-new-section") !== null, next: rows[at + 1]?.querySelector(".tc-card-title")?.textContent ?? null, menu: !!document.querySelector(".tc-menu-layer .tc-panel:not(.is-closing)") }; })()`);
			t.expect(waiting.field && waiting.next === title && !waiting.menu, `the menu closes, the task waits under the new section's name field, the caret in it (the design's «Поле имени»): ${JSON.stringify(waiting)}`);
			await t.shot("section-name");
			await t.cdp.send("Input.insertText", { text: "Дача" });
			await key("Enter", "Enter", 13);
			await t.sleep(600);
			t.expect(new RegExp(`### Дача\\n- \\[ \\] (?:p\\d )?${title}`).test(await t.file()), "Enter makes the section with the task in it");
		}
		if (item === "first step") {
			await t.stand(`step("step-subtasks")`);
			await t.sleep(700);
			await t.setStop("inbox");
			await open("Спланировать отпуск", "inbox");
			await press("First step");
			const card = await t.cdp.eval(`(() => { const c = document.querySelector(".tc-card.is-first-step"); return c && { over: c.querySelector(".tc-card-over")?.textContent ?? null, field: document.activeElement?.closest(".tc-first-step") !== null, folded: c.dataset.collapsed === "true" }; })()`);
			t.expect(card && card.over === "Спланировать отпуск" && card.field && card.folded, `the card folds, the title small on top, the step line the field with the caret: ${JSON.stringify(card)}`);
			const titles = await t.cdp.eval(`[...document.querySelectorAll("[data-list=inbox] .tc-card .tc-card-title")].map((e) => e.textContent)`);
			t.expect(!titles.includes("Выбрать даты"), `its subtasks slid under the card: ${JSON.stringify(titles)}`);
			await t.shot("first-step");
			await t.cdp.send("Input.insertText", { text: "Позвонить в агентство" });
			await key("Enter", "Enter", 13);
			await t.sleep(700);
			t.expect(/Спланировать отпуск 📁\n\t- \[ \] Позвонить в агентство\n/.test(await t.file()), "Enter writes the step first, the task folded on it");
			const shown = await t.cdp.eval(`[...document.querySelectorAll("[data-list=inbox] .tc-card")].find((c) => c.querySelector(".tc-card-over")?.textContent === "Спланировать отпуск")?.querySelector(".tc-card-title")?.textContent ?? null`);
			t.expect(shown === "Позвонить в агентство", `the card shows the new step: ${shown}`);
		}
		if (item === "open in obsidian") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[2];
			await open(title, "day");
			await press("Open in Obsidian");
			await t.sleep(300);
			const lineNo = (await t.file()).split("\n").findIndex((l) => l.includes(title));
			const opened = await t.stand("opened()");
			t.expect(JSON.stringify(opened) === JSON.stringify([`line ${lineNo}`]), `the tasks file opens at the task's line: ${JSON.stringify(opened)}`);
			t.expect((await menuNow(t)) === null, "the menu has closed");
		}
	},
};
