/**
 * «⋯», the search and the Done column (F250–F257, F261; docs/plugin/tasks.md «Поиск», docs/plugin/screen.md «Колёсико»,
 * «Колонка Done»; the design's «Поиск», «Выбор задач»): «⋯» opens its menu over the capsule, Search and Select tasks, and
 * on the desktop Best task; Search opens a field (over the keyboard on the phone, a panel from the top on the Mac, ⌘F there
 * too) whose finds are grouped by list with the found words picked out; nothing typed shows nothing, no find says so; a
 * find picked takes the screen to the task, its card ringed until the screen is touched; a found task of Done brings Done
 * left of Inbox into sight, and a swipe on leaves it for good.
 */
const capsuleMore = ".task-calendar > .tc-capsule:not(.tc-select-capsule) .tc-more-open";

export default {
	name: "e27-search",
	features: ["«⋯» (F261), Search (F250–F256), the Done column (F257)"],
	cases: ["more", "find", "nothing", "done", "cmd-f"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const rows = () => t.cdp.eval(`[...document.querySelectorAll(".tc-panel.is-more .tc-menu-label")].map((e) => e.textContent)`);
		const openMore = async () => {
			await tap(await t.oracle.rect(capsuleMore));
			await t.sleep(400);
		};
		const pressRow = async (words) => {
			const at = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll(".tc-panel.is-more button")].find((e) => e.textContent.trim() === ${JSON.stringify(words)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			if (t.expect(at !== null, `«⋯» offers ${words}`)) await tap(at);
			await t.sleep(450);
		};
		const type = async (text) => {
			await t.cdp.send("Input.insertText", { text });
			await t.sleep(400);
		};
		const searchOpen = () => t.cdp.eval(`!!document.querySelector(".tc-search.is-shown")`);
		const found = () => t.cdp.eval(`[...document.querySelectorAll(".tc-search .tc-search-results .tc-list-item > *, .tc-search .tc-search-results > .tc-search-empty")].map((e) => e.classList.contains("tc-group-head") ? "## " + e.textContent.trim() : e.querySelector(".tc-card-title")?.textContent ?? e.textContent.trim())`);
		const ringed = () => t.cdp.eval(`[...document.querySelectorAll(".task-calendar .tc-card.is-found, .task-calendar .tc-block-card.is-found")].map((e) => e.querySelector(".tc-card-title").textContent)`);

		if (item === "more") {
			await openMore();
			const expected = t.platform === "phone" ? ["Search", "Select tasks"] : ["Search", "Select tasks", "Best task"];
			t.expect(JSON.stringify(await rows()) === JSON.stringify(expected), `«⋯» offers ${expected.join(", ")}: ${JSON.stringify(await rows())}`);
			const panel = await t.oracle.rect(".tc-panel.is-more");
			const capsule = await t.oracle.rect(".task-calendar > .tc-capsule:not(.tc-select-capsule)");
			t.expect(panel && capsule && panel.bottom <= capsule.top && Math.abs(panel.left - capsule.left) < 1.5, `the menu stands over the capsule by its left edge: ${JSON.stringify({ panel, capsule })}`);
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(400);
			t.expect((await rows()).length === 0, "Escape closes «⋯»");
			return;
		}

		if (item === "cmd-f") {
			if (t.platform === "phone") return;
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 4 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "f", code: "KeyF", windowsVirtualKeyCode: 70, modifiers: 4 });
			await t.sleep(400);
			t.expect(await searchOpen(), "⌘F opens the search");
			const panel = await t.oracle.rect(".tc-search.is-desk");
			const view = await t.oracle.rect(".task-calendar");
			t.expect(panel && Math.abs(panel.top - view.top - 16) < 1.5 && Math.abs(panel.x - view.x) < 1.5, `the panel hangs 16 under the view's top, in its middle: ${JSON.stringify({ panel, view })}`);
			return;
		}

		await openMore();
		await pressRow("Search");
		t.expect(await searchOpen(), "Search opens the search");
		t.expect((await found()).length === 0, "nothing typed shows nothing");

		if (item === "nothing") {
			await type("щщщщщщ");
			t.expect(JSON.stringify(await found()) === JSON.stringify(["No tasks found"]), `a query with no find says so: ${JSON.stringify(await found())}`);
			if (t.platform === "phone") await tap(await t.oracle.rect(".tc-search-cancel"));
			else await t.input.click(20, 20);
			await t.sleep(400);
			t.expect(!(await searchOpen()), "Cancel or a click beside the panel closes it");
			return;
		}

		if (item === "find") {
			const [target] = await t.oracle.tasks("Inbox");
			const word = target.title.split(" ")[1];
			await type(word);
			const list = await found();
			t.expect(list[0] === "## Inbox" && list.includes(target.title), `the finds are grouped by list, Inbox first, with «${target.title}»: ${JSON.stringify(list.slice(0, 6))}`);
			t.expect(await t.cdp.eval(`[...document.querySelectorAll(".tc-search mark.tc-hit")].some((m) => m.textContent.toLowerCase() === ${JSON.stringify(word.toLowerCase())})`), "the found word is picked out");
			if (t.platform === "desktop") {
				const walked = () => t.cdp.eval(`document.querySelector(".tc-search .tc-hit-card.is-picked .tc-card-title")?.textContent ?? null`);
				t.expect((await walked()) === list[1], `the first find is walked to: ${await walked()}`);
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
				await t.sleep(100);
				t.expect((await walked()) === list[1], "the arrows stop at the first");
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			} else {
				const row = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-search .tc-hit-card")].find((e) => e.querySelector(".tc-card-title").textContent === ${JSON.stringify(list[1])}); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
				await tap(row);
			}
			await t.sleep(900);
			t.expect(!(await searchOpen()), "a pick closes the search");
			t.expect(JSON.stringify(await ringed()) === JSON.stringify([list[1]]), `the found card wears the ring: ${JSON.stringify(await ringed())}`);
			t.expect((await t.oracle.columns())[0] === "Inbox", `the screen goes to Inbox: ${JSON.stringify(await t.oracle.columns())}`);
			await tap({ x: (await t.oracle.rect(".task-calendar")).x, y: (await t.oracle.rect(".task-calendar")).top + 20 });
			await t.sleep(300);
			t.expect((await ringed()).length === 0, "a touch of the screen lets the ring go");
			return;
		}

		/** A task of Done: Done comes into sight left of Inbox. */
		const done = (await t.oracle.tasks("Done"))[0].title;
		await type(done);
		const doneRow = await t.cdp.eval(`(() => { let inDone = false; for (const e of document.querySelectorAll(".tc-search .tc-search-results .tc-list-item > *, .tc-search .tc-search-results > .tc-search-empty")) { if (e.classList.contains("tc-group-head")) inDone = e.textContent.trim() === "Done"; else if (inDone && e.querySelector(".tc-card-title")?.textContent === ${JSON.stringify(done)}) { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } } return null; })()`);
		if (!t.expect(doneRow !== null, `«${done}» is found under Done`)) return;
		await tap(doneRow);
		await t.sleep(1000);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Done", "Inbox"]), `Done stands left of Inbox: ${JSON.stringify(await t.oracle.columns())}`);
		t.expect((await ringed()).includes(done), `the found card of Done wears the ring: ${JSON.stringify(await ringed())}`);
		const view = await t.oracle.rect(".task-calendar");
		if (t.platform === "phone") await t.input.swipe({ x: view.x + 100, y: view.y }, { x: view.x - 120, y: view.y }, { steps: 8 });
		else {
			await t.input.click(view.x, view.top + 20);
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
		}
		await t.sleep(800);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Inbox", "Soon"]), `a swipe on leaves Done for Inbox: ${JSON.stringify(await t.oracle.columns())}`);
		if (t.platform === "phone") await t.input.swipe({ x: view.x - 120, y: view.y }, { x: view.x + 100, y: view.y }, { steps: 8 });
		else await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 });
		await t.sleep(800);
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Inbox", "Soon"]), `Done is gone until the next search: ${JSON.stringify(await t.oracle.columns())}`);
	},
};
