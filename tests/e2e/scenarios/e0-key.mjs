/**
 * E0, one key (spec, «Keys»): the table's keys, registered once by the host on the view's scope, do what the same gesture
 * does: the arrows turn the ribbon one stop, as a stroke does; inside an open field they are the field's.
 */
export default {
	name: "e0-key",
	features: ["E0: keys"],
	platforms: ["desktop"],
	async run(t) {
		const columns = async () => (await t.oracle.columns()).filter((title) => title !== "");
		const press = async (key, code) => {
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: code === "ArrowLeft" ? 37 : 39 });
			await t.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: code === "ArrowLeft" ? 37 : 39 });
			await t.sleep(500);
		};
		await press("ArrowLeft", "ArrowLeft");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `← turns one stop back, as a stroke: ${JSON.stringify(await columns())}`);
		await press("ArrowLeft", "ArrowLeft");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Inbox", "Soon"]), `← again: ${JSON.stringify(await columns())}`);
		await press("ArrowRight", "ArrowRight");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `→ one on: ${JSON.stringify(await columns())}`);

		const plus = await t.oracle.rect(".tc-plus");
		await t.input.click(plus.x, plus.y);
		await t.sleep(300);
		await t.cdp.send("Input.insertText", { text: "абв" });
		await press("ArrowLeft", "ArrowLeft");
		t.expect(JSON.stringify(await columns()) === JSON.stringify(["Soon", "Today"]), `inside the field ← moves the caret, not the ribbon: ${JSON.stringify(await columns())}`);
	},
};
