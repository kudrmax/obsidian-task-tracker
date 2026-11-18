/**
 * E0, one ObsidianEditor (spec, «Text fields»): the plus opens a field with the focus; typed text arrives; the field stands
 * where the port puts new tasks (the end of Inbox's tasks outside a section), the list reveals it; Enter writes the task
 * there and opens the next field under it; Escape closes the field. The test page holds a stand-in for Obsidian's editor
 * with its interface and keys; Obsidian's own editor in the field (`[[` opening the note search, its look) is checked by
 * hand in the test Obsidian.
 */
export default {
	name: "e0-editor",
	features: ["E0: ObsidianEditor, reveal by scrollToIndex"],
	async run(t) {
		await t.setStop("inbox");
		const list = await t.oracle.rect('[data-list="inbox"]');
		for (let i = 0; i < 15; i++) {
			await t.input.wheel(list.x, list.y, 0, 120);
			await t.sleep(16);
		}
		await t.sleep(300);
		const plus = await t.oracle.rect(".tc-plus");
		if (t.platform === "phone") await t.input.tap(plus.x, plus.y);
		else await t.input.click(plus.x, plus.y);
		await t.sleep(400);
		const focused = await t.cdp.eval(`!!document.activeElement?.isContentEditable && !!document.activeElement.closest(".tc-quick-field")`);
		t.expect(focused, "the plus opens a field with its editor in focus");
		await t.cdp.send("Input.insertText", { text: "Купить молоко" });
		await t.sleep(150);
		const text = await t.cdp.eval(`document.querySelector(".tc-quick-field [contenteditable]")?.textContent`);
		t.expect(text === "Купить молоко", `the typed text is in the field: «${text}»`);
		await t.shot("typed");
		const added = await t.frames(async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
		}, { cast: "enter", settleMs: 900 });
		const text2 = (await t.cdp.eval(`window.__tcStand.fileText()`)).split("\n");
		const inboxAt = text2.indexOf("## Inbox");
		const firstSection = text2.findIndex((line, i) => i > inboxAt && line.startsWith("### "));
		const loose = text2.slice(inboxAt + 1, firstSection < 0 ? undefined : firstSection).filter((line) => line.startsWith("- "));
		t.expect(loose.at(-1)?.endsWith("Купить молоко"), `Enter writes it at the end of Inbox's tasks outside a section: ${loose.at(-1)}`);
		t.expect((await t.oracle.cards("inbox")).includes("Купить молоко"), "the list shows it, the field in sight");
		t.expect((await t.cdp.eval(`!!document.querySelector(".tc-entry .tc-quick-field")`)) === true, "and an empty field opened under it");
		t.expect(added.length === 0, `frames of the new task coming in: ${JSON.stringify(added.slice(0, 4))}`);

		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await t.sleep(300);
		t.expect((await t.cdp.eval(`!!document.querySelector(".tc-quick-field")`)) === false, "Escape closes the field");
	},
};
