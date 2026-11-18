import { sleep } from "../lib/cdp.mjs";

/**
 * Long lists (the old plugin's F162; spec 2026-11-18, «Long lists», dnd-kit's auto-scroll): a card held near a list's
 * bottom edge scrolls the list under it, its own row stays mounted though the list mounts only the rows in sight, and let
 * go far down it lands there, in the file and on the screen. Carried by the mouse on the Mac, by a long press on the phone.
 */
export default {
	name: "e5-long-lists",
	features: ["Long lists: the list scrolls under a held card"],
	async run(t) {
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:step-long-lists"); await new Promise((r) => setTimeout(r, 800)); return 1; })()`);
		const phone = t.platform === "phone";
		const box = await t.cdp.eval(`(() => { const l = document.querySelector('[data-list="inbox"]').getBoundingClientRect(); const e = [...document.querySelectorAll('[data-list="inbox"] .tc-card[data-id]')][1].getBoundingClientRect(); return { top: l.top, bottom: l.bottom, x: e.left + e.width / 2, y: e.top + e.height / 2 }; })()`);
		const mouse = (type, p, buttons) => t.cdp.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons, clickCount: 1 });
		const touch = (type, p) => t.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: p ? [{ x: p.x, y: p.y, id: 0 }] : [] });
		const move = (p) => (phone ? touch("touchMove", p) : mouse("mouseMoved", p, 1));
		const from = { x: box.x, y: box.y };
		if (phone) {
			await touch("touchStart", from);
			await sleep(400);
		} else await mouse("mousePressed", from, 1);
		const edge = { x: from.x, y: box.bottom - 12 };
		for (let i = 1; i <= 30; i++) {
			await move({ x: from.x, y: from.y + ((edge.y - from.y) * i) / 30 });
			await sleep(16);
		}
		for (let i = 0; i < 40; i++) {
			await move({ x: edge.x + (i % 2), y: edge.y });
			await sleep(50);
		}
		const scrolled = await t.cdp.eval(`document.querySelector('[data-list="inbox"]').scrollTop`);
		const middle = { x: from.x, y: (box.top + box.bottom) / 2 };
		for (let i = 1; i <= 10; i++) {
			await move({ x: middle.x, y: edge.y + ((middle.y - edge.y) * i) / 10 });
			await sleep(30);
		}
		await sleep(400);
		const held = await t.cdp.eval(`(() => ({ overlay: !!document.querySelector(".tc-overlay .tc-card"), place: !!document.querySelector('[data-list="inbox"] .tc-drag-source.is-lifted') }))()`);
		if (phone) await touch("touchEnd", null);
		else await mouse("mouseReleased", middle, 0);
		await sleep(700);
		const inbox = (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const at = inbox.indexOf("Задача 2");
		t.expect(scrolled > 1000, `the list scrolled under the held card: ${scrolled}px`);
		t.expect(held.overlay && held.place, `far down, the card is still carried and its place shows: ${JSON.stringify(held)}`);
		t.expect(at > 40, `let go far down, it lands there in the file: at ${at}`);
		t.expect(JSON.stringify(await t.oracle.cards("inbox")).includes("Задача 2"), "and on the screen");
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
