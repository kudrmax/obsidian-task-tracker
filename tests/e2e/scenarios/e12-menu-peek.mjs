import { cardBy } from "../lib/carry.mjs";
import { menuFrames, menuNow, openingFaults } from "../lib/menu.mjs";

const TITLE = "Задача с описанием";

/**
 * A task's notes in its menu (Decision 124, Max's variant 2, 2026-11-20): no panel of their own over the menu; the copy of
 * the task on top of the menu shows them under its title, drawn by Obsidian as on the full screen, the copy as wide as
 * the menu (its card where that is wider), the panel right under it on its left edge. They unfold as the menu opens, the copy and the panel moving as one.
 */
export default {
	name: "e12-menu-peek",
	features: ["E4: a task's notes in the menu's copy (F129, F130; Decision 124)"],
	async run(t) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		await t.setStop("calendar");
		const card = await cardBy(t, TITLE, "day");
		const frames = await menuFrames(t, () => tap(card), 900);
		t.expect(openingFaults(frames, card).length === 0, `the menu opens as designed: ${JSON.stringify(openingFaults(frames, card).slice(0, 4))}`);
		const menu = await menuNow(t);
		const notes = await t.cdp.eval(`(() => { const n = document.querySelector(".tc-menu-over .tc-copy-notes .tc-desc-text.markdown-rendered"); if (!n) return null; const r = n.getBoundingClientRect(); return { top: r.top, text: n.textContent }; })()`);
		t.expect(await t.cdp.eval(`!document.querySelector(".tc-menu-layer .tc-desc-peek")`), "no panel of its own over the menu");
		t.expect(notes && notes.text.includes("первая строка описания") && notes.top > menu.copy.top + 10, `the notes under the title in the copy, Obsidian's markdown: ${JSON.stringify(notes)} copy ${JSON.stringify(menu.copy)}`);
		const panel = menu.panels[0];
		t.expect(panel && Math.abs(menu.copy.width - Math.max(card.width, panel.width)) <= 1 && Math.abs(menu.copy.left - panel.left) <= 1 && Math.abs(panel.top - (menu.copy.bottom + 12)) <= 1, `the copy as wide as the menu (or its card where wider), the panel on its left edge 12 px under it: copy ${JSON.stringify(menu.copy)} panel ${JSON.stringify(panel)} card ${card.width}`);
		await t.shot("notes");
	},
};
