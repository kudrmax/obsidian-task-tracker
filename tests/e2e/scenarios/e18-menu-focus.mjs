import { cardBy } from "../lib/carry.mjs";
import { menuButton, menuNow } from "../lib/menu.mjs";

/**
 * E4, where the focus goes and what a tap that ends typing does (the audit's findings 10, 11, 17): Cancel on a question
 * gives the focus back to what asked it; a rename ended by Enter (with no next field) or Escape gives it back to the card
 * (Decision 58); a subtask's menu opened in the same sheet takes it; on the phone a tap on a card while a task is typed
 * writes the task and opens no menu; the calendar scrolled to its end shows its last task clear of the plus.
 */
export default {
	name: "e18-menu-focus",
	features: ["E4: focus in the menu and the field; a tap that ends typing"],
	cases: ["focus", "tap ends typing", "plus clear of the calendar"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const key = async (k, code, vk) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
			await t.sleep(350);
		};
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null, `the menu shows «${words}»`)) return;
			await tap(at);
			await t.sleep(350);
		};
		const focused = () => t.cdp.eval(`(() => { const a = document.activeElement; return { text: a?.textContent?.trim().slice(0, 40) ?? "", menu: !!a?.closest(".tc-menu-layer"), card: a?.querySelector?.("[data-id], [data-block]")?.textContent?.slice(0, 30) ?? null, body: a === document.body }; })()`);
		const block = (title) => t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes(${JSON.stringify(title)})); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; })()`);

		if (item === "focus") {
			await t.setStop("soon");
			const title = (await t.oracle.cards("day"))[1];
			await tap(await cardBy(t, title, "day"));
			await t.sleep(400);
			await press("Won’t do");
			await press("Cancel");
			const back = await focused();
			t.expect(back.menu && back.text === "Won’t do", `Cancel gives the focus back to Won't do (the audit's 11): ${JSON.stringify(back)}`);
			await press("Delete");
			await press("Cancel");
			const del = await focused();
			t.expect(del.menu && del.text === "Delete", `and to Delete: ${JSON.stringify(del)}`);
			await press("Rename");
			await key("Escape", "Escape", 27);
			const card = await focused();
			t.expect(card.card === title, `Escape on a rename gives the focus back to the card: ${JSON.stringify(card)}`);
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			await tap(await block("Обед"));
			await t.sleep(450);
			await press("Rename");
			await t.cdp.send("Input.insertText", { text: "!" });
			await key("Enter", "Enter", 13);
			const blockFocus = await focused();
			t.expect(blockFocus.card?.startsWith("Обед!"), `Enter on a block's rename gives the focus back to the block: ${JSON.stringify(blockFocus)}`);
			await tap(await block("Упаковать книги"));
			await t.sleep(450);
			const card2 = await t.cdp.eval(`(() => { const c = [...document.querySelectorAll(".tc-menu-subtasks > [data-stack]")].find((e) => e.textContent.includes("Заказать машину")); const r = c.getBoundingClientRect(); return { x: r.left + 30, y: r.top + 15 }; })()`);
			await tap(card2);
			await t.sleep(450);
			const sub = await focused();
			t.expect(sub.menu && !sub.body, `a subtask's menu in the same sheet takes the focus: ${JSON.stringify(sub)}`);
		}
		if (item === "tap ends typing") {
			await t.setStop("soon");
			const other = (await t.oracle.cards("soon"))[0];
			await tap(await t.oracle.rect(".task-calendar > button.tc-plus"));
			await t.sleep(400);
			await t.cdp.send("Input.insertText", { text: "Тап мимо" });
			await tap(await cardBy(t, other, "soon"));
			await t.sleep(500);
			t.expect((await t.file()).includes("Тап мимо"), "a tap elsewhere writes what was typed");
			const menu = await menuNow(t);
			if (t.platform === "phone") t.expect(menu === null, `and on the phone the tapped card opens no menu (the audit's 17): ${JSON.stringify(menu?.words)}`);
		}
		if (item === "plus clear of the calendar") {
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-menu"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
			const hits = await t.cdp.eval(`(async () => { const tl = document.querySelector(".tc-timeline"); tl.scrollTop = tl.scrollHeight; await new Promise((r) => setTimeout(r, 300)); const p = document.querySelector(".task-calendar > button.tc-plus").getBoundingClientRect(); return [...document.querySelectorAll("[data-block]")].map((b) => b.getBoundingClientRect()).filter((r) => r.right > p.left && r.left < p.right && r.bottom > p.top && r.top < p.bottom).length; })()`);
			t.expect(hits === 0, `scrolled to its end, the calendar's last tasks stand clear of the plus (the audit's 10): ${hits} under it`);
		}
	},
};
