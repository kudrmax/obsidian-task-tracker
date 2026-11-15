import type { Driver } from "./driver";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The block alone, old or new: Obsidian's note around it is never compared; 1 px of the old block's short height is cropped. */
/** Obsidian's own chrome that may stand over the block (its status bar, the phone's navigation): never compared (decision 41). */
const CHROME = [".status-bar", ".mobile-navbar"];
const BLOCK = { of: ".tc-project-block, .tc-n-block", fit: { px: 1, cut: { fromBottom: 71 } }, masks: CHROME } as const;
/** The block with a field open: the new block grows for the field and its bar, the old one scrolled them in (decision 56). */
const TYPING = { of: ".tc-project-block, .tc-n-block", fit: { px: 60, cut: "bottom" }, masks: CHROME } as const;
/** A layer over the block (a menu): the whole page, the note and Obsidian's chrome as they stand under the sheet. */
const PAGE = { of: "body", masks: CHROME };

/** The block's parts, old and new, by one selector each. */
const SEL = {
	block: ".tc-project-block, .tc-n-block",
	viewButton: ":is(.tc-project-block .tc-view-btn, .tc-n-block .tc-n-view-btn)",
	menuLabel: ":is(.tc-panel .tc-menu-label, .tc-n-panel .tc-n-menu-label)",
	card: ":is(.tc-project-block .tc-card, .tc-n-block .tc-n-card)",
	title: ":is(.tc-card-title, .tc-n-card-title)",
	plus: ":is(.tc-project-block .tc-plus, .tc-n-block .tc-n-plus)",
	head: ":is(.tc-project-block .tc-group-head, .tc-n-block .tc-n-group-head)",
};

/** The section the run writes into Soon over the note's last tasks there, so a header stands in the block to lift. */
const SECTION = "E2E section";

/** The note «Дружба.md» opened with its block, old or new (`newBlock`), scrolled so the block's foot shows. */
export async function openBlock(d: Driver, newBlock: boolean): Promise<void> {
	await d.page(`
		app.saveLocalStorage("task-calendar:new-screens", { newBlock: ${newBlock} });
		await app.plugins.disablePlugin("task-calendar");
		await app.plugins.enablePlugin("task-calendar");
		await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath("Дружба.md"));
		for (let i = 0; i < 50 && !document.querySelector(${JSON.stringify(SEL.block)}); i++) await new Promise((r) => setTimeout(r, 100));
		document.querySelector(${JSON.stringify(SEL.block)}).scrollIntoView({ block: "end" });
		/** The note opens with its editor focused, which on the phone raises Obsidian's toolbar over the block: Max reads the note first. */
		app.workspace.activeEditor?.editor?.blur();
		return true;`);
	for (let i = 0; i < 50 && !(await d.page<boolean>("return __e2e.rows().length > 0")); i++) await sleep(100);
	await d.page("return __e2e.rest()");
}

/** The note scrolled so the whole block shows, its foot over the window's bottom edge: as Max scrolls to it. */
export async function showBlock(d: Driver): Promise<void> {
	/** As far as the note scrolls: the block's room under it (Obsidian's navigation on the phone) shows too, as at the note's end. */
	await d.page(`const b = document.querySelector(${JSON.stringify(SEL.block)}); b?.scrollIntoView({ block: "end" }); const s = b?.closest(".cm-scroller, .markdown-preview-view"); if (s && b) s.scrollTop += parseFloat(getComputedStyle(b).marginBottom) || 0; return true`);
	await d.page("return __e2e.rest()");
}

async function chooseMode(d: Driver, mode: string): Promise<void> {
	await showBlock(d);
	await d.step(`view menu opens for ${mode}`, "interaction", () => d.tapOn(SEL.viewButton), { moves: [] });
	await d.step(`mode ${mode}`, "context", () => d.tapOn(SEL.menuLabel, mode));
}

/**
 * The note's block, old or new, on the same copy of Max's file (spec §Tests 6, old against new): at rest in Rows and By
 * subprojects, the view menu, a task's menu, a task typed and written, a card carried; every step judged frame by frame,
 * every rest shot and compared with the old block's baseline.
 */
