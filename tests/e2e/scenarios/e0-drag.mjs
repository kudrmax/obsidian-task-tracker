import { carry, cardBy } from "../lib/carry.mjs";

/** A person aims at a card as they saw it before the cards parted: the place under it, once. */
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/**
 * E0, drag and drop (spec, «Drag and drop», «Decided» 1, principle 5): a card carried within Inbox (the mouse on the Mac,
 * a long press on the phone) parts the cards, its place shows where it will land, and let go it is there in the file and
 * on the screen, seen every frame as its card or its copy; a cancelled drag writes nothing; a task arriving from outside
 * during a drag waits and is drawn after the drop, the carried card never removed under the finger.
 */
export default {
	name: "e0-drag",
	features: ["E0: drag, gesture slot, data during a drag"],
	async run(t) {
		await t.setStop("inbox");
		const inbox = async () => (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const [a, b, c, d] = await inbox();
		const lifted = await cardBy(t, b, "inbox");
		let place = null;
		const within = await t.frames(
			() =>
				carry(t, lifted, once(async () => {
					const below = await cardBy(t, d, "inbox");
					return { x: lifted.x, y: below.bottom - 4 };
				}), { during: async () => (place = await t.cdp.eval(`(() => { const p = document.querySelector('[data-list="inbox"] .tc-drag-source.is-lifted'); const q = [...document.querySelectorAll('[data-list="inbox"] .tc-card[data-id]')].find((c) => c.querySelector('.tc-card-title').textContent === ${JSON.stringify(d)}); return p && q ? p.getBoundingClientRect().top - q.getBoundingClientRect().top : null; })()`)) }),
			{ cast: "within", maxStep: 60, carried: { id: lifted.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		t.expect(place !== null && place > 0, `while carried, its place stands below the fourth card (the cards parted): ${place}`);
		t.expect(JSON.stringify((await inbox()).slice(0, 4)) === JSON.stringify([a, c, d, b]), `the file has it there: ${JSON.stringify((await inbox()).slice(0, 4))}`);
		t.expect(JSON.stringify((await t.oracle.cards("inbox")).slice(0, 4)) === JSON.stringify([a, c, d, b]), `the screen shows it there: ${JSON.stringify((await t.oracle.cards("inbox")).slice(0, 4))}`);
		t.expect(within.length === 0, `frames of a drag within a list: ${JSON.stringify(within.slice(0, 4))}`);

		/** Data during a drag: a task comes from outside while the card is held. */
		const held = await cardBy(t, a, "inbox");
		let firstDuring = null;
		const during = await t.frames(
			() =>
				carry(t, held, once(async () => {
					const below = await cardBy(t, c, "inbox");
					return { x: held.x, y: below.bottom - 4 };
				}), {
					during: async () => {
						await t.stand(`addFromOutside("inbox", "Пришла во время переноса")`);
						await t.sleep(150);
						firstDuring = (await t.oracle.cards("inbox"))[0];
					},
				}),
			{ cast: "data-during-drag", maxStep: 60, carried: { id: held.id, from: 0, until: 1500 } },
		);
		await t.sleep(600);
		t.expect(firstDuring !== "Пришла во время переноса", `while the card is held, the screen stays still: the first card is ${firstDuring}`);
		const after = await inbox();
		t.expect(after[0] === "Пришла во время переноса" && (await t.oracle.cards("inbox"))[0] === "Пришла во время переноса", `after the drop the task from outside is drawn: ${JSON.stringify((await t.oracle.cards("inbox")).slice(0, 4))}`);
		t.expect(after.indexOf(a) === after.indexOf(c) + 1, `and the carried card landed below the one aimed at: ${JSON.stringify(after.slice(0, 5))}`);
		t.expect(during.length === 0, `frames of a drag with data arriving: ${JSON.stringify(during.slice(0, 4))}`);

		if (t.platform === "desktop") {
			const before = await t.file();
			const back = await cardBy(t, (await inbox())[2], "inbox");
			const cancelled = await t.frames(() => carry(t, back, async () => ({ x: back.x, y: back.y + 120 }), { end: "cancel" }), { cast: "cancel", maxStep: 60, carried: { id: back.id, from: 0, until: 1200 } });
			await t.sleep(400);
			t.expect((await t.file()) === before, "a cancelled drag writes nothing");
			t.expect(cancelled.length === 0, `frames of a cancelled drag: ${JSON.stringify(cancelled.slice(0, 4))}`);
		}
		await t.shot("after-drags");
	},
};
