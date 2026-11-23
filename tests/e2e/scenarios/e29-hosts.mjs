/**
 * Opening and hosts (F3, F9): two screens over the same tasks show a change made in one at once in the other; on the phone a
 * swipe from the screen's edge stays the screen's (Obsidian's drawers, listening on the document, never hear it) and the
 * page neither scrolls nor zooms under it.
 */
export default {
	name: "e29-hosts",
	features: ["F3", "F9"],
	async run(t) {
		await t.cdp.eval(`(async () => { window.__tcStand.step("whole-screen"); await new Promise((r) => setTimeout(r, 500)); return 1; })()`);
		await t.cdp.eval(`(() => { window.__tcHeard = 0; for (const type of ["touchstart", "touchmove", "touchend"]) document.addEventListener(type, () => window.__tcHeard++); return 1; })()`);
		if (t.platform === "phone") {
			const view = await t.oracle.rect(".task-calendar");
			const y = view.top + view.height * 0.5;
			await t.input.swipe({ x: view.left + 2, y }, { x: view.left + view.width * 0.6, y }, { steps: 10, stepMs: 16 });
			await t.input.swipe({ x: view.right - 2, y }, { x: view.left + view.width * 0.4, y }, { steps: 10, stepMs: 16 });
			await t.sleep(600);
			t.expect((await t.cdp.eval("window.__tcHeard")) === 0, `a swipe from the edges stays the screen's: the document heard ${await t.cdp.eval("window.__tcHeard")} touches (F9)`);
			t.expect((await t.cdp.eval("window.scrollX + window.scrollY")) === 0 && (await t.cdp.eval("window.visualViewport.scale")) === 1, "the page neither scrolls nor zooms under the swipe (F9)");
		}
		await t.cdp.eval(`(() => { window.__tcStand.openNoteBeside(); return 1; })()`);
		await t.sleep(400);
		await t.stand(`addFromOutside("inbox", "Из другой вкладки")`);
		const both = await t.waitFor(() => t.cdp.eval(`[...document.querySelectorAll(".task-calendar")].every((screen) => [...screen.querySelectorAll(".tc-card")].some((card) => card.textContent.includes("Из другой вкладки")))`), 3000);
		t.expect(both, "a task written once shows at once on both screens (F3)");
	},
};
