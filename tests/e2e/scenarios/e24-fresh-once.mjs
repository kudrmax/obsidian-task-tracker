import { calendarTools } from "../lib/calendar.mjs";
import { cardBy, carry } from "../lib/carry.mjs";

/**
 * A task comes in once (Decision 132, 1 and 4): new on the screen, its card fades in as it is first drawn, and never
 * again. Carried onto the calendar a moment later, its block stands there whole from its first frame, under the copy
 * landing on it (Decision 121's flight), never fading in: its place while it is carried over the calendar too.
 */
const WHOLE = 0.9;

export default {
	name: "e24-fresh-once",
	features: ["E2: a card comes in once (F21, F296; Decision 121)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const base = (await cal.timeOf("Созвон с командой")).start;
		await cal.scrollTo(base);
		await t.sleep(300);
		await t.stand(`addFromOutside("now", "Свежая задача")`);
		await t.sleep(600);
		const fresh = await cardBy(t, "Свежая задача", "day");
		if (!t.expect(fresh !== null, "the new task comes into today's list")) return;
		/** The block's own box in every frame of the carry, from its first one over the calendar: how visible it is itself, its insides aside (they wait for the copy). */
		const watch = `(() => { window.__fresh = []; const t0 = performance.now(); (function look() { const el = document.querySelector('.tc-timeline [data-block="${fresh.id}"]')?.closest(".tc-block"); window.__fresh.push(el ? +getComputedStyle(el).opacity : null); if (performance.now() - t0 < 3500) requestAnimationFrame(look); })(); return 1; })()`;
		let aim = null;
		await t.cdp.eval(watch);
		await carry(t, fresh, async () => (aim ??= await cal.onHour(base + 2 * 60, fresh)));
		await t.sleep(1400);
		t.expect((await cal.blockBy("Свежая задача")) !== null, "carried onto the calendar it stands there");
		const seen = ((await t.cdp.eval("window.__fresh")) ?? []).filter((o) => o !== null);
		t.expect(seen.length > 0 && seen.every((o) => o >= WHOLE), `its block is whole from its first frame, never fading in: ${JSON.stringify(seen.slice(0, 16))}`);
	},
};
