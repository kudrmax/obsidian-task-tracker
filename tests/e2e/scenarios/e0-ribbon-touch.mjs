import { cardBy, carry } from "../lib/carry.mjs";

/**
 * E0, the ribbon under a finger on the phone (spec, «Gestures that are not drag», «Which gesture holds the pointer»;
 * CLAUDE.md, «Behaviours Max had to ask for twice»): it follows the finger; let go it goes on past half-way or when flicked,
 * else comes back; one swipe is one stop from the very first; a vertical drag scrolls a list; a card carried sideways after
 * a long press moves the card, never the ribbon.
 */
/**
 * How far the ribbon may trail the finger: Motion draws a value set on an event at its next frame, and the frame sampler
 * may read the pointer of an event that frame has not drawn yet: two of this slow drag's 2 px steps.
 */
const FOLLOW_PX = 4;

export default {
	name: "e0-ribbon-touch",
	features: ["E0: ribbon (touch), gesture slot, Slide"],
	platforms: ["phone"],
	async run(t) {
		const view = await t.oracle.rect(".task-calendar");
		const y = view.top + view.height * 0.45;
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);
		const flick = (dir) => t.input.swipe({ x: view.left + view.width * (dir > 0 ? 0.7 : 0.3), y }, { x: view.left + view.width * (dir > 0 ? 0.3 : 0.7), y: y + 4 }, { steps: 6, stepMs: 12 });

		const first = await t.frames(() => flick(-1), { cast: "first-flick", maxStep: 260 });
		await t.sleep(500);
		await is(["Soon", "Today"], "the first flick after opening moves exactly one stop");
		t.expect(first.length === 0, `frames of the first flick: ${JSON.stringify(first.slice(0, 3))}`);
		await flick(-1);
		await t.sleep(600);
		await is(["Inbox", "Soon"], "a second flick, one more");
		const rubber = await t.frames(() => flick(-1), { maxStep: 260 });
		await t.sleep(500);
		await is(["Inbox", "Soon"], "past Inbox the screen gives and springs back");
		t.expect(rubber.length === 0, `frames of the rubber band: ${JSON.stringify(rubber.slice(0, 3))}`);

		/**
		 * The slow drags start on a column's head: Chromium (this phone view) holds back a finger's touch moves until it has
		 * gone ~15 px, so on a card a finger slower than that per 250 ms reads as dnd-kit's long press. iOS sends every move
		 * (spec, «Decisions»: checked on the iPhone with Max).
		 */
		const head = await t.oracle.rect(".tc-stage-col.is-inbox .tc-stage-head");
		const slowY = head.y;
		const short = await t.frames(() => t.input.swipe({ x: view.left + view.width * 0.6, y: slowY }, { x: view.left + view.width * 0.45, y: slowY }, { steps: 30, stepMs: 25, restMs: 150 }), { cast: "slow-short", follow: { tolerance: FOLLOW_PX, until: 60 } });
		await t.sleep(500);
		await is(["Inbox", "Soon"], "a slow drag short of half-way comes back");
		t.expect(short.length === 0, `the screen follows the finger: ${JSON.stringify(short.slice(0, 3))}`);
		await t.input.swipe({ x: view.left + view.width * 0.85, y: slowY }, { x: view.left + view.width * 0.1, y: slowY }, { steps: 40, stepMs: 25, restMs: 150 });
		await t.sleep(600);
		await is(["Soon", "Today"], "a slow drag past half-way moves one stop");

		await flick(1);
		await t.sleep(90);
		const two = await t.frames(() => flick(1), { cast: "two-flicks", maxStep: 260, settleMs: 700 });
		await is(["Tomorrow"], "two quick flicks on, the second during the landing: two stops, to tomorrow's calendar");
		t.expect(two.length === 0, `frames of the day sliding: ${JSON.stringify(two.slice(0, 3))}`);
		await flick(-1);
		await t.sleep(600);
		await is(["Today"], "a flick back on tomorrow turns back to today");

		const list = await t.oracle.rect('[data-list="day"]');
		const before = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		const scroll = await t.frames(() => t.input.swipe({ x: list.x, y: list.top + list.height * 0.7 }, { x: list.x + 6, y: list.top + list.height * 0.2 }, { steps: 12, stepMs: 16 }), { cast: "vertical" });
		await t.sleep(400);
		const after = await t.cdp.eval(`document.querySelector('[data-list="day"]').scrollTop`);
		t.expect(after > before + 100, `a vertical drag scrolls the list: ${before} → ${after}`);
		await is(["Today"], "and moves no stop");
		t.expect(scroll.length === 0, `frames of a scroll: ${JSON.stringify(scroll.slice(0, 3))}`);

		/** The gesture slot: held past the long press, a card carried sideways moves the card, not the ribbon. */
		await t.setStop("soon");
		const soon = (await t.oracle.cards("soon"))[1];
		const card = await cardBy(t, soon, "soon");
		const sideways = await t.frames(() => carry(t, card, async () => ({ x: card.x + view.width * 0.35, y: card.y + 3 })), { cast: "long-press-sideways", maxStep: 260, carried: { id: card.id, from: 0, until: 1200 } });
		await t.sleep(500);
		await is(["Soon", "Today"], "a card carried sideways after a long press leaves the ribbon where it stood");
		t.expect(sideways.length === 0, `frames of a card carried sideways: ${JSON.stringify(sideways.slice(0, 3))}`);
	},
};
