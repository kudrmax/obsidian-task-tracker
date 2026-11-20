import { carry, cardBy } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/** Every frame of the copy's flight, from the release until it is gone, and the box of the card left where it landed. */
async function flight(t, grabbed, target, landedBy) {
	await t.cdp.eval(`(() => { window.__flight = null; return 1; })()`);
	await carry(t, grabbed, target, {
		during: () =>
			t.cdp.eval(`(() => { window.__flight = []; const t0 = performance.now(); (function look() { const r = document.querySelector(".tc-overlay :is(.tc-card, .tc-block-card)")?.getBoundingClientRect(); window.__flight.push(r ? { t: performance.now() - t0, left: r.left, width: r.width, height: r.height } : null); if (performance.now() - t0 < 1200) requestAnimationFrame(look); })(); return 1; })()`),
	});
	await t.sleep(1400);
	const frames = (await t.cdp.eval("window.__flight")) ?? [];
	const flying = frames.slice(0, frames.indexOf(null) < 0 ? frames.length : frames.indexOf(null)).filter(Boolean);
	const box = await landedBy();
	return { flying, landed: box && { left: box.left, width: box.right - box.left } };
}

/**
 * Max, 2026-11-20 (the stand's review, #5, reported about five times): carried between the calendar and a list and let
 * go, the card grew part of the way, stopped, then jumped to its full width. dnd-kit's overlay keeps the size of what was
 * lifted, and the copy was held to it; now the copy flies to its place's width in one motion: its width goes one way
 * only, and its last frame is the card's own box, so nothing jumps when the copy goes. A narrow stacked block into the
 * wider list, and a list's card onto the calendar.
 *
 * Max, the same review (#6): «Переезд» carried onto the calendar turned into «Упаковать книги». A folded task's block is
 * named by its next step (F94) and its list card drew only its own title; the card now shows the step under the task's
 * title (F79), so carried off the calendar it is the same task with the same step.
 */
export default {
	name: "e7-calendar-drop-flight",
	features: ["E1: the drop's flight into its place's shape (Decision 26)", "F79: a folded card names its next step", "F94: a folded task's block is named by its next step"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const base = (await cal.timeOf("Созвон с командой")).start - 60;
		await cal.scrollTo(base + 60);
		await t.sleep(300);

		const check = (what, { flying, landed }) => {
			const widths = flying.map((f) => f.width);
			const last = flying.at(-1);
			const grows = widths.every((w, i) => i === 0 || (w - widths[i - 1]) * Math.sign(landed.width - widths[0]) >= -0.5);
			t.expect(flying.length > 3 && landed && last && Math.abs(last.width - landed.width) <= 1 && Math.abs(last.left - landed.left) <= 1, `${what}: the copy's last frame is the card's box (copy ${JSON.stringify(last)}, card ${JSON.stringify(landed)})`);
			t.expect(grows, `${what}: the copy's width goes one way, no stop and jump: ${widths.map(Math.round).join(" ")} → ${landed && Math.round(landed.width)}`);
		};

		const doctor = await cal.blockBy("Звонок врачу");
		const flowers = await cardBy(t, "Полить цветы", "day");
		check("a stacked block into today's list", await flight(t, doctor, once(async () => ({ x: flowers.x, y: flowers.top + 4 })), () => cardBy(t, "Звонок врачу", "day")));

		const mail = await cardBy(t, "Разобрать почту", "day");
		check("a list's card onto the calendar", await flight(t, mail, once(() => cal.onHour(base + 3 * 60, mail)), () => cal.blockBy("Разобрать почту")));

		const step = await cal.blockBy("Упаковать книги");
		t.expect(step !== null, "«Переезд», folded, stands on the calendar named by its next step «Упаковать книги»");
		const milk = await cardBy(t, "Купить молоко", "day");
		await carry(t, step, once(async () => ({ x: milk.x, y: milk.top + 4 })));
		await t.sleep(600);
		const card = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll('[data-list="day"] .tc-card[data-id]')].find((c) => c.querySelector(".tc-card-over-text")?.textContent === "Переезд"); return el ? { step: el.querySelector(".tc-card-title")?.textContent, collapsed: el.dataset.collapsed, height: el.getBoundingClientRect().height } : null; })()`);
		t.expect(card?.step === "Упаковать книги" && card.collapsed === "true", `carried into today's list it is «Переезд» small over its step «Упаковать книги», folded: ${JSON.stringify(card)}`);
		const back = await cardBy(t, "Упаковать книги", "day");
		await carry(t, back, once(() => cal.onHour(base + 4 * 60, back)));
		await t.sleep(600);
		t.expect((await cal.blockBy("Упаковать книги")) !== null && (await cal.timeOf("Переезд")) !== null, "carried back onto the calendar it is the same task, named by the same step");
	},
};
