/**
 * E0, one ObsidianEditor (spec, «Text fields»): the plus opens a field holding Obsidian's own editor with the focus; typed
 * text arrives; on the Mac `[[` opens Obsidian's note search; Enter adds the task where the port puts new ones (the top of
 * Inbox), the list reveals it and it comes in; Escape closes the field.
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
		const focused = await t.cdp.eval(`document.activeElement?.classList.contains("cm-content") && !!document.activeElement.closest(".tc-quick-field")`);
		t.expect(focused, "the plus opens a field with Obsidian's editor in focus");
		await t.cdp.send("Input.insertText", { text: "Купить молоко" });
		await t.sleep(150);
		if (t.platform === "desktop") {
			await t.cdp.send("Input.insertText", { text: " [[" });
			await t.sleep(500);
			const suggest = await t.cdp.eval(`!!document.querySelector(".suggestion-container")`);
			t.expect(suggest, "`[[` opens Obsidian's note search");
			await t.shot("note-search");
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
			await t.sleep(200);
			for (let i = 0; i < 3; i++) {
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
				await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
			}
		}
		const text = await t.cdp.eval(`document.querySelector(".tc-quick-field .cm-content")?.textContent`);
		t.expect(text === "Купить молоко", `the typed text is in the field: «${text}»`);
		await t.shot("typed");
		const added = await t.frames(async () => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
		}, { cast: "enter", settleMs: 900 });
		t.expect((await t.oracle.tasks("Inbox"))[0]?.title === "Купить молоко", `Enter adds it at the top of Inbox in the file: ${(await t.oracle.tasks("Inbox"))[0]?.title}`);
		t.expect((await t.oracle.cards("inbox"))[0] === "Купить молоко", `the list scrolled back to show it: ${(await t.oracle.cards("inbox"))[0]}`);
		t.expect((await t.cdp.eval(`!!document.querySelector(".tc-quick-field")`)) === false, "and the field closed");
		t.expect(added.length === 0, `frames of the new task coming in: ${JSON.stringify(added.slice(0, 4))}`);

		const again = await t.oracle.rect(".tc-plus");
		if (t.platform === "phone") await t.input.tap(again.x, again.y);
		else await t.input.click(again.x, again.y);
		await t.sleep(300);
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
		await t.sleep(300);
		t.expect((await t.cdp.eval(`!!document.querySelector(".tc-quick-field")`)) === false, "Escape closes the field");
	},
};
