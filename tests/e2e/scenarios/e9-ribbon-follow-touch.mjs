/**
 * Step 7 under a finger on the phone (plan 2026-11-19; stage0.md, «Round seven»): the columns follow the finger; held
 * mid-way and let go they land on the nearest stop; a flick goes one stop, never two; two quick flicks, the second during
 * the first's landing, go two stops, one each; past the row's ends nothing moves.
 */
/** How far the strip may trail the finger: Motion draws a value set on an event at its next frame (e0-ribbon-touch). */
const FOLLOW_PX = 4;

export default {
	name: "e9-ribbon-follow-touch",
	features: ["Step 7: swipe the columns (touch)"],
	platforms: ["phone"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-swipe"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.setStop("soon");
		const view = await t.oracle.rect(".task-calendar");
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const is = async (want, what) => t.expect(JSON.stringify(await columns()) === JSON.stringify(want), `${what}: ${JSON.stringify(await columns())}`);
		const head = await t.oracle.rect(".tc-stage-col.is-soon .tc-stage-head");
		const y = head.y;
		const flick = (dir) => t.input.swipe({ x: view.left + view.width * (dir > 0 ? 0.7 : 0.3), y }, { x: view.left + view.width * (dir > 0 ? 0.3 : 0.7), y: y + 2 }, { steps: 6, stepMs: 12 });
		/** A slow finger, under 3 px a move: the frames read the strip before Motion draws the frame's move, so a larger move would read as a lag of one move. */
		const held = (from, to) => t.input.swipe({ x: view.left + view.width * from, y }, { x: view.left + view.width * to, y }, { steps: Math.ceil((Math.abs(to - from) * view.width) / 2.5), stepMs: 12, restMs: 200 });

		await is(["Soon", "Today"], "the step opens at Soon");
		const short = await t.frames(() => held(0.7, 0.5), { cast: "held-short", follow: { tolerance: FOLLOW_PX, until: 60 } });
		await t.sleep(500);
		await is(["Soon", "Today"], "held under half a place on and let go: back to Soon");
		t.expect(short.length === 0, `the columns follow the finger: ${JSON.stringify(short.slice(0, 3))}`);

		const long = await t.frames(() => held(0.9, 0.2), { cast: "held-long", follow: { tolerance: FOLLOW_PX, until: 60 } });
		await t.sleep(500);
		await is(["Today"], "held past half-way on and let go: on to the calendar");
		t.expect(long.length === 0, `the columns follow the finger: ${JSON.stringify(long.slice(0, 3))}`);

		await flick(1);
		await t.sleep(500);
		await is(["Today"], "a flick on at the calendar moves nothing: no day pages in this step");

		const one = await t.frames(() => flick(-1), { cast: "flick", maxStep: 260 });
		await t.sleep(500);
		await is(["Soon", "Today"], "a flick back: one stop");
		t.expect(one.length === 0, `frames of a flick: ${JSON.stringify(one.slice(0, 3))}`);

		const far = await t.frames(() => t.input.swipe({ x: view.left + view.width * 0.05, y }, { x: view.left + view.width * 0.98, y: y + 2 }, { steps: 5, stepMs: 10 }), { cast: "far-flick", maxStep: 260 });
		await t.sleep(500);
		await is(["Inbox", "Soon"], "a long fast flick back: still one stop");
		t.expect(far.length === 0, `frames of a long flick: ${JSON.stringify(far.slice(0, 3))}`);

		await flick(1);
		await t.sleep(90);
		const two = await t.frames(() => flick(1), { cast: "two-flicks", maxStep: 260, settleMs: 700 });
		await is(["Today"], "two quick flicks on, the second during the landing: two stops, one each");
		t.expect(two.length === 0, `frames of two quick flicks: ${JSON.stringify(two.slice(0, 3))}`);

		await flick(-1);
		await t.sleep(600);
		await flick(-1);
		await t.sleep(600);
		await flick(-1);
		await t.sleep(600);
		await is(["Inbox", "Soon"], "a flick back at Inbox moves nothing");
	},
};