export async function block(d: Driver, newBlock: boolean): Promise<void> {
	await openBlock(d, newBlock);
	await showBlock(d);
	await d.shot("block rows", BLOCK);

	await showBlock(d);
	await d.step("view menu opens", "interaction", () => d.tapOn(SEL.viewButton), { moves: [] });
	await d.shot("view menu", PAGE);
	await d.step("view menu closes", "interaction", () => d.key("Escape"), { moves: [] });

	await chooseMode(d, "By project");
	await showBlock(d);
	await d.shot("block by project", BLOCK);
	await chooseMode(d, "Rows");

	const titles = await d.page<string[]>(`return __e2e.texts(${JSON.stringify(`${SEL.card} ${SEL.title}`)})`);
	const first = titles.find((t) => t.length > 0);
	if (!first || titles.length < 3) throw new Error("the block shows too few cards");
	const cardAt = async (title: string) =>
		d.page<{ x: number; y: number; w: number; h: number; key: string }>(
			`const c = [...document.querySelectorAll(${JSON.stringify(SEL.card)})].find((e) => e.textContent.includes(${JSON.stringify(title)})); const r = c.getBoundingClientRect(); const t = (c.querySelector(${JSON.stringify(SEL.title)})?.textContent ?? c.textContent).trim(); return { x: r.left + r.width / 3, y: r.top + r.height / 2, w: r.width, h: r.height, key: c.dataset.row ?? c.dataset.card ?? t };`,
		);

	await showBlock(d);
	await d.step("a card's menu opens", "interaction", async () => d.tap(await cardAt(first)), { moves: [] });
	await d.shot("task menu", PAGE);
	await d.step("a card's menu closes", "interaction", () => d.key("Escape"), { moves: [] });

	await showBlock(d);
	await d.step("the plus opens a field", "interaction", () => d.tapOn(SEL.plus), { moves: "all" });
	await d.shot("field open", TYPING);
	/** On the phone a tap's mouse events land where the plus stood once it hid under the field's bar; then the field is tapped, as Max would. */
	if (!(await d.page<boolean>(`return !!document.activeElement?.closest(${JSON.stringify(SEL.block)})`))) await d.tapOn(":is(.tc-project-block .tc-quick-row, .tc-n-block [data-n-island])");
	if (!(await d.page<boolean>(`return !!document.activeElement?.closest(${JSON.stringify(SEL.block)})`))) throw new Error("no field in the block takes the focus");
	await d.step("a task typed and written", "interaction", async () => {
		await d.type("E2E typed task");
		await sleep(150);
		await d.key("Enter");
	}, { moves: "all", expectMotion: true });
	await d.step("the field closes", "interaction", () => d.key("Escape"), { moves: "all" });
	await showBlock(d);
	await d.shot("after typing", BLOCK);

	const last = titles[titles.length - 1];
	await showBlock(d);
	const card = await cardAt(last);
	const hold = d.platform === "phone" ? 450 : 0;
	await d.step("a card lifted and let go where it stood", "interaction", () => d.liftAndHold(card, 400), { carried: [card.key], moves: [] });
	await d.step("a card carried up a list and let go", "interaction", () => d.drag(card, { x: card.x, y: card.y - card.h * 2 + 4 }, hold, 24, 20), { carried: [card.key], expectMotion: true });
	await showBlock(d);
	await d.shot("after a drop", BLOCK);

	await plusCarried(d, cardAt, titles);
	await sectionLifted(d);
}

type CardAt = (title: string) => Promise<{ x: number; y: number; w: number; h: number; key: string }>;

/** The plus pressed and moved into a list: a new task's float carried, the field opened where it was let go, closed empty. */
async function plusCarried(d: Driver, cardAt: CardAt, titles: readonly string[]): Promise<void> {
	await showBlock(d);
	const plus = await d.center(SEL.plus);
	const target = await cardAt(titles[1]);
	await d.step("the plus carried into a list and let go", "interaction", () => d.drag(plus, { x: target.x, y: target.y + target.h / 2 }, 0, 24, 20), { moves: "all", expectMotion: true });
	await d.shot("field opened by the plus's drop", TYPING);
	await d.step("the dropped field closes", "interaction", () => d.key("Escape"), { moves: "all" });
	await showBlock(d);
	await d.shot("after the plus's drop", BLOCK);
}

/** A section written into Soon, its header lifted and carried above No section, let go there. */
async function sectionLifted(d: Driver): Promise<void> {
	/** Written as Sync would bring it, before the steps: the file's change is not a gesture of the block. */
	await d.page(`
			const file = app.vault.getAbstractFileByPath("TODOs Tasks.md");
			const text = await app.vault.read(file);
			await app.vault.modify(file, text.replace("\\n- [ ] Подарок для Евы", "\\n### ${SECTION}\\n- [ ] Подарок для Евы"));
			for (let i = 0; i < 50 && ![...document.querySelectorAll(${JSON.stringify(SEL.head)})].some((h) => h.textContent.includes(${JSON.stringify(SECTION)})); i++) await new Promise((r) => setTimeout(r, 100));
			return true;`);
	await d.page("return __e2e.rest()");
	await showBlock(d);
	await d.shot("block with a section", BLOCK);
	const heads = await d.page<{ x: number; y: number; w: number; h: number; text: string }[]>(
		`return [...document.querySelectorAll(${JSON.stringify(SEL.head)})].map((h) => { const r = h.getBoundingClientRect(); return { x: r.left + r.width / 3, y: r.top + r.height / 2, w: r.width, h: r.height, text: h.textContent.trim() }; })`,
	);
	const lifted = heads.find((h) => h.text.includes(SECTION));
	const above = heads.find((h) => !h.text.includes(SECTION));
	if (!lifted || !above) throw new Error(`the block shows no header to lift above: ${heads.map((h) => h.text).join(", ")}`);
	/** The section's cards go with it while it is carried (they fold away and come back where it lands), as a carried card does. */
	const carried = await d.page<string[]>(`
		const head = [...document.querySelectorAll(${JSON.stringify(SEL.head)})].find((h) => h.textContent.includes(${JSON.stringify(SECTION)}));
		const keys = [];
		for (let row = head.nextElementSibling; row && !row.matches(${JSON.stringify(SEL.head)}); row = row.nextElementSibling)
			if (row.matches(${JSON.stringify(SEL.card)})) keys.push((row.dataset.row ?? row.dataset.card ?? (row.querySelector(${JSON.stringify(SEL.title)})?.textContent ?? row.textContent).trim()) + "/1");
		return keys;`);
	const hold = d.platform === "phone" ? 450 : 0;
	await d.step("a section lifted and carried above No section", "interaction", () => d.drag(lifted, { x: lifted.x, y: above.y - above.h }, hold, 24, 20), { carried, moves: "all", expectMotion: true });
	await showBlock(d);
	await d.shot("after a section's move", BLOCK);
}
