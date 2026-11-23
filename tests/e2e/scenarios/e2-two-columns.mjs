import { carry, cardBy } from "../lib/carry.mjs";

/** A person aims at a card as they saw it before the cards parted: the place under it, once. */
const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/**
 * Step 2 (spec 2026-11-18, «Part 1, step by step»): two columns side by side, Inbox and Soon, and a card carried between
 * them. Into the other list it lands where the cards parted for it, both ways, in the file and on the screen, seen every
 * frame. Max's case first found by its check: carried from Soon across the border into Inbox, the card swung between the
 * two lists until the screen fell (React «maximum update depth»), because at the border the pointer is in both.
 */
export default {
	name: "e2-two-columns",
	features: ["Step 2: drag between two columns"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-two-columns"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
		const list = async (name) => (await t.oracle.tasks(name)).map((task) => task.title);
		const [, , third] = await list("Inbox");
		const [, second, , fourth] = await list("Soon");

		/** Max, 2026-11-18: past the border between the columns the plate jumped out from under his mouse. */
		const plateUnder = (x) => t.cdp.eval(`(() => { const r = document.querySelector(".tc-overlay .tc-card")?.getBoundingClientRect(); return r ? ${x} >= r.left && ${x} <= r.right : null; })()`);
		let soonPlate = null;
		let soonAim = null;
		const intoSoon = await cardBy(t, third, "inbox");
		const soonFaults = await t.frames(
			() => carry(t, intoSoon, once(async () => {
				const under = await cardBy(t, fourth, "soon");
				soonAim = { x: under.x, y: under.top + 4 };
				return soonAim;
			}), { during: async () => (soonPlate = await plateUnder(soonAim.x)) }),
			{ maxStep: 80, carried: { id: intoSoon.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		const soon = await list("Soon");
		t.expect(soon.indexOf(third) === soon.indexOf(fourth) - 1, `Inbox → Soon: in the file it stands before «${fourth}»: ${JSON.stringify(soon)}`);
		t.expect(JSON.stringify(await t.oracle.cards("soon")) === JSON.stringify(soon), `Inbox → Soon: the screen shows the file's Soon: ${JSON.stringify(await t.oracle.cards("soon"))}`);
		t.expect(soonFaults.length === 0, `Inbox → Soon frames: ${JSON.stringify(soonFaults.slice(0, 4))}`);
		t.expect(soonPlate === true, `in Soon, past the border, the plate is still under the pointer: ${soonPlate}`);

		const inboxNow = await list("Inbox");
		const target = inboxNow[3];
		const intoInbox = await cardBy(t, second, "soon");
		const inboxFaults = await t.frames(
			() => carry(t, intoInbox, once(async () => {
				const under = await cardBy(t, target, "inbox");
				return { x: under.x, y: under.top + 4 };
			})),
			{ maxStep: 80, carried: { id: intoInbox.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		const inbox = await list("Inbox");
		t.expect(inbox.indexOf(second) === inbox.indexOf(target) - 1, `Soon → Inbox: in the file it stands before «${target}»: ${JSON.stringify(inbox)}`);
		/** Inbox is the upper half of its column (F27): the cards in sight are the file's Inbox from its top. */
		const inboxShown = await t.oracle.cards("inbox");
		t.expect(inboxShown.length > 0 && JSON.stringify(inboxShown) === JSON.stringify(inbox.slice(0, inboxShown.length)), `Soon → Inbox: the screen shows the file's Inbox: ${JSON.stringify(inboxShown)}`);
		t.expect(inboxFaults.length === 0, `Soon → Inbox frames: ${JSON.stringify(inboxFaults.slice(0, 4))}`);
		t.expect((await t.cdp.eval(`document.querySelectorAll(".tc-card[data-id]").length`)) > 0, "the screen still stands");
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
