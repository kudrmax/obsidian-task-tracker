import { sleep } from "../lib/cdp.mjs";

/** Each task of a list in the file as «title:level». */
const levels = (text, list) => {
	const out = [];
	let on = false;
	for (const line of text.split("\n")) {
		if (line.startsWith("## ")) on = line === `## ${list}`;
		else if (on) {
			const m = /^(\t*)- \[.\] (.*)$/.exec(line);
			if (m) out.push(`${m[2]}:${m[1].length}`);
		}
	}
	return out;
};

/**
 * The plus (the old plugin's F174, F178–F181): a tap opens the new task's field in its list, at the end of Inbox; Enter
 * writes the task and opens an empty field right under it; Tab makes the field a subtask of the task above; Enter on an
 * empty subtask's field steps it out, on an empty field closes it; a tap elsewhere writes what was typed; Escape closes
 * without writing. The words typed are Obsidian's editor's (Input.insertText), the keys real key events.
 */
export default {
	name: "e6-plus",
	features: ["The plus and the new task's field"],
	async run(t) {
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:step-two-columns"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const file = async () => levels(await t.cdp.eval(`window.__tcStand.fileText()`), "Inbox");
		const plus = await t.cdp.eval(`(() => { const r = document.querySelector(".task-calendar button.tc-plus").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
		const tap = async (p) => {
			if (t.platform === "phone") {
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
				await t.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
			} else {
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
				await t.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
			}
		};
		const key = async (key, code, vk, modifiers = 0) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
		};
		const field = () => t.cdp.eval(`!!document.querySelector(".tc-entry")`);

		await tap(plus);
		await sleep(500);
		t.expect(await t.cdp.eval(`!!document.activeElement?.closest(".tc-entry")`), "a tap on the plus opens the field, typing into it at once");
		await t.cdp.send("Input.insertText", { text: "Новая задача" });
		await key("Enter", "Enter", 13);
		await sleep(400);
		await t.cdp.send("Input.insertText", { text: "Вторая" });
		await key("Tab", "Tab", 9);
		await sleep(150);
		await key("Enter", "Enter", 13);
		await sleep(400);
		let inbox = await file();
		t.expect(JSON.stringify(inbox.slice(-2)) === JSON.stringify(["Новая задача:0", "Вторая:1"]), `Enter writes and opens the next field; Tab: a subtask: ${JSON.stringify(inbox.slice(-3))}`);
		await key("Enter", "Enter", 13);
		await sleep(300);
		t.expect(await field(), "Enter on an empty subtask's field steps it out, the field stays");
		await key("Enter", "Enter", 13);
		await sleep(300);
		t.expect(!(await field()), "Enter on an empty field closes it");

		await tap(plus);
		await sleep(400);
		await t.cdp.send("Input.insertText", { text: "Третья" });
		await tap({ x: plus.x - 300, y: plus.y - 400 });
		await sleep(500);
		inbox = await file();
		t.expect(inbox.at(-1) === "Третья:0" && !(await field()), `a tap elsewhere writes what was typed and closes: ${JSON.stringify(inbox.slice(-2))}`);

		await tap(plus);
		await sleep(400);
		await t.cdp.send("Input.insertText", { text: "Не сохранять" });
		await key("Escape", "Escape", 27);
		await sleep(400);
		inbox = await file();
		t.expect(!inbox.some((x) => x.startsWith("Не сохранять")) && !(await field()), `Escape closes without writing: ${JSON.stringify(inbox.slice(-2))}`);
		await t.cdp.eval(`(async () => { app.commands.executeCommandById("task-calendar-stand:whole-screen"); await new Promise((r) => setTimeout(r, 600)); return 1; })()`);
	},
};
