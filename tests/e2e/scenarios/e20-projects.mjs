import { cardBy } from "../lib/carry.mjs";
import { centreOf, menuButton, menuNow } from "../lib/menu.mjs";

/**
 * E4's leftovers (F122, F123, F187, F220, F194; Decisions 133, 134): the menu's Project page (the tree, a check that stays,
 * No project closing, a subtask's tile dim) and «New project…» there and on the bar: its name in place of the projects,
 * Enter making it last at the tree's top and giving it to the task or the field, a name the tree has (any case) reused,
 * a name of nothing and Escape going back to the projects, the field taking its focus back. ⌥Tab in the new task's field
 * switches it to a new section's name and back, as the bar's button does, and does nothing in a rename.
 */
export default {
	name: "e20-projects",
	features: ["E4: the Project page and New project (F122, F123, F187, F220)", "E4: the field's keys (F194, ⌥Tab)"],
	cases: ["menu page", "menu new project", "bar new project", "option tab"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (key, code, vk, modifiers = 0) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
			await t.sleep(400);
		};
		const enter = () => key("Enter", "Enter", 13);
		const esc = () => key("Escape", "Escape", 27);
		const type = async (text) => {
			await t.cdp.send("Input.insertText", { text });
			await t.sleep(150);
		};
		const line = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null && !at.disabled, `the menu offers «${words}»: ${JSON.stringify((await menuNow(t))?.words)}`)) return false;
			await tap(at);
			await t.sleep(400);
			return true;
		};
		const rows = (scope) => t.cdp.eval(`[...document.querySelectorAll(${JSON.stringify(scope)} + " .tc-menu-row, " + ${JSON.stringify(scope)} + " .tc-menu-back")].map((e) => e.textContent.trim() + (e.classList.contains("is-choice") && e.querySelector("svg") ? "✓" : "") + (e.disabled ? "(dim)" : ""))`);
		const focusedIn = (selector) => t.cdp.eval(`!!document.activeElement?.isContentEditable && !!document.activeElement.closest(${JSON.stringify(selector)})`);
		const shown = () => t.cdp.eval(`!!document.querySelector(".tc-level.tc-menu-layer.is-shown")`);
		await t.setStop("soon");
		const title = (await t.oracle.cards("day"))[3];
		const open = async (name = title) => {
			await tap(await cardBy(t, name, "day"));
			await t.sleep(450);
		};

		if (item === "menu page") {
			await open();
			if (!(await press("Project"))) return;
			const page = await rows(".tc-menu-layer");
			t.expect(page[0] === "Project" && page.includes("Дом") && page.includes("Работа(dim)") && page.at(-2) === "No project✓" && page.at(-1) === "New project…", `the Project page: the way back, the tree, a folder dim, No project checked, New project… last: ${JSON.stringify(page)}`);
			await t.shot("menu-projects");
			await press("Ремонт");
			await t.sleep(300);
			t.expect((await shown()) && (await line(title)).includes("🗂️ Ремонт"), `a project's check is written and the page stays: ${await line(title)}`);
			t.expect((await rows(".tc-menu-layer")).includes("Ремонт✓"), "the project is checked on the page");
			await press("Дом");
			await t.sleep(300);
			t.expect(/🗂️ Ремонт 🗂️ Дом/.test(await line(title)), `a second beside the first: ${await line(title)}`);
			await press("Ремонт");
			await t.sleep(300);
			t.expect(!(await line(title)).includes("Ремонт") && (await line(title)).includes("🗂️ Дом"), `tapped again, it comes off alone: ${await line(title)}`);
			await press("Project");
			t.expect((await menuNow(t))?.words.includes("Pick a date"), "the way back shows the menu");
			await press("Project");
			await press("No project");
			await t.sleep(400);
			t.expect(!(await shown()) && !(await line(title)).includes("🗂️"), `No project takes every project off and closes the menu: ${await line(title)}`);
			const sub = await t.cdp.eval(`(() => { const v = document.querySelector("[data-list=day]").getBoundingClientRect(); const c = [...document.querySelectorAll("[data-list=day] .tc-card[data-id] .tc-card-title")].find((e) => { const r = e.getBoundingClientRect(); return e.textContent.startsWith("шаг") && r.top > v.top && r.bottom < v.bottom - 80; }); return c ? c.textContent : null; })()`);
			if (t.expect(sub !== null, "a subtask shows in the day's list")) {
				await tap(await cardBy(t, sub, "day"));
				await t.sleep(450);
				t.expect((await menuButton(t, "Project"))?.disabled === true, "a subtask's Project is dim: its projects are its task's");
			}
		}

		if (item === "menu new project") {
			await open();
			await press("Project");
			const before = (await menuNow(t))?.panels[0];
			await press("New project…");
			const name = await menuNow(t);
			t.expect(name?.words[0] === "New project" && (await focusedIn(".tc-menu-layer .tc-project-name")), `«New project…»: the way back and the name's field, the caret in it: ${JSON.stringify(name?.words)}`);
			t.expect(before && name && name.panels[0].height < before.height - 40, `the panel shrinks to the name's page: ${before?.height} → ${name?.panels[0].height}`);
			await t.shot("menu-new-project");
			await type("   ");
			await enter();
			t.expect((await shown()) && (await rows(".tc-menu-layer"))[0] === "Project", "a name of nothing makes none and goes back to the projects");
			await press("New project…");
			await esc();
			t.expect((await shown()) && (await rows(".tc-menu-layer"))[0] === "Project", "Escape goes back to the projects, the menu open");
			await press("New project…");
			await type("Дача");
			await enter();
			await t.sleep(400);
			t.expect(!(await shown()) && (await line(title)).includes("🗂️ Дача"), `Enter makes the project, gives it to the task and closes the menu: ${await line(title)}`);
			await open();
			await press("Project");
			const page = await rows(".tc-menu-layer");
			t.expect(page.at(-3) === "Дача✓", `the new project is the tree's last at its top, checked: ${JSON.stringify(page)}`);
			await press("Project");
			await t.sleep(200);
			await esc();
			const other = (await t.oracle.cards("day"))[5];
			await open(other);
			await press("Project");
			await press("New project…");
			await type("дача");
			await enter();
			await t.sleep(400);
			t.expect((await line(other)).includes("🗂️ Дача"), `a name the tree has, in any case, gives that project: ${await line(other)}`);
			await open(other);
			await press("Project");
			t.expect((await rows(".tc-menu-layer")).filter((r) => r.toLowerCase().startsWith("дача")).length === 1, "and makes no second one");
		}

		if (item === "bar new project") {
			await tap(await centreOf(t, ".task-calendar > button.tc-plus"));
			await t.sleep(400);
			await type("Купить доски");
			const project = await centreOf(t, ".tc-bar-project");
			await tap(project);
			await t.sleep(350);
			const newRow = await centreOf(t, ".tc-quick-panel .tc-new-project");
			await tap(newRow);
			await t.sleep(350);
			t.expect(await focusedIn(".tc-quick-panel .tc-project-name"), "«New project…» on the bar: the name's field in the panel, the caret in it");
			await t.shot("bar-new-project");
			await esc();
			t.expect((await rows(".tc-quick-panel")).at(-1) === "New project…" && (await focusedIn(".tc-entry")), "Escape: back to the projects, the task's field taking the focus back");
			await tap(await centreOf(t, ".tc-quick-panel .tc-new-project"));
			await t.sleep(350);
			await type("Дача");
			await enter();
			await t.sleep(300);
			t.expect((await t.cdp.eval(`document.querySelectorAll(".tc-quick-panel:not(.is-closing)").length`)) === 0 && (await focusedIn(".tc-entry")), "Enter closes the panel, the task's field taking the focus back");
			t.expect(await t.cdp.eval(`document.querySelector(".tc-bar-project")?.classList.contains("is-set")`), "the field takes the new project: its button lit");
			t.expect((await t.cdp.eval(`document.activeElement?.textContent`)) === "Купить доски", "what was typed stays");
			await enter();
			t.expect((await line("Купить доски")).includes("🗂️ Дача"), `written with the new project: ${await line("Купить доски")}`);
			await tap(await centreOf(t, ".tc-bar-project"));
			await t.sleep(350);
			t.expect((await rows(".tc-quick-panel")).includes("Дача✓"), `the next field keeps it, the tree has it: ${JSON.stringify(await rows(".tc-quick-panel"))}`);
		}

		if (item === "option tab") {
			await open();
			await press("Rename");
			await t.sleep(300);
			await key("Tab", "Tab", 9, 1);
			t.expect(!(await t.cdp.eval(`!!document.querySelector(".tc-entry .tc-quick-field.is-section")`)), "a rename has no new section: ⌥Tab does nothing");
			await esc();
			await tap(await centreOf(t, ".task-calendar > button.tc-plus"));
			await t.sleep(400);
			const section = () => t.cdp.eval(`!!document.querySelector(".tc-entry .tc-quick-field.is-section") && !!document.querySelector(".tc-bar-section.is-set")`);
			await key("Tab", "Tab", 9, 1);
			t.expect((await section()) && (await focusedIn(".tc-entry")), "⌥Tab: the field writes a new section's name, as the bar's switch does, the caret in it");
			await key("Tab", "Tab", 9, 1);
			t.expect(!(await section()), "⌥Tab again: a task's field again");
		}
	},
};
