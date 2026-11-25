import { carry, cardBy } from "../lib/carry.mjs";

/**
 * Step 7, batch E (docs/plugin/screen.md «Проекты: панель и фильтр», docs/plugin/tasks.md «Проекты»; Decisions 162–165):
 * the folder button and the projects' panel (docked on the desktop, over the lists with a dim on the phone), the tree, a
 * project chosen as the filter with its name and cross, the project menu (Rename, Folder, the note, Delete project), the
 * tree's divider, a project lifted to reorder or nest, a card let go on a project's row or held over it, the plus let go in
 * the tree for a new project, and By project. The oracle is the tasks file and the words on screen.
 */

/** The `## Projects` tree's lines of the tasks file. */
const treeOf = (file) => {
	const at = file.indexOf("## Projects");
	return at < 0 ? [] : file.slice(at).split("\n").slice(1).filter((line) => line.trim().startsWith("- "));
};

export default {
	name: "e33-projects",
	features: ["F205–F214 (panel, tree, filter)", "F216–F219 (project menu)", "F54 (tree divider)", "F215, F221–F226 (tree drag, carry)", "F229–F238 (By project)"],
	cases: ["panel and filter", "project menu", "card on a row", "lift a project", "plus in the tree", "hold over a row", "by project", "tree divider"],
	async run(t, item) {
		const phone = t.platform === "phone";
		const tap = async (p) => {
			if (phone) await t.input.tap(p.x, p.y);
			else await t.input.click(p.x, p.y);
			await t.sleep(450);
		};
		const centre = async (selector) => {
			const r = await t.oracle.rect(selector);
			return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
		};
		const press = async (selector) => {
			const at = await centre(selector);
			if (!t.expect(at !== null, `${selector} stands on the screen`)) return false;
			await tap(at);
			return true;
		};
		const row = (title) => t.cdp.eval(`(() => { const el = [...document.querySelectorAll(".tc-tree-row")].find((r) => r.querySelector(".tc-tree-name")?.textContent === ${JSON.stringify(title)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, left: r.left, height: r.height, cls: el.className }; })()`);
		const filter = () => t.cdp.eval(`document.querySelector(".tc-filter-title")?.textContent ?? null`);
		const panelOpen = () => t.cdp.eval(`!!document.querySelector(".task-calendar.has-tree")`);
		const key = async (name, code, vk) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: name, code, windowsVirtualKeyCode: vk });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: name, code, windowsVirtualKeyCode: vk });
			await t.sleep(400);
		};
		const type = async (text) => {
			await t.cdp.send("Input.insertText", { text });
			await t.sleep(150);
		};
		const line = async (title) => (await t.file()).split("\n").find((l) => l.includes(title)) ?? "";
		const openPanel = async () => {
			if (!(await panelOpen())) await press(".tc-folder-btn");
			await t.sleep(300);
			return t.expect(await panelOpen(), "the folder button opens the panel");
		};
		const choose = async (title) => {
			await openPanel();
			const at = await row(title);
			if (!t.expect(at !== null, `the tree shows «${title}»`)) return false;
			await tap(at);
			await t.sleep(300);
			return true;
		};
		await t.setStop("calendar");

		if (item === "panel and filter") {
			const before = await t.oracle.rect(".tc-ribbon");
			await openPanel();
			await t.sleep(400);
			const tree = await t.cdp.eval(`[...document.querySelectorAll(".tc-tree-row")].map((r) => r.querySelector(".tc-tree-name").textContent + (r.classList.contains("is-tile") ? "#" : "") + (r.classList.contains("is-selected") ? "*" : ""))`);
			t.expect(tree[0] === "All#*" && tree.includes("Дом#") && tree.includes("Ремонт") && tree.at(-2) === "No project#" && tree.at(-1) === "Done#", `the tree: All chosen, projects as tiles, a subproject a line, No project and Done last: ${JSON.stringify(tree)}`);
			const after = await t.oracle.rect(".tc-ribbon");
			if (phone) t.expect(Math.abs(after.left - before.left) < 1 && (await t.cdp.eval(`getComputedStyle(document.querySelector(".tc-tree-dim")).opacity`)) === "1", "on the phone the panel lies over the lists, the rest dimmed");
			else t.expect(after.left > before.left + 100, `on the desktop the panel docks and the columns move right: ${before.left} → ${after.left}`);
			await t.shot("panel");
			await tap(await row("Дом"));
			await t.sleep(400);
			t.expect((await filter()) === "Дом", `the filter's name stands over the tasks: ${await filter()}`);
			t.expect((await panelOpen()) === !phone, `a pick closes the panel on the phone and keeps it docked on the desktop: ${await panelOpen()}`);
			const cards = await t.oracle.cards("day");
			const file = await t.file();
			t.expect(cards.length > 0 && cards.every((title) => (file.split("\n").find((l) => l.includes(title)) ?? "").includes("🗂️ Дом") || file.includes(title)), `the day shows «Дом»'s tasks: ${JSON.stringify(cards)}`);
			await t.shot("filtered");
			await press(".tc-filter-clear");
			t.expect((await filter()) === null, "the cross clears the filter");
			if (phone) {
				await openPanel();
				const dim = await t.oracle.rect(".tc-tree-dim");
				await tap({ x: dim.left + dim.width - 20, y: dim.top + dim.height / 2 });
				t.expect(!(await panelOpen()), "a tap on the dim closes the panel");
			}
		}

		if (item === "project menu") {
			if (!(await choose("Отпуск"))) return;
			await press(".tc-filter-title");
			const words = await t.cdp.eval(`[...document.querySelectorAll(".tc-panel.is-project-menu .tc-menu-row")].map((r) => r.textContent.trim())`);
			t.expect(words[0] === "Rename" && words.some((w) => w.startsWith("Folder")) && words.includes("Attach note…") && words.at(-1) === "Delete project", `the project menu: ${JSON.stringify(words)}`);
			await t.shot("project-menu");
			await press(".tc-panel.is-project-menu .tc-menu-row:first-child");
			await t.sleep(300);
			await t.cdp.eval(`(() => { const cm = document.querySelector(".tc-filter-field [contenteditable]"); cm.focus(); document.execCommand("selectAll"); return 1; })()`);
			await type("Отдых");
			await key("Enter", "Enter", 13);
			await t.sleep(300);
			t.expect(treeOf(await t.file()).some((l) => l.includes("Отдых")) && (await filter()) === "Отдых", `Rename writes the tree's line and the filter shows the new name: ${await filter()}`);
			await press(".tc-filter-title");
			const del = await t.cdp.eval(`[...document.querySelectorAll(".tc-panel.is-project-menu .tc-menu-row")].length`);
			await press(`.tc-panel.is-project-menu .tc-menu-row.is-danger`);
			t.expect((await t.cdp.eval(`document.querySelector(".tc-panel.is-project-menu .tc-menu-ask-question")?.textContent`)) === "Delete “Отдых”?", `Delete asks in place (${del} rows before)`);
			await press(".tc-panel.is-project-menu .tc-menu-ask-btn.is-danger");
			await t.sleep(400);
			t.expect(!treeOf(await t.file()).some((l) => l.includes("Отдых")) && !(await t.file()).includes("🗂️ Отдых") && (await filter()) === null, "Delete project takes it off the tree and every task, the choice going to All");
		}

		if (item === "card on a row") {
			/** On the desktop the panel stands docked; on the phone it lies over the lists, so the card brings it out at the screen's left edge (F222). */
			if (!phone) await openPanel();
			const card = (await t.oracle.cards("day"))[0];
			const from = await cardBy(t, card, "day");
			if (!t.expect(from !== null, `the day shows «${card}»`)) return;
			let round = 0;
			const toRow = async () => {
				if (phone && round++ === 0) return { x: 4, y: from.y };
				await t.waitFor(async () => (await row("Ремонт")) !== null && (await panelOpen()), 3000);
				/** The panel slides out under the held card before a person aims at its rows. */
				await t.sleep(phone ? 450 : 0);
				return row("Ремонт");
			};
			let lit = null;
			await carry(t, from, toRow, { holdMs: 150, during: async () => void (lit = await t.cdp.eval(`({ drop: document.querySelector(".tc-tree-row.is-drop")?.textContent ?? null, open: !!document.querySelector(".task-calendar.has-tree"), debug: window.__tcStand.debug()[0] })`)) });
			t.expect(lit?.drop === "Ремонт", `the row under the card is lit in the drop's colour: ${JSON.stringify(lit)}`);
			await t.sleep(500);
			t.expect((await line(card)).includes("🗂️ Ремонт"), `a card let go on a project's row takes that project: ${await line(card)}`);
		}

		if (item === "lift a project") {
			await openPanel();
			const before = treeOf(await t.file());
			const from = await row("Отпуск");
			await carry(t, from, async () => {
				const home = await row("Дом");
				return { x: home.left + 30, y: home.top + 2 };
			});
			await t.sleep(500);
			const after = treeOf(await t.file());
			t.expect(after[0]?.includes("Отпуск") && after.length === before.length, `Отпуск lifted over Дом stands first: ${JSON.stringify(after)}`);
		}

		if (item === "plus in the tree") {
			await openPanel();
			const plus = await centre("button.tc-plus");
			await carry(t, plus, async () => {
				const none = await row("No project");
				return { x: none.left + 30, y: none.top - 2 };
			});
			await t.sleep(400);
			t.expect(await t.cdp.eval(`!!document.querySelector(".tc-tree-field [contenteditable]")`), "the plus let go in the tree opens a new project's name there");
			await t.cdp.eval(`(() => { document.querySelector(".tc-tree-field [contenteditable]")?.focus(); return 1; })()`);
			await type("Сад");
			await key("Enter", "Enter", 13);
			await t.sleep(400);
			t.expect(treeOf(await t.file()).some((l) => l.includes("Сад")) && (await filter()) === "Сад", `Enter makes it and chooses it: ${await filter()}`);
		}

		if (item === "hold over a row") {
			if (!phone) await openPanel();
			const card = (await t.oracle.cards("day"))[0];
			const from = await cardBy(t, card, "day");
			if (phone) {
				/** On the phone: brought out at the edge, held over Отпуск it opens; let go there, the card takes it and Отпуск stays chosen. */
				let round = 0;
				let held = null;
				const toRow = async () => {
					if (round++ === 0) return { x: 4, y: from.y };
					await t.waitFor(async () => (await row("Отпуск")) !== null && (await panelOpen()), 3000);
					await t.sleep(450);
					return row("Отпуск");
				};
				let lit = null;
				await carry(t, from, toRow, { holdMs: 200, during: async () => {
					lit = await t.cdp.eval(`document.querySelector(".tc-tree-row.is-drop")?.textContent ?? null`);
					await t.sleep(900);
					held = await filter();
				} });
				t.expect(lit === "Отпуск", `the row under the card is lit: ${lit}`);
				await t.sleep(500);
				t.expect(held === "Отпуск", `a card held over a project's row opens it, the card still in hand: ${held}`);
				t.expect((await line(card)).includes("🗂️ Отпуск") && (await filter()) === "Отпуск", `let go there, it takes the project and the project stays chosen: ${await line(card)}, ${await filter()}`);
				return;
			}
			let held = null;
			let lit = null;
			await carry(t, from, () => row("Отпуск"), { holdMs: 200, during: async () => {
				lit = await t.cdp.eval(`document.querySelector(".tc-tree-row.is-drop")?.textContent ?? null`);
				await t.sleep(900);
				held = await filter();
			}, end: "cancel" });
			t.expect(lit === "Отпуск", `the row under the card is lit: ${lit}`);
			await t.sleep(500);
			t.expect(held === "Отпуск", `a card held over a project's row opens it, the card still in hand: ${held}`);
			t.expect((await filter()) === null, `Escape after a row opened: the filter returns to the one at the lift: ${await filter()}`);
			t.expect(!(await line(card)).includes("🗂️ Отпуск"), `nothing is written: ${await line(card)}`);
		}

		if (item === "by project") {
			await press(".tc-view-btn");
			const at = await t.cdp.eval(`[...document.querySelectorAll(".tc-panel.is-view .tc-menu-row")].findIndex((r) => r.textContent.trim() === "By project")`);
			if (!t.expect(at >= 0, "«View» offers By project")) return;
			await press(`.tc-panel.is-view .tc-menu-row:nth-child(${at + 1})`);
			await t.sleep(500);
			/** The parts' headers as a person scrolling the list through reads them (the list draws only the rows in sight). */
			const partsSeen = () =>
				t.cdp.eval(`(async () => { const list = document.querySelector('[data-list="projects"]'); const seen = new Set(); for (let top = 0; top <= list.scrollHeight; top += list.clientHeight / 2) { list.scrollTop = top; await new Promise((r) => setTimeout(r, 60)); for (const e of list.querySelectorAll(".tc-group-name")) seen.add(e.textContent); } list.scrollTop = 0; await new Promise((r) => setTimeout(r, 60)); return [...seen]; })()`);
			const heads = await partsSeen();
			t.expect(heads.includes("Дом") && heads.includes("Отпуск"), `By project without a filter: a part per top project: ${JSON.stringify(heads)}`);
			t.expect(await t.cdp.eval(`!!document.querySelector('[data-list="projects"] .tc-stage-mark svg')`), "a card shows its stage's mark on its right");
			await t.shot("by-project");
			await press("button.tc-plus");
			await type("Из части");
			await key("Enter", "Enter", 13);
			await key("Escape", "Escape", 27);
			await t.sleep(300);
			t.expect((await t.file()).includes("Из части"), "the plus types a new task in By project and Enter writes it");
			if (!(await choose("Дом"))) return;
			if (!phone) await press(".tc-folder-btn");
			const parts = await partsSeen();
			t.expect(parts.includes("Ремонт"), `under a project: its own tasks, then a part per subproject: ${JSON.stringify(parts)}`);
			t.expect((await t.cdp.eval(`document.querySelector(".tc-view-btn") !== null`)) && (await filter()) === "Дом", "choosing a project keeps the mode");
			/** Дом's first card (an Inbox one: the part goes by the funnel), carried to the room right under Ремонт's header, scrolled into sight while it is held. */
			const first = await t.cdp.eval(`document.querySelector('[data-list="projects"] .tc-card[data-id] .tc-card-title')?.textContent ?? null`);
			if (!t.expect(first !== null, "Дом's own part shows its cards")) return;
			const underHead = () => t.cdp.eval(`(async () => { const list = document.querySelector('[data-list="projects"]'); list.scrollTop = list.scrollHeight; await new Promise((r) => setTimeout(r, 300)); const head = [...list.querySelectorAll(".tc-group-head")].find((h) => h.textContent.startsWith("Ремонт")); if (!head) return null; const r = head.getBoundingClientRect(); return { x: r.left + 40, y: r.bottom + 4 }; })()`);
			await carry(t, await cardBy(t, first, "projects"), underHead);
			await t.sleep(600);
			t.expect((await line(first)).includes("🗂️ Ремонт") && !(await line(first)).includes("🗂️ Дом"), `a card let go in Ремонт's part changes the project it stood under: ${await line(first)}`);
		}

		if (item === "tree divider") {
			if (phone) return;
			await openPanel();
			const panel = await t.oracle.rect(".tc-tree-panel");
			const handle = await centre(".tc-tree-divider .tc-divider-handle");
			if (!t.expect(handle !== null, "the docked tree has its divider")) return;
			await t.input.drag(handle, { x: handle.x + 60, y: handle.y }, { steps: 12, stepMs: 16 });
			await t.sleep(400);
			const wider = await t.oracle.rect(".tc-tree-panel");
			t.expect(wider.width > panel.width + 40, `dragging the divider widens the tree: ${panel.width} → ${wider.width}`);
		}
	},
};
