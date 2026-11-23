/**
 * Select tasks and the actions on several tasks (F135–F145; docs/plugin/tasks.md «Массовые действия»; the design's
 * «Выбор задач», «Массовые действия»): «⋯» → Select tasks puts a circle on every list card, the capsule holds the cross
 * and how many are picked, the plus's place a circle with «⋯», dim while none is picked; a tap picks; «⋯» opens the menu
 * for them all, «N tasks», and an action there writes on every one and ends Select tasks; the cross and Escape end it. On
 * the Mac ⌘-click picks, Shift-click a run, a click on a picked card opens the menu beside it, Escape lets them go. The
 * tasks file says what was written.
 */
export default {
	name: "e28-select",
	features: ["Select tasks and bulk actions (F135–F145)"],
	cases: ["select", "exit", "mod-click"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (k, code, vk, modifiers = 0) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers });
			await t.sleep(350);
		};
		const card = (title) => t.cdp.eval(`(() => { const c = [...document.querySelectorAll('.task-calendar [data-list="inbox"] .tc-card')].find((e) => e.querySelector(".tc-card-title").textContent === ${JSON.stringify(title)}); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right, top: r.top, picked: c.classList.contains("is-selected"), circle: c.querySelector(".tc-pick").getBoundingClientRect().width }; })()`);
		const count = () => t.cdp.eval(`document.querySelector(".tc-select-capsule .tc-select-num")?.textContent ?? null`);
		const bulk = () => t.cdp.eval(`(() => { const p = document.querySelector(".tc-panel.is-bulk"); return p ? { title: p.querySelector(".tc-menu-title").textContent, words: [...p.querySelectorAll(".tc-menu-tile-label, .tc-menu-label")].map((e) => e.textContent) } : null; })()`);
		const tile = (words) => t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-panel.is-bulk button")].find((e) => (e.querySelector(".tc-menu-tile-label, .tc-menu-label")?.textContent ?? e.textContent).trim() === ${JSON.stringify(words)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		await t.setStop("inbox");
		const [first, second, third] = (await t.oracle.tasks("Inbox")).filter((task) => task.status === " ").map((task) => task.title);

		if (item === "mod-click") {
			if (t.platform === "phone") return;
			const a = await card(first);
			await t.input.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1, modifiers: 4 });
			await t.input.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: a.x, y: a.y, button: "left", clickCount: 1, modifiers: 4 });
			await t.sleep(300);
			const c = await card(third);
			await t.input.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: c.x, y: c.y, button: "left", clickCount: 1, modifiers: 8 });
			await t.input.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c.x, y: c.y, button: "left", clickCount: 1, modifiers: 8 });
			await t.sleep(300);
			const picked = await Promise.all([first, second, third].map(async (title) => (await card(title)).picked));
			t.expect(picked.every(Boolean), `⌘-click picks a card, Shift-click the run to another: ${JSON.stringify(picked)}`);
			t.expect((await card(first)).circle === 0, "⌘-click shows no circle");
			await t.input.click((await card(second)).x, (await card(second)).y);
			await t.sleep(500);
			const menu = await bulk();
			t.expect(menu?.title === "3 tasks", `a click on a picked card opens the menu for them all: ${JSON.stringify(menu)}`);
			const panel = await t.oracle.rect(".tc-panel.is-bulk");
			t.expect(panel && panel.left >= (await card(second)).right - 1, `the menu stands beside the card: ${JSON.stringify(panel)}`);
			await key("Escape", "Escape", 27);
			t.expect((await bulk()) === null && (await card(first)).picked, "Escape closes the menu first, the picks stay");
			await key("Escape", "Escape", 27);
			t.expect(!(await card(first)).picked, "Escape again lets the picks go");
			return;
		}

		await tap(await t.oracle.rect(".task-calendar > .tc-capsule:not(.tc-select-capsule) .tc-more-open"));
		await t.sleep(400);
		const select = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-panel.is-more button")].find((e) => e.textContent.trim() === "Select tasks"); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		await tap(select);
		await t.sleep(500);
		t.expect((await card(first)).circle > 10, `Select tasks puts a circle on every list card: ${(await card(first)).circle}`);
		t.expect((await count()) === "0" && (await t.cdp.eval(`document.querySelector(".tc-select-menu").classList.contains("is-off")`)), "the count is 0 and the circle in the plus's place dim");
		t.expect(await t.cdp.eval(`getComputedStyle(document.querySelector(".task-calendar > button.tc-plus")).visibility === "hidden"`), "the plus gives its place to the circle");
		await tap(await card(first));
		await tap(await card(second));
		await t.sleep(300);
		t.expect((await count()) === "2" && (await card(first)).picked && (await card(second)).picked, `a tap picks, no menu opens: ${await count()}`);

		if (item === "exit") {
			await tap(await t.oracle.rect(".tc-select-capsule .tc-select-exit"));
			await t.sleep(400);
			t.expect(!(await card(first)).picked && (await card(first)).circle === 0, "the cross ends Select tasks and lets the picks go");
			return;
		}

		await tap(await t.oracle.rect(".task-calendar > button.tc-select-menu"));
		await t.sleep(500);
		const menu = await bulk();
		t.expect(menu?.title === "2 tasks" && menu.words.includes("Done") && menu.words.includes("Delete") === false, `«⋯» opens the menu for both: ${JSON.stringify(menu)}`);
		const done = await tile("Done");
		if (t.expect(done !== null, "the menu offers Done")) await tap(done);
		await t.sleep(900);
		const inbox = (await t.oracle.tasks("Inbox")).map((task) => task.title);
		t.expect(!inbox.includes(first) && !inbox.includes(second), "both are done in the file");
		t.expect((await t.oracle.tasks("Done")).filter((task) => task.title === first || task.title === second).length >= 2, "both stand in Done");
		t.expect(await t.cdp.eval(`!document.querySelector(".task-calendar.is-selecting")`), "an action ends Select tasks");
	},
};
