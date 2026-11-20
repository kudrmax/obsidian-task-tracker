import { cardBy } from "../lib/carry.mjs";
import { closingFaults, menuButton, menuFrames, menuNow, openingFaults } from "../lib/menu.mjs";

const LONG = "Длинная задача, у которой название не помещается в колонку и уходит за правый край карточки";

/**
 * E4, the task menu over the card (F110, F112–F115, F133, F297; the design's «Меню задачи», «Полная карточка»): a tap
 * opens the copy of the card where it stood over the blurred backdrop, and the panel grows out by it, every part placed
 * before it shows (Max, 2026-11-19: the E0 menu jumped in from the side); its groups in Max's order (task actions spec, Decision 96); Escape, a tap
 * on the backdrop and a tap on an item close it, all parts fading together; a long title shows whole on the copy; on the
 * calendar a block's copy and an event's copy with its one row.
 */
export default {
	name: "e10-menu",
	features: ["E4: the task menu (F110, F112–F115, F133, F297)"],
	cases: ["opens and closes", "long title", "calendar"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const outside = async () => {
			const m = await menuNow(t);
			const x = m.copy.left > 60 ? 20 : t.platform === "phone" ? 370 : 1260;
			await tap({ x, y: m.copy.top + m.copy.height / 2 });
		};
		if (item === "opens and closes") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[2];
			const card = await cardBy(t, title, "day");
			const opening = await menuFrames(t, () => tap(card), 500);
			t.expect(openingFaults(opening, card).length === 0, `the menu opens from its card, each part placed before it shows: ${JSON.stringify(openingFaults(opening, card).slice(0, 6))}`);
			const shownAt = opening.find((f) => f.panels.some((p) => p.o > 0.005));
			const full = opening.find((f) => f.panels.length && f.panels.every((p) => p.o > 0.99));
			t.expect(shownAt && shownAt.panels.every((p) => p.o < 0.7), `it shows first faint, not whole at once: ${JSON.stringify(shownAt?.panels)}`);
			t.expect(shownAt && full && full.t - shownAt.t >= 80 && full.t - shownAt.t <= 330, `it grows in over the design's 200 ms: ${shownAt?.t} → ${full?.t}`);
			const open = await menuNow(t);
			t.expect(open.copyText.includes(title) && !open.titleCut, `the copy over the backdrop is the card: ${open.copyText}`);
			const words = open.words;
			const order = ["Done", "In progress", "Won’t do", "p1", "p2", "Tomorrow", "Pick a date", "Repeat", "Rename", "Description", "Project", "Section", "Subtask", "First step", "Open full screen", "Open in Obsidian", "Delete"];
			t.expect(JSON.stringify(words.filter((w) => order.includes(w))) === JSON.stringify(order.filter((w) => words.includes(w))) && words.includes("Done") && words.includes("Delete") && !words.includes("Today"), `its groups in Max's order (task actions spec, Decision 96), no Today for a task of today: ${JSON.stringify(words)}`);
			/** Max, 2026-11-20: Edit is one row of tiles, never two; the opens one row of two tiles under First step, a row; every tile's label whole inside it. */
			const rows = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-menu-tile-row")].map((r) => [...r.querySelectorAll(".tc-menu-tile-label")].map((l) => l.textContent))`);
			t.expect(rows.some((r) => JSON.stringify(r) === JSON.stringify(["Rename", "Description", "Project", "Section", "Subtask"]) || JSON.stringify(r) === JSON.stringify(["Rename", "Description", "Project", "Subtask"])), `Edit is one row: ${JSON.stringify(rows)}`);
			t.expect(rows.some((r) => JSON.stringify(r) === JSON.stringify(["Open full screen", "Open in Obsidian"])) && words.indexOf("First step") < words.indexOf("Open full screen"), `the opens are one row of two tiles under First step: ${JSON.stringify(rows)}`);
			const cut = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-layer .tc-menu-tile")].flatMap((tile) => { const l = tile.querySelector(".tc-menu-tile-label"); const range = document.createRange(); range.selectNodeContents(l); const a = range.getBoundingClientRect(); const b = tile.getBoundingClientRect(); return a.left - b.left < 3.5 || b.right - a.right < 3.5 ? [l.textContent] : []; })`);
			t.expect(cut.length === 0, `every tile's label has room inside its tile: ${JSON.stringify(cut)}`);
			const under = open.panels.find((p) => !p.above);
			const panelLeft = Math.max(0, Math.min(open.copy.left, (await t.cdp.eval("innerWidth")) - 12 - 300));
			t.expect(under && Math.abs(under.top - (open.copy.bottom + 12)) <= 1 && Math.abs(under.left - panelLeft) <= 1 && Math.abs(under.width - 300) <= 0.5, `the panel 12 px under the copy, on its left edge unless the window needs it left, 300 wide: ${JSON.stringify(under)} copy ${JSON.stringify(open.copy)}`);
			const window = await t.cdp.eval(`({ w: innerWidth, h: innerHeight })`);
			t.expect(open.panels.every((p) => p.top >= 9 && p.bottom <= window.h - 9 && p.left >= 0 && p.right <= window.w - 11), `every part inside the window: ${JSON.stringify(open.panels)}`);
			await t.shot("menu");

			const before = await t.file();
			const how = t.platform === "desktop" ? "Escape" : "a tap on the backdrop";
			const closing = await menuFrames(
				t,
				() => (t.platform === "desktop" ? t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }).then(() => t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })) : outside()),
				400,
			);
			t.expect(closingFaults(closing).length === 0, `${how} closes it, every part fading out together in place: ${JSON.stringify(closingFaults(closing).slice(0, 6))}`);
			const goneAt = closing.find((f) => !f.panels.length);
			const startAt = closing.find((f) => f.panels.length && f.panels[0].o < 0.99);
			t.expect(goneAt && startAt && goneAt.t - startAt.t <= 260, `in the design's 150 ms: ${startAt?.t} → ${goneAt?.t}`);
			if (t.platform === "desktop") {
				await tap(card);
				await t.sleep(400);
				await outside();
				await t.sleep(400);
				t.expect((await menuNow(t)) === null, "a click on the backdrop closes it too");
			}
			t.expect((await t.file()) === before, "closing the menu writes nothing");

			await tap(card);
			await t.sleep(400);
			const tomorrow = await menuButton(t, "Tomorrow");
			const moved = await t.frames(() => tap(tomorrow), { cast: "tomorrow", maxStep: 60, settleMs: 900 });
			t.expect((await menuNow(t)) === null, `a tap on an item closes the menu: ${JSON.stringify(tomorrow)} ${JSON.stringify(await menuNow(t))}`);
			t.expect((await t.oracle.tasks("Soon")).some((task) => task.title === title && task.dated), "Tomorrow wrote the task into Soon, due tomorrow");
			t.expect(!(await t.oracle.cards("day")).includes(title), "and it left today's list");
			t.expect(moved.length === 0, `no card jumps or flickers as it goes: ${JSON.stringify(moved.slice(0, 4))}`);
		}
		if (item === "long title") {
			await t.setStop("soon");
			const card = await cardBy(t, LONG, "day");
			await tap(card);
			await t.sleep(450);
			const open = await menuNow(t);
			const window = await t.cdp.eval(`({ w: innerWidth, h: innerHeight })`);
			t.expect(open && !open.titleCut && open.copyText.includes(LONG), `the copy shows the whole title: ${JSON.stringify(open?.titleBox)}`);
			const left = Math.max(Math.min(card.left, 10), Math.min(card.left, Math.max(card.right, window.w - 10) - (open?.copy.width ?? 0)));
			t.expect(open && Math.abs(open.copy.top - card.top) <= 1 && Math.abs(open.copy.left - left) <= 1, `its first line stands at the card's height, moved left only as far as the window needs: ${JSON.stringify(open?.copy)} card ${JSON.stringify(card)}`);
			t.expect(open && open.copy.width >= card.width - 0.5 && open.copy.right <= Math.max(card.right, window.w - 10) + 0.5, `it grows right no further than the window less 10 px: ${JSON.stringify(open?.copy)}`);
			t.expect(open && (open.copy.width > card.width + 1 || open.copy.height > card.height + 1), `and grows for the title: ${JSON.stringify(open?.copy)}`);
			await t.shot("long-title");
		}
		if (item === "calendar") {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const block = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes("Обед")); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12, left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
			const opening = await menuFrames(t, () => tap(block), 500);
			t.expect(openingFaults(opening, block).length === 0, `a block's menu opens from the block: ${JSON.stringify(openingFaults(opening, block).slice(0, 6))}`);
			const open = await menuNow(t);
			t.expect(open.copyText.includes("Обед") && Math.abs(open.copy.height - block.height) <= 1, `the block's copy over the backdrop, its height kept: ${JSON.stringify(open.copy)} vs ${block.height}`);
			t.expect(!open.words.includes("Section"), `no Section on the calendar: ${JSON.stringify(open.words)}`);
			const dots = await t.cdp.eval(`document.querySelectorAll(".tc-pinned .tc-grip").length`);
			t.expect(dots === 2, `the selected block's two dots stand over the menu: ${dots}`);
			await t.shot("block-menu");
			await outside();
			await t.sleep(400);

			const event = await t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-event] .tc-event-label")].find((b) => b.closest("[data-event]").textContent.includes("Встреча с дизайнером")); const block = el.closest("[data-event]").querySelector(".tc-event-block"); const r = el.getBoundingClientRect(); const b = block.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2, left: b.left, top: b.top, width: b.width, height: b.height }; })()`);
			await tap(event);
			await t.sleep(450);
			const menu = await menuNow(t);
			t.expect(menu && JSON.stringify(menu.words) === JSON.stringify(["Open in Calendar"]), `an event's menu is its one row: ${JSON.stringify(menu?.words)}`);
			t.expect(menu && menu.copyText.includes("Встреча с дизайнером") && Math.abs(menu.copy.left - event.left) <= 1 && Math.abs(menu.copy.width - event.width) <= 1, `the event's copy over the backdrop, its width kept (F90): ${JSON.stringify(menu?.copy)} event ${JSON.stringify(event)}`);
			await t.shot("event-menu");
			const before = await t.file();
			await tap(await menuButton(t, "Open in Calendar"));
			await t.sleep(400);
			t.expect((await menuNow(t)) === null && (await t.file()) === before, "Open in Calendar closes the menu and writes nothing on the stand");
		}
	},
};
