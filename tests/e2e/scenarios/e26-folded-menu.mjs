import { calendarTools } from "../lib/calendar.mjs";

/**
 * Max, 2026-11-12: a tap on a card opens that card's menu, wherever on it the tap lands. A folded task's card shows its
 * next step in big type, yet its menu is the folded task's own; the step's menu is reached by unfolding it. On the
 * calendar the folded task's block is named by its next step («Переезд» → «Упаковать книги»), and a tap anywhere on it,
 * on the step's title too, opens «Переезд»'s menu.
 */
export default {
	name: "e26-folded-menu",
	features: ["F79, F94: a folded task's own menu (Max, 2026-11-12)"],
	async run(t) {
		const cal = calendarTools(t);
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Упаковать книги")); el.scrollIntoView({ block: "center" }); return 1; })()`);
		await t.sleep(300);
		const block = await cal.blockBy("Упаковать книги");
		t.expect(!!block, "the folded task's block is named by its next step");
		if (!block) return;
		const own = block.id;
		const fileLine = (await cal.file()).split("\n").find((l) => l.includes("Переезд"));
		t.expect(!!fileLine && /📁/u.test(fileLine), `the block's task is the folded «Переезд»: ${fileLine}`);
		for (const where of ["the step's title", "the block's edge"]) {
			const title = await t.cdp.eval(`(() => { const el = document.querySelector('[data-block="${own}"]'); const target = ${where === "the step's title" ? `el.querySelector(".tc-card-title")` : "el"}; const r = target.getBoundingClientRect(); return { x: r.left + ${where === "the step's title" ? "r.width / 2" : "6"}, y: r.top + Math.min(r.height / 2, 12) }; })()`);
			await cal.tap(title);
			await t.sleep(700);
			const menuOf = await t.cdp.eval(`window.__tcStand.debug()[0].menuOf`);
			t.expect(menuOf === own, `a tap on ${where} opens the folded task's own menu: ${menuOf} for ${own}`);
			await t.cdp.eval(`(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return 1; })()`);
			await t.cdp.eval(`(() => { document.querySelector(".tc-backdrop")?.click(); return 1; })()`);
			await t.sleep(600);
		}
	},
};
