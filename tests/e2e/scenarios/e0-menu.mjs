import { cardBy } from "../lib/carry.mjs";

/**
 * E0, one layer (spec, «Layers and focus»): a tap on a card opens its menu over it, with what the port offers; an item runs
 * and closes it, and the card glides to its new list (a move by command, the same rows that move); Escape (the Mac) and a
 * tap outside close it and write nothing.
 */
export default {
	name: "e0-menu",
	features: ["E0: layers, MovingRow by command"],
	async run(t) {
		await t.setStop("inbox");
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const menu = () => t.cdp.eval(`(() => { const m = document.querySelector('[role="menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { top: r.top, left: r.left, bottom: r.bottom, items: [...m.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent) }; })()`);
		const title = (await t.oracle.cards("inbox"))[1];
		const card = await cardBy(t, title, "inbox");
		await tap(card);
		await t.sleep(300);
		const open = await menu();
		t.expect(open !== null && JSON.stringify(open.items) === JSON.stringify(["Soon", "Today"]), `a tap opens the card's menu with the port's items: ${JSON.stringify(open)}`);
		t.expect(open !== null && open.top >= card.bottom - 1 && Math.abs(open.left - card.left) < 2, `the menu stands under the card it opened from: ${JSON.stringify(open)} card ${JSON.stringify(card)}`);
		await t.shot("menu");

		const before = await t.file();
		if (t.platform === "desktop") {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(250);
			t.expect((await menu()) === null, "Escape closes it");
			await tap(card);
			await t.sleep(300);
		}
		/** Outside: the empty head of the other column, where nothing else answers a tap. */
		const head = await t.oracle.rect(".tc-stage-col.is-soon .tc-stage-head");
		await tap({ x: head.right - 20, y: head.y });
		await t.sleep(300);
		t.expect((await menu()) === null, "a tap outside closes it");
		t.expect((await t.file()) === before, "closing the menu writes nothing");

		await tap(card);
		await t.sleep(300);
		const item = await t.cdp.eval(`(() => { const b = [...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === "Soon"); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const moved = await t.frames(() => tap(item), { cast: "to-soon", maxStep: 60, settleMs: 900 });
		t.expect((await menu()) === null, "an item closes the menu");
		const soon = await t.oracle.tasks("Soon");
		t.expect(soon.filter((task) => !task.dated)[0]?.title === title, `the item ran: the task is first in Soon in the file: ${soon[0]?.title}`);
		t.expect((await t.oracle.cards("soon"))[0] === title && !(await t.oracle.cards("inbox")).includes(title), "and on the screen: first in Soon, gone from Inbox");
		t.expect(moved.length === 0, `frames of the move by command: ${JSON.stringify(moved.slice(0, 4))}`);
	},
};
