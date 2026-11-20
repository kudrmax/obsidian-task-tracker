import { cardBy } from "../lib/carry.mjs";
import { menuFrames, menuNow, openingFaults } from "../lib/menu.mjs";

const TITLE = "Задача с описанием";

/**
 * E4, the start of a description by the menu (F129, F130; the design's «Описание задачи»): a task with a description
 * opens its menu with the description's start drawn by Obsidian; by a panel split over and under the copy it stands right
 * of the part over the copy (over the copy at its left when the panel stands whole under it), its bottom 10 px over the copy, appearing with the menu; on the phone, by a split menu, there is no room
 * beside it, and it stays away. A tap on it closes the menu (the full screen is part 2's) and writes nothing.
 */
export default {
	name: "e12-menu-peek",
	features: ["E4: the description's start by the menu (F129, F130)"],
	async run(t) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		await t.setStop("calendar");
		const card = await cardBy(t, TITLE, "day");
		const frames = await menuFrames(t, () => tap(card), 500);
		t.expect(openingFaults(frames, card).length === 0, `the menu opens as designed: ${JSON.stringify(openingFaults(frames, card).slice(0, 4))}`);
		const peek = await t.cdp.eval(`(() => { const p = document.querySelector(".tc-menu-layer .tc-desc-peek"); if (!p) return null; const r = p.getBoundingClientRect(); let o = 1; for (let n = p; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity; return { left: r.left, top: r.top, bottom: r.bottom, width: r.width, o, text: p.textContent }; })()`);
		const menu = await menuNow(t);
		const upper = menu.panels.find((p) => p.above);
		await t.shot("peek");
		if (t.platform === "desktop") {
			t.expect(peek && peek.o > 0.99 && peek.text.includes("первая строка описания"), `the description's start shows by the menu: ${JSON.stringify(peek)}`);
			/** Right of the part over the copy when the panel splits; over the copy at its left when the panel stands whole under it. */
			const left = upper ? upper.right + 12 : menu.copy.left;
			t.expect(peek && Math.abs(peek.left - left) <= 1 && Math.abs(peek.bottom - (menu.copy.top - 10)) <= 1 && Math.abs(peek.width - 300) <= 0.5, `by the menu, 10 px over the copy, 300 wide: ${JSON.stringify(peek)} upper ${JSON.stringify(upper)} copy ${JSON.stringify(menu.copy)}`);
			const before = await t.file();
			await tap({ x: peek.left + 40, y: peek.top + 16 });
			await t.sleep(400);
			t.expect((await menuNow(t)) === null && (await t.file()) === before, "a tap on it closes the menu and writes nothing on the stand");
		} else {
			/** By a split menu there is no room beside it: away; by a panel whole under the copy it stands over the copy. */
			if (menu.panels.length === 2) t.expect(peek && peek.o < 0.01, `on the phone, by a split menu, no room beside it: away: ${JSON.stringify(peek)}`);
			else t.expect(peek && peek.o > 0.99 && Math.abs(peek.bottom - (menu.copy.top - 10)) <= 1, `on the phone, by a panel under the copy, over the copy: ${JSON.stringify(peek)} copy ${JSON.stringify(menu.copy)}`);
		}
	},
};
