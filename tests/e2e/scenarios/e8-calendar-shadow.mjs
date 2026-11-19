import { carry, cardBy } from "../lib/carry.mjs";
import { calendarTools } from "../lib/calendar.mjs";

/** A person aims at what they saw before the screen moved under the card: the place found once. */
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/**
 * The calendar's light shadow (Max, 2026-11-19, Decision 56): every task on the calendar casts `--tc-shadow-block`, so a
 * card's edge reads over the card under it and over an event's tint; the selected one and the new task's field keep it under their ring; the lists'
 * cards cast none. Two cards carried onto an event's start stack over it with «Тренировка»: the shot shows the stack.
 */
export default {
	name: "e8-calendar-shadow",
	features: ["E3: a task on the calendar casts a light shadow, a list's card none (Decision 56)"],
	async run(t) {
		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const cal = calendarTools(t);
		const base = (await cal.timeOf("Созвон с командой")).start - 60;
		const meeting = base + 5 * 60 + 30;
		await cal.scrollTo(base + 5 * 60, 20);
		await t.sleep(300);

		for (const title of ["Разобрать почту", "Полить цветы"]) {
			const card = await cardBy(t, title, "day");
			await carry(t, card, once(() => cal.onHour(meeting, card)));
			await t.sleep(500);
		}
		const placed = await Promise.all(["Разобрать почту", "Полить цветы"].map((title) => cal.timeOf(title)));
		t.expect(placed.every((at) => at?.start === meeting), `two cards carried onto the designer's meeting: ${JSON.stringify(placed)}`);

		const want = await t.cdp.eval(`(() => { const probe = document.createElement("div"); probe.style.boxShadow = "var(--tc-shadow-block)"; document.querySelector(".task-calendar").append(probe); const v = getComputedStyle(probe).boxShadow; probe.remove(); return v; })()`);
		const ring = await t.cdp.eval(`(() => { const probe = document.createElement("div"); probe.style.boxShadow = "var(--tc-ring-selected), var(--tc-shadow-block)"; document.querySelector(".task-calendar").append(probe); const v = getComputedStyle(probe).boxShadow; probe.remove(); return v; })()`);
		t.expect(want && want !== "none", `the token gives a shadow: ${want}`);
		const blocks = await t.cdp.eval(`[...document.querySelectorAll(".tc-items > .tc-block .tc-block-card")].map((c) => [c.querySelector(".tc-card-title")?.textContent, getComputedStyle(c).boxShadow])`);
		t.expect(blocks.length > 5 && blocks.every(([, shadow]) => shadow === want), `every task on the calendar casts the calendar's shadow ${want}: ${JSON.stringify(blocks)}`);
		const cards = await t.cdp.eval(`[...document.querySelectorAll(".tc-list .tc-card")].map((c) => getComputedStyle(c).boxShadow)`);
		t.expect(cards.length > 0 && cards.every((shadow) => shadow === "none"), `a list's card casts none: ${JSON.stringify(cards)}`);
		const events = await t.cdp.eval(`[...document.querySelectorAll(".tc-items > .tc-event, .tc-event-block")].map((e) => getComputedStyle(e).boxShadow)`);
		t.expect(events.every((shadow) => shadow === "none"), `events cast none: ${JSON.stringify(events)}`);

		await cal.scrollTo(base + 5 * 60, 20);
		await t.sleep(400);
		await t.shot("stack-over-event");
		const stack = await t.cdp.eval(`(() => { const r = document.querySelector(".tc-timeline").getBoundingClientRect(); return { x: r.left, y: r.top - 40, width: r.width, height: 280 }; })()`);
		await t.shot("stack-over-event-zoom", stack);

		const gym = await cal.blockBy("Тренировка");
		await cal.tap({ x: gym.x, y: gym.bottom - 8 });
		await t.sleep(500);
		const below = await cal.lineAt(base + 18 * 60);
		await cal.tap({ x: below.x, y: below.y + 10 });
		await t.sleep(400);
		const selected = await t.cdp.eval(`(() => { const c = document.querySelector(".tc-items > .tc-block.is-selected .tc-block-card"); return c ? getComputedStyle(c).boxShadow : null; })()`);
		t.expect(selected === ring, `the selected task keeps the shadow under its ring: ${selected} against ${ring}`);
		await t.shot("stack-over-event-selected");
		await t.shot("stack-over-event-selected-zoom", stack);

		const empty = await cal.lineAt(base + 9 * 60);
		const press = { x: empty.room.left + (empty.room.right - empty.room.left) * 0.6, y: empty.y + 4 };
		const release = await cal.pull(press, { x: press.x, y: press.y + 2 }, { holdMs: 400, steps: 2 });
		await release();
		const field = await t.cdp.eval(`(() => { const f = document.querySelector(".tc-items > .tc-calendar-entry .tc-quick-field"); return f ? getComputedStyle(f).boxShadow : null; })()`);
		t.expect(field === ring, `the new task's field on the calendar casts the shadow under its ring: ${field} against ${ring}`);
	},
};
