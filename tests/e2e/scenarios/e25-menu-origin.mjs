import { calendarTools } from "../lib/calendar.mjs";
import { menuNow } from "../lib/menu.mjs";

/**
 * The review of part 1, findings 1 and 2: a menu stands over the very thing pressed, and its copy shows that thing as it
 * looks there. A card held and let go on the main screen while a note's block shows the same tasks ahead of it in the page
 * opens over the main screen's card, not the note's. A calendar's task held and let go (F106) after another was tapped
 * shows its own corner and time on its copy, not the other's. And finding 11: a selected task standing still keeps its dots
 * where they are without asking the page for a frame every frame.
 */
export default {
	name: "e25-menu-origin",
	features: ["Part 1 review: the menu opens over the card pressed, beside a note's block too; a held block's copy has its own look; a still task's dots ask for no frames (findings 1, 2, 11)"],
	cases: ["beside a note", "held block", "still dots"],
	async run(t, item) {
		const cal = calendarTools(t);
		const hold = async (p) => {
			if (t.platform === "phone") {
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
				await t.sleep(500);
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			} else {
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, button: "none", buttons: 0 });
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
				await t.sleep(500);
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
			}
			await t.sleep(450);
		};
		const close = async () => {
			if (t.platform === "phone") await cal.tap({ x: 8, y: 8 });
			else await cal.key("Escape", "Escape", 27);
			await t.sleep(450);
		};

		if (item === "beside a note") {
			if (t.platform === "phone") return;
			await t.setStop("inbox");
			await t.cdp.eval(`(async () => { window.__tcStand.openNoteBeside(); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
			const card = await t.cdp.eval(`(() => { const el = document.querySelector('.workspace-leaf-content [data-list="inbox"] .tc-card[data-id]'); const twin = document.querySelectorAll('[data-id="' + el.dataset.id + '"]').length; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, twin }; })()`);
			t.expect(card.twin === 2, `the card's task shows on both screens, the note's first in the page: ${card.twin}`);
			await hold(card);
			const menu = await menuNow(t);
			t.expect(menu && Math.abs(menu.copy.left - card.left) < 2 && Math.abs(menu.copy.top - card.top) < 2, `a card held on the main screen opens its menu over that card: copy ${JSON.stringify(menu?.copy)}, card ${JSON.stringify(card)}`);
			return;
		}

		await t.setClock("12:00");
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const looks = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline .tc-block-card[data-block]")].map((el) => { const r = el.getBoundingClientRect(); const room = document.querySelector(".tc-timeline").getBoundingClientRect(); return { title: el.querySelector(".tc-card-title")?.textContent, time: el.querySelector(".tc-slot-time")?.textContent, inSight: r.top >= room.top && r.bottom <= room.bottom && r.height >= 20, x: r.left + Math.min(r.width / 2, 40), y: r.top + 10 }; }).filter((b) => b.inSight)`);
		if (item === "still dots") {
			const block = looks[0];
			await cal.tap(block);
			await t.sleep(450);
			await close();
			t.expect(await t.cdp.eval(`document.querySelectorAll(".tc-pinned .tc-grip").length > 0`), "the task tapped is selected, its dots on it");
			await t.sleep(600);
			const frames = await t.cdp.eval(`(async () => { const own = window.requestAnimationFrame; let asked = 0; window.requestAnimationFrame = (f) => { asked++; return own.call(window, f); }; await new Promise((r) => setTimeout(r, 500)); window.requestAnimationFrame = own; return asked; })()`);
			t.expect(frames < 5, `a still task's dots ask for no frame every frame: ${frames} asked in half a second`);
			return;
		}
		const [first, second] = looks.filter((b, i) => looks.findIndex((o) => o.time === b.time) === i);
		t.expect(!!first && !!second, `two blocks in sight at different times: ${JSON.stringify(looks)}`);
		if (!first || !second) return;
		await cal.tap(first);
		await t.sleep(450);
		await close();
		await hold(second);
		const copy = await t.cdp.eval(`document.querySelector(".tc-menu-over > .tc-lifted .tc-slot-time")?.textContent ?? null`);
		t.expect(copy === second.time, `a block held after another was tapped has its own time on its copy: ${copy}, its own ${second.time}, the other's ${first.time}`);
		await close();
	},
};
