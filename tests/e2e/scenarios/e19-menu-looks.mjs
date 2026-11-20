import { cardBy } from "../lib/carry.mjs";
import { menuButton } from "../lib/menu.mjs";

/**
 * E4, what the menu and the bar show, as the plugin's (the audit's findings 12–14, 18, 21): a selected block's dots go
 * while it is the rename field and the bottom one lies under its menu's stack; a folded block's status tiles are for its
 * shown step, which their question names, while Delete names the task; a tile's label fits its tile where the room holds it.
 */
export default {
	name: "e19-menu-looks",
	features: ["E4: the menu's dots, a folded block's status tiles, tile labels"],
	cases: ["dots", "folded block", "labels"],
	async run(t, item) {
		const tap = (p) => (t.platform === "phone" ? t.input.tap(p.x, p.y) : t.input.click(p.x, p.y));
		const press = async (words) => {
			const at = await menuButton(t, words);
			if (!t.expect(at !== null, `the menu shows «${words}»`)) return;
			await tap(at);
			await t.sleep(350);
		};
		const esc = async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(400);
		};
		/** High on the calendar, so the menu's block stands right over it and its dots stay (Decision 120: a lifted block's dots go). */
		const block = (title) => t.cdp.eval(`(() => { const el = [...document.querySelectorAll("[data-block]")].find((b) => b.textContent.includes(${JSON.stringify(title)})); el.scrollIntoView({ block: "start" }); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 12 }; })()`);
		const grips = () => t.cdp.eval(`[...document.querySelectorAll(".tc-grip")].map((g) => g.dataset.grip)`);
		const cutLabels = () => t.cdp.eval(`[...document.querySelectorAll(".tc-menu-tile-label")].filter((l) => l.scrollWidth > l.clientWidth + 1).map((l) => l.textContent)`);
		const calendar = async () => {
			await t.setClock("12:00");
			await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		};

		if (item === "dots") {
			await calendar();
			await tap(await block("Обед"));
			await t.sleep(450);
			t.expect(JSON.stringify(await grips()) === JSON.stringify(["start", "end"]), "a tapped block is selected, its two dots on it");
			await press("Rename");
			t.expect((await grips()).length === 0, `its dots go while it is the rename field, as the plugin's (the audit's 12): ${JSON.stringify(await grips())}`);
			await esc();
			await tap(await block("Упаковать книги"));
			await t.sleep(450);
			/** A menu with a stack is tall: where its block lifts from the task its dots go (Decision 120); where it stands over it, the bottom dot lies under the stack. */
			const lifted = await t.cdp.eval(`Math.abs(parseFloat(document.querySelector(".tc-level.tc-menu-layer")?.style.getPropertyValue("--tc-menu-lift") || "0")) > 0.5`);
			t.expect(JSON.stringify(await grips()) === JSON.stringify(lifted ? [] : ["start"]), `under a menu showing its subtasks no dot covers a card's title (the audit's 13): ${JSON.stringify(await grips())}, lifted ${lifted}`);
		}
		if (item === "folded block") {
			await calendar();
			await tap(await block("Упаковать книги"));
			await t.sleep(450);
			await press("Won’t do");
			const asked = await t.cdp.eval(`document.querySelector(".tc-menu-ask-question")?.textContent ?? ""`);
			t.expect(asked.includes("Упаковать книги"), `a folded block's Won't do names its shown step, which it is for (the audit's 14): ${asked}`);
			await press("Cancel");
			await press("Delete");
			const del = await t.cdp.eval(`document.querySelector(".tc-menu-ask-question")?.textContent ?? ""`);
			t.expect(del.includes("Переезд"), `Delete is for the whole task and names it, as the plugin's: ${del}`);
			await press("Cancel");
			await press("Done");
			await t.sleep(500);
			const lines = (await t.file()).split("\n");
			const parent = lines.find((l) => l.includes("Переезд")) ?? "";
			const step = lines.find((l) => l.includes("Упаковать книги")) ?? "";
			t.expect(parent.includes("- [ ]") && step.includes("- [x]"), `Done on it closes the step, not the task (docs/plugin/screen.md): ${parent} | ${step}`);
		}
		if (item === "labels") {
			await t.setStop("soon");
			await tap(await t.oracle.rect(".task-calendar > button.tc-plus"));
			await t.sleep(400);
			const place = await t.cdp.eval(`(() => { const e = document.querySelector(".tc-bar-place"); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
			await tap(place);
			await t.sleep(400);
			t.expect((await cutLabels()).length === 0, `the five places' labels fit their tiles, Backlog too (the audit's 21): ${JSON.stringify(await cutLabels())}`);
			await esc();
			await esc();
			const title = (await t.oracle.cards("day"))[3];
			await tap(await cardBy(t, title, "day"));
			await t.sleep(400);
			const words = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-tile-label")].map((l) => l.textContent)`);
			t.expect(words.length > 0, `the card's menu is open: ${JSON.stringify(words)}`);
			await press(words.includes("In progress") ? "In progress" : "Stop progress");
			await t.sleep(400);
			await tap(await cardBy(t, title, "day"));
			await t.sleep(400);
			for (const state of [0, 1]) {
				t.expect((await cutLabels()).length === 0, `the status tiles' labels fit, «Stop progress» too (${state}): ${JSON.stringify(await cutLabels())}`);
				if (state === 0) {
					const now = await t.cdp.eval(`[...document.querySelectorAll(".tc-menu-tile-label")].map((l) => l.textContent)`);
					await press(now.includes("In progress") ? "In progress" : "Stop progress");
					await t.sleep(400);
					await tap(await cardBy(t, title, "day"));
					await t.sleep(400);
				}
			}
		}
	},
};
