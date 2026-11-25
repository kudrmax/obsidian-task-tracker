import { carry, cardBy } from "../lib/carry.mjs";

const once = (find) => {
	let aim = null;
	return async () => (aim ??= await find());
};

/** A list's room as drawn: its box and how far it is scrolled. */
const roomOf = (t, list) => t.cdp.eval(`(() => { const el = document.querySelector('[data-list="${list}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height, scroll: el.scrollTop, more: el.scrollHeight - el.clientHeight }; })()`);

/**
 * Backlog under Inbox (F27; the design's «Inbox над Backlog»; `docs/plugin/screen.md` «Лента колонок»): at Inbox the
 * first column is Inbox over Backlog, half and half, Backlog under a line with its own title, each list scrolling by
 * itself; a card goes between them as between any two lists, written to the file's Backlog where the cards parted.
 */
export default {
	name: "e27-backlog",
	features: ["F27: Inbox over Backlog, each half its own list"],
	async run(t) {
		await t.setStop("inbox");
		const title = await t.cdp.eval(`document.querySelector(".tc-backlog .tc-head-title")?.textContent ?? null`);
		t.expect(title === "Backlog", `Backlog's half has its own title: ${title}`);
		const backlog = (await t.oracle.tasks("Backlog")).map((task) => task.title);
		const shown = await t.oracle.cards("backlog");
		t.expect(shown.length > 0 && JSON.stringify(shown) === JSON.stringify(backlog.slice(0, shown.length)), `Backlog's half shows the file's Backlog from its top: ${JSON.stringify(shown.slice(0, 4))}`);

		const inbox = await roomOf(t, "inbox");
		const lower = await roomOf(t, "backlog");
		const line = await t.oracle.rect(".tc-backlog");
		t.expect(inbox.bottom <= line.top + 1, `Inbox's list ends over Backlog's line: ${inbox.bottom} / ${line.top}`);
		t.expect(lower.height > inbox.height, `Backlog's half is the taller, by the foot lying over it: ${lower.height} / ${inbox.height}`);

		await t.cdp.eval(`(() => { document.querySelector('[data-list="backlog"]').scrollTop = 400; return 1; })()`);
		await t.sleep(300);
		t.expect((await roomOf(t, "backlog")).scroll > 0 && (await roomOf(t, "inbox")).scroll === 0, "each half scrolls by itself");
		await t.cdp.eval(`(() => { document.querySelector('[data-list="backlog"]').scrollTop = 0; return 1; })()`);
		await t.sleep(300);

		const inboxTitles = (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const moving = inboxTitles[0];
		const before = backlog[1];
		const from = await cardBy(t, moving, "inbox");
		const faults = await t.frames(
			() => carry(t, from, once(async () => {
				const under = await cardBy(t, before, "backlog");
				return { x: under.x, y: under.top + 4 };
			})),
			{ maxStep: 80, carried: { id: from.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		const after = (await t.oracle.tasks("Backlog")).map((task) => task.title);
		t.expect(after.indexOf(moving) === after.indexOf(before) - 1, `Inbox → Backlog: in the file before «${before}»: ${JSON.stringify(after.slice(0, 4))}`);
		t.expect(!(await t.oracle.tasks("Inbox")).some((task) => task.title === moving), "and gone from Inbox");
		t.expect(JSON.stringify(await t.oracle.cards("backlog")) === JSON.stringify(after.slice(0, (await t.oracle.cards("backlog")).length)), `the screen shows the file's Backlog: ${JSON.stringify((await t.oracle.cards("backlog")).slice(0, 4))}`);
		t.expect(faults.length === 0, `frames: ${JSON.stringify(faults.slice(0, 4))}`);
		await t.shot("backlog");
	},
};
