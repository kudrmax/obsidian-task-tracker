/**
 * E4, the new task's bar (F184–F189; the design's «Быстрый ввод»: «Полоса», «Панели над полосой», «Десктоп: капсула у
 * поля»): on the phone a bar on the view's bottom, on the Mac a capsule right under the field, right edges together, 8 px
 * from it. The level buttons move the field in and out, the focus staying in the field; the flag's levels colour the flag
 * and the field and are written with the task; a project picked lights its button, is written, and stays for the next
 * field; the place moves the field to the end of another list (the ribbon turning to it; Backlog under Inbox, F27) or a
 * picked day; the calendar's field has the flag and the project only. While a task is typed
 * the screen is `is-entering`, which keeps Obsidian's phone toolbar away.
 */
export default {
	name: "e15-quick-bar",
	features: ["E4: the new task's bar (F184–F189)"],
	cases: ["levels and flag", "project", "place", "calendar", "panels and escape", "picked day", "place out of sight"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const enter = async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await t.sleep(400);
		};
		const type = (text) => t.cdp.send("Input.insertText", { text });
		const box = (selector) => t.cdp.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.closest("[hidden]")) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, set: e.classList.contains("is-set"), disabled: !!e.disabled, priority: e.dataset.priority ?? null, text: e.textContent }; })()`);
		const press = async (selector) => {
			const at = await box(selector);
			if (!t.expect(at && !at.disabled, `${selector} is there to press: ${JSON.stringify(at)}`)) return;
			await tap(at);
			await t.sleep(350);
		};
		const tile = async (words) => {
			const at = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-quick-panel button")].find((e) => e.textContent.trim() === ${JSON.stringify(words)} || e.dataset.date === ${JSON.stringify(words)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			if (!t.expect(at !== null, `the panel offers «${words}»`)) return;
			await tap(at);
			await t.sleep(350);
		};
		const field = () => t.cdp.eval(`(() => { const f = document.activeElement; if (!f?.isContentEditable) return null; const q = f.closest(".tc-quick-field"); const row = f.closest(".tc-quick-row"); const r = row.getBoundingClientRect(); return { list: row.closest("[data-list]")?.dataset.list ?? null, left: r.left, right: r.right, bottom: r.bottom, top: r.top, priority: q.dataset.priority ?? null }; })()`);
		const line = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";
		const plus = async () => {
			await tap(await box(".task-calendar > button.tc-plus"));
			await t.sleep(400);
		};

		if (item === "levels and flag") {
			await t.setStop("soon");
			await plus();
			const f = await field();
			const bar = await box(".tc-quick-bar");
			t.expect(await t.cdp.eval(`!!document.querySelector(".task-calendar.is-entering")`), "the screen is entering while a task is typed");
			if (t.platform === "desktop") t.expect(bar && f && Math.abs(bar.right - f.right) <= 1 && Math.abs(bar.top - (f.bottom + 8)) <= 1, `the capsule right under the field, right edges together, 8 px from it: ${JSON.stringify(bar)} field ${JSON.stringify(f)}`);
			else {
				const view = await box(".task-calendar");
				t.expect(bar && view && Math.abs(bar.left - view.left) <= 1 && Math.abs(bar.width - view.width) <= 1 && bar.bottom <= view.bottom + 2 && bar.height === 44, `the bar on the view's bottom, its whole width, 44 high: ${JSON.stringify(bar)}`);
			}
			await t.shot("bar");
			t.expect((await box(".tc-bar-outdent"))?.disabled === true && (await box(".tc-bar-indent"))?.disabled === false, "at the top level: Move out dim, Move in on");
			await press(".tc-bar-indent");
			const deeper = await field();
			t.expect(deeper && f && Math.abs(deeper.left - f.left - 20) <= 1, `Move in takes the field a level in, the focus staying in it: ${f?.left} → ${deeper?.left}`);
			t.expect((await box(".tc-bar-indent"))?.disabled === true && (await box(".tc-bar-outdent"))?.disabled === false, "and no deeper than one under the task above");
			await press(".tc-bar-outdent");
			t.expect(Math.abs((await field())?.left - f.left) <= 1, "Move out takes it back");
			await press(".tc-bar-flag");
			const tiles = await t.cdp.eval(`[...document.querySelectorAll(".tc-quick-panel .tc-menu-tile-label")].map((e) => e.textContent)`);
			t.expect(JSON.stringify(tiles) === JSON.stringify(["p1", "p2"]), `the flag's panel: the levels: ${JSON.stringify(tiles)}`);
			await t.shot("flag-panel");
			await tile("p1");
			t.expect((await t.cdp.eval(`!document.querySelector(".tc-quick-panel")`)) === true, "a level picked closes the panel");
			const flag = await box(".tc-bar-flag");
			const after = await field();
			t.expect(flag?.set && flag.priority === "red" && after?.priority === "red", `the flag and the field take the level's colour, the focus in the field: ${JSON.stringify(flag)} ${JSON.stringify(after)}`);
			await type("Срочное дело");
			await enter();
			t.expect(/- \[ \] p1 Срочное дело/.test(await line("Срочное дело")), `written with the level: ${await line("Срочное дело")}`);
			t.expect((await box(".tc-bar-flag"))?.set === false, "the next field starts without it");
			await type("p2 Префикс");
			await t.sleep(200);
			t.expect((await box(".tc-bar-flag"))?.priority === "orange", "a typed prefix lights the flag");
		}
		if (item === "project") {
			await t.setStop("soon");
			await plus();
			await press(".tc-bar-project");
			const options = await t.cdp.eval(`[...document.querySelectorAll(".tc-quick-panel .tc-menu-row")].map((e) => e.textContent + (e.disabled ? "(dim)" : ""))`);
			t.expect(options.includes("Дом") && options.includes("Работа(dim)") && options.includes("No project✓") === false && options.at(-1) === "New project…", `the projects' tree, a folder dim, No project, New project…: ${JSON.stringify(options)}`);
			await t.shot("project-panel");
			await tile("Ремонт");
			t.expect((await box(".tc-bar-project"))?.set === true, "the picked project lights the button");
			await type("Купить плитку");
			await enter();
			t.expect((await line("Купить плитку")).includes("🗂️ Ремонт"), `written with the project: ${await line("Купить плитку")}`);
			t.expect((await box(".tc-bar-project"))?.set === true, "the next field keeps it");
		}
		if (item === "place") {
			await t.setStop("soon");
			await plus();
			t.expect((await box(".tc-bar-place"))?.text === "Now", `the place button says where the field stands: ${(await box(".tc-bar-place"))?.text}`);
			await press(".tc-bar-place");
			const tiles = await t.cdp.eval(`[...document.querySelectorAll(".tc-quick-panel .tc-menu-tile")].map((e) => e.textContent + (e.classList.contains("is-on") ? "*" : ""))`);
			t.expect(JSON.stringify(tiles) === JSON.stringify(["Inbox", "Backlog", "Soon", "Now*", "Date"]), `five places, the field's own on: ${JSON.stringify(tiles)}`);
			await t.shot("place-panel");
			const cut = await t.cdp.eval(`(() => { const l = [...document.querySelectorAll(".tc-quick-panel .tc-menu-tile-label")].find((e) => e.scrollWidth > e.clientWidth); return l ? getComputedStyle(l).maskImage : "none cut"; })()`);
			t.expect(cut === "none cut" || cut.includes("gradient"), `a place's name too long for its tile fades out: ${cut}`);
			await tile("Inbox");
			await t.sleep(500);
			const inbox = await field();
			t.expect(inbox?.list === "inbox", `Inbox: the field goes to the end of Inbox, the ribbon turning to it: ${JSON.stringify(inbox)}`);
			await type("В инбокс");
			await enter();
			t.expect((await t.oracle.tasks("Inbox")).some((task) => task.title === "В инбокс"), "written to Inbox");
			await press(".tc-bar-place");
			await tile("Backlog");
			const stays = await field();
			t.expect(stays?.list === "backlog" && (await box(".tc-bar-place"))?.text === "Backlog", `Backlog: the field goes to the end of Backlog under Inbox, the button says Backlog: ${JSON.stringify(stays)}`);
			await type("В бэклог");
			await enter();
			t.expect((await t.oracle.tasks("Backlog")).some((task) => task.title === "В бэклог"), "written to Backlog");
			await press(".tc-bar-place");
			await tile("Date");
			const day = await t.cdp.eval(`[...document.querySelectorAll(".tc-quick-panel .tc-day:not(.is-other)")].find((b) => b.classList.contains("is-today")).nextElementSibling?.dataset.date ?? null`);
			t.expect(day !== null, "the month shows today and the day after");
			await tile(day);
			await t.sleep(500);
			const place = (await box(".tc-bar-place"))?.text ?? "";
			t.expect(place === `${Number(day.slice(8))} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(day.slice(5, 7)) - 1]}`, `a picked day: the button says it: «${place}» for ${day}`);
			t.expect(await t.cdp.eval(`document.querySelector(".tc-day-title")?.textContent === "Tomorrow" || [...document.querySelectorAll(".tc-head-title, .tc-day-title")].some((e) => e.textContent === "Tomorrow")`), "and the day turns to it");
			await type("Завтрашнее");
			await enter();
			t.expect((await line("Завтрашнее")).includes(`📅 ${day}`), `written for that day: ${await line("Завтрашнее")}`);
		}
		const esc = async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(350);
		};
		const text = () => t.cdp.eval(`document.activeElement?.isContentEditable ? document.activeElement.textContent : null`);
		const panels = () => t.cdp.eval(`document.querySelectorAll(".tc-quick-panel:not(.is-closing)").length`);
		if (item === "panels and escape") {
			await t.setStop("soon");
			await plus();
			await type("Флажок");
			await press(".tc-bar-place");
			await tile("Date");
			t.expect((await panels()) === 1, "the month is open");
			await esc();
			t.expect((await panels()) === 0 && (await text()) === "Флажок", `Escape with a panel open closes the panel alone, the field and its text kept (the audit's 6): ${await text()}`);
			await press(".tc-bar-flag");
			await esc();
			await esc();
			t.expect((await field()) === null, "a second Escape closes the field");
			await plus();
			t.expect((await panels()) === 0, "a new field opens with no panel (the audit's 7)");
		}
		if (item === "picked day") {
			await t.setStop("soon");
			await plus();
			await type("A");
			await press(".tc-bar-place");
			await tile("Date");
			const day = await t.cdp.eval(`[...document.querySelectorAll(".tc-quick-panel .tc-day:not(.is-other)")].find((b) => b.classList.contains("is-today")).nextElementSibling?.nextElementSibling?.dataset.date ?? null`);
			await tile(day);
			await t.sleep(400);
			await enter();
			const into = await box(".tc-bar-indent");
			t.expect(into && !into.disabled, `the field under «A» on a picked day may go a level in: Move in on (the audit's 8): ${JSON.stringify(into)}`);
			const before = await field();
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
			await t.sleep(300);
			t.expect(Math.abs((await field())?.left - before.left - 20) <= 1, "and Tab takes it there, as the button");
		}
		if (item === "place out of sight") {
			/** A note's block shows Inbox alone: a place it can't bring into sight keeps the field where it stands (the audit's 9). */
			await t.stand("openNote()");
			await t.sleep(600);
			await plus();
			const here = await field();
			await type("Флажок");
			await press(".tc-bar-place");
			await tile("Soon");
			await t.sleep(400);
			const kept = await field();
			t.expect(kept && kept.list === here?.list && (await text()) === "Флажок" && (await box(".tc-bar-place"))?.text === "Soon", `a place the block can't show keeps the field where it stands, its text in it, the place Soon (the audit's 9): ${JSON.stringify(kept)}`);
			await enter();
			t.expect((await t.oracle.tasks("Soon")).some((task) => task.title === "Флажок"), "and the task is written to Soon");
		}
		if (item === "calendar") {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			await plus();
			await t.sleep(300);
			const day = await field();
			t.expect(day?.list === "day", `the plus opens the field at the end of today's list: ${JSON.stringify(day)}`);
			t.expect((await box(".tc-bar-shifts")) !== null && (await box(".tc-bar-place")) !== null, "a list's field: the level buttons and the place");
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(300);
			const plusAt = await box(".task-calendar > button.tc-plus");
			const cal = await box(".tc-timeline");
			await t.input.drag({ x: plusAt.x, y: plusAt.y }, { x: cal.x, y: cal.top + 120 }, { steps: 20 });
			await t.sleep(500);
			t.expect((await box(".tc-calendar-entry")) !== null, "the plus carried onto the calendar opens its field there");
			t.expect((await box(".tc-bar-shifts")) === null && (await box(".tc-bar-place")) === null && (await box(".tc-bar-flag")) !== null && (await box(".tc-bar-project")) !== null, "the calendar's field: the flag and the project only");
		}
	},
};
