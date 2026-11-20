import { carry } from "../lib/carry.mjs";

/**
 * Step 7 under a finger on the phone (spec 2026-11-18, Decisions 63 and 64): a finger moves the ribbon from anywhere inside
 * a column, not only from the titles. A sideways swipe started over a card or over the
 * calendar's empty time moves the columns one stop and lifts nothing; a vertical swipe over the cards scrolls the list and
 * moves no stop; a press held past the long press lifts the card, and carried sideways it moves the card, never the ribbon
 * (stage 0, blocker 10: a finger that moves before the long press is a swipe).
 */
export default {
	name: "e9-ribbon-follow-cards",
	features: ["Step 7: swipe the columns (touch over cards and the calendar)"],
	platforms: ["phone"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-swipe"); await new Promise((r) => setTimeout(r, 800)); return 1; })()`);
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);
		const scrollLeft = () => t.cdp.eval(`document.querySelector(".tc-ribbon-track").getBoundingClientRect().left`);
		const lifted = () => t.cdp.eval(`document.querySelectorAll(".tc-drag-source.is-lifted").length`);
		const swipeBack = (at) => t.input.swipe(at, { x: at.x + 150, y: at.y + 3 }, { steps: 8, stepMs: 14 });
		const swipeOn = (at) => t.input.swipe(at, { x: at.x - 150, y: at.y + 3 }, { steps: 8, stepMs: 14 });

		await is(["Today"], "the step opens at the day and its calendar");

		const card = await t.oracle.rect('[data-list="day"] .tc-card[data-id]', 1);
		let liftedDuring = 0;
		const overCard = { x: card.x, y: card.y };
		const watch = setInterval(async () => (liftedDuring = Math.max(liftedDuring, await lifted().catch(() => 0))), 40);
		await swipeBack(overCard);
		clearInterval(watch);
		await t.sleep(800);
		await is(["Soon", "Today"], "a sideways swipe started over a card moves the columns one stop back");
		t.expect(liftedDuring === 0, `and lifts no card: ${liftedDuring}`);
		t.expect((await lifted()) === 0, "no card is left lifted");

		const soonCard = await t.oracle.rect('[data-list="soon"] .tc-card[data-id]', 0);
		await swipeOn({ x: soonCard.x, y: soonCard.y });
		await t.sleep(800);
		await is(["Today"], "a sideways swipe on over a card in Soon: on to the day");

		const empty = await t.cdp.eval(`(() => {
			const room = document.querySelector(".tc-stage-col.is-timeline .tc-timeline").getBoundingClientRect();
			const x = room.left + room.width * 0.6;
			for (let y = room.top + 10; y < room.bottom - 10; y += 6) {
				const el = document.elementFromPoint(x, y);
				if (el && !el.closest(".tc-block, .tc-event, .tc-now, .tc-allday, .tc-plus")) return { x, y };
			}
			return null;
		})()`);
		t.expect(empty !== null, "the calendar shows empty time");
		if (empty) {
			await swipeBack(empty);
			await t.sleep(800);
			await is(["Soon", "Today"], "a sideways swipe started over the calendar's empty time moves the columns one stop back");
			t.expect((await lifted()) === 0, "and puts no new task's place there");
			await swipeOn({ x: soonCard.x, y: soonCard.y });
			await t.sleep(800);
			await is(["Today"], "and on again");
		}

		const list = await t.oracle.rect('[data-list="day"]');
		const before = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		await t.input.swipe({ x: list.x, y: list.top + list.height * 0.7 }, { x: list.x + 6, y: list.top + list.height * 0.2 }, { steps: 12, stepMs: 16 });
		await t.sleep(600);
		const after = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		t.expect(after > before + 100, `a vertical swipe over the cards scrolls the list: ${before} → ${after}`);
		await is(["Today"], "and moves no stop");
		await t.input.swipe({ x: list.x, y: list.top + list.height * 0.2 }, { x: list.x, y: list.top + list.height * 0.8 }, { steps: 12, stepMs: 16 });
		/** The list's fling ends before the press: a finger landing on a list still scrolling stops it, and the card moving under it is no long press. */
		await t.waitFor(async () => {
			const a = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
			await t.sleep(200);
			return a === (await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`));
		}, 3000);

		/**
		 * The card a person presses is one they see: the swipe back need not bring the list to its very top (how far a fling
		 * carries depends on the pace the events reach the page), and a card left above the list's edge is under no finger.
		 */
		const held = await t.cdp.eval(`(() => {
			for (const card of document.querySelectorAll('[data-list="day"] .tc-card[data-id]')) {
				const r = card.getBoundingClientRect();
				const x = r.left + r.width / 2;
				const y = r.top + r.height / 2;
				if (document.elementFromPoint(x, y)?.closest(".tc-card") === card) return { x, y };
			}
			return null;
		})()`);
		t.expect(held !== null, "the day shows a card to press");
		if (!held) return;
		const ribbonBefore = await scrollLeft();
		let up = 0;
		let ribbonDuring = ribbonBefore;
		await carry(t, { x: held.x, y: held.y }, async () => ({ x: held.x + list.width * 0.6, y: held.y + 3 }), {
			end: "cancel",
			during: async () => {
				up = await lifted();
				ribbonDuring = await scrollLeft();
			},
		});
		await t.sleep(700);
		t.expect(up > 0, "a press held past the long press lifts the card");
		t.expect(Math.abs(ribbonDuring - ribbonBefore) < 1, `and carried sideways the ribbon stays: ${ribbonBefore} → ${ribbonDuring}`);
		await is(["Today"], "after the card is let go the columns stand where they stood");
	},
};
