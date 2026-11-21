import { menuNow } from "../lib/menu.mjs";

/**
 * E4, the menu over what shows (the design's «Полная карточка», the plugin's `menuRoom`): a card or a block partly out of
 * its column's sight, tapped, is scrolled into it first, and the copy stands over the whole of it; on the phone the menu
 * keeps out of the safe areas (the status bar, the home indicator), set here as an iPhone's by the browser's override.
 */
export default {
	name: "e16-menu-reveal",
	features: ["E4: the menu over a card partly out of sight, and inside the phone's safe areas"],
	cases: ["list", "calendar", "safe areas"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		if (item === "list") {
			await t.setStop("inbox");
			/** A card cut by the list's bottom edge: the list scrolled so the edge runs through one; tapped in its middle, clear of the Undo capsule over the list's corner. */
			/** The list scrolled so its bottom edge runs through a card, as a person leaves it. */
			await t.cdp.eval(`(() => { const s = document.querySelector('[data-list="inbox"]'); const box = s.getBoundingClientRect(); const c = [...s.querySelectorAll(".tc-card[data-id]")].map((e) => e.getBoundingClientRect()).find((r) => r.bottom > box.bottom); if (c) s.scrollTop += c.top + c.height / 2 - box.bottom; return 1; })()`);
			await t.sleep(300);
			const cut = await t.cdp.eval(`(() => { const s = document.querySelector('[data-list="inbox"]'); const box = s.getBoundingClientRect(); const hit = [...s.querySelectorAll(".tc-card[data-id]")].map((c) => ({ c, r: c.getBoundingClientRect() })).find(({ r }) => r.top < box.bottom - 8 && r.bottom > box.bottom + 4); if (!hit) return null; return { id: hit.c.dataset.id, title: hit.c.querySelector(".tc-card-title").textContent, x: hit.r.left + hit.r.width / 2, y: (hit.r.top + box.bottom) / 2, bottom: box.bottom, top: box.top }; })()`);
			if (!t.expect(cut !== null, "a card cut by the list's bottom edge")) return;
			await tap(cut);
			await t.sleep(t.platform === "phone" ? 600 : 850);
			const menu = await menuNow(t);
			const card = await t.cdp.eval(`(() => { const r = document.querySelector('[data-list="inbox"] .tc-card[data-id="${cut.id}"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left }; })()`);
			t.expect(card.bottom <= cut.bottom + 1, `the list scrolled the card into its sight: ${JSON.stringify(card)} edge ${cut.bottom}`);
			/** The block stands over its card, or higher where the room under the card can't take the panel (Decision 120): the copy on the card's left, never under it. */
			t.expect(menu && Math.abs(menu.copy.left - card.left) <= 1 && menu.copy.top <= card.top + 1 && menu.copyText.includes(cut.title), `the copy stands over the card or above it: ${JSON.stringify(menu?.copy)} card ${JSON.stringify(card)}`);
		}
		if (item === "calendar") {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const room = await t.oracle.rect(".tc-timeline");
			/** «Обед» half under the calendar's top: the calendar scrolled so its top edge runs through the block. */
			await t.cdp.eval(`(() => { const t = document.querySelector(".tc-timeline"); const b = [...document.querySelectorAll("[data-block]")].find((e) => e.textContent.includes("Обед")); const r = b.getBoundingClientRect(); t.scrollTop += r.top - t.getBoundingClientRect().top + r.height / 2; return 1; })()`);
			await t.sleep(300);
			const half = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll("[data-block]")].find((e) => e.textContent.includes("Обед")); const r = b.getBoundingClientRect(); return { x: r.left + 30, y: r.bottom - 6, top: r.top }; })()`);
			t.expect(half.top < room.top, `the block starts above the calendar's sight: ${half.top} < ${room.top}`);
			await tap(half);
			await t.sleep(450);
			const block = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll("[data-block]")].find((e) => e.textContent.includes("Обед")); const r = b.getBoundingClientRect(); return { top: r.top, height: r.height }; })()`);
			const menu = await menuNow(t);
			t.expect(block.top >= room.top - 1, `the calendar scrolled the block into its sight: ${JSON.stringify(block)} room ${room.top}`);
			t.expect(menu && Math.abs(menu.copy.top - block.top) <= 1 && Math.abs(menu.copy.height - block.height) <= 1, `the copy is the whole block: ${JSON.stringify(menu?.copy)} block ${JSON.stringify(block)}`);
		}
		if (item === "safe areas") {
			const set = await t.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, bottom: 34, left: 0, right: 0 } }).then(() => true, () => false);
			if (!t.expect(set, "the browser takes a safe area override")) return;
			await t.sleep(200);
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[0];
			const card = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll('[data-list="day"] .tc-card[data-id]')].find((e) => e.textContent.includes(${JSON.stringify(title)})); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + r.height / 2 }; })()`);
			await tap(card);
			await t.sleep(450);
			const menu = await menuNow(t);
			const h = await t.cdp.eval("innerHeight");
			t.expect(menu && menu.panels.every((p) => p.top >= 59 + 10 - 1 && p.bottom <= h - 34 - 10 + 1), `every part of the menu inside the safe areas, 10 px in: ${JSON.stringify(menu?.panels)}`);
			await t.shot("safe-areas");
			await t.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0, left: 0, right: 0 } }).catch(() => undefined);
		}
	},
};
