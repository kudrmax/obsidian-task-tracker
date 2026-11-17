/**
 * The divider between the day's list and the timeline (docs/plugin/screen.md, «Лента колонок»): dragged by its handle it
 * sets the list's width, which follows the finger every frame within the list's bounds; let go, the width is kept on the
 * device and the view opens with it.
 */
export default {
	name: "divider",
	features: ["F51", "F53"],
	async run(t) {
		const handle = await t.oracle.rect(".tc-divider-handle");
		t.expect(handle !== null, "at Now–calendar the divider shows its handle");
		if (!handle) return;
		const before = await t.oracle.rect(".tc-stage-col.is-day");
		await t.cdp.eval(`(() => { const out = []; let run = true; let pointer = null; const on = (e) => { pointer = e.clientX; }; document.addEventListener("pointermove", on, true); const tick = () => { if (!run) return; const day = document.querySelector(".tc-stage-col.is-day"); out.push({ right: day.getBoundingClientRect().right, pointer }); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__divider = () => { run = false; document.removeEventListener("pointermove", on, true); return out; }; return 1; })()`);
		const by = t.platform === "phone" ? -50 : -180;
		if (t.platform === "phone") await t.input.swipe({ x: handle.x, y: handle.y }, { x: handle.x + by, y: handle.y + 3 }, { steps: 25, stepMs: 20, restMs: 100 });
		else await t.input.drag({ x: handle.x, y: handle.y }, { x: handle.x + by, y: handle.y + 3 }, { steps: 25, stepMs: 20 });
		await t.sleep(400);
		const frames = await t.cdp.eval(`window.__divider()`);
		const moving = frames.filter((f) => f.pointer !== null);
		const start = moving[0];
		const drift = moving.map((f) => Math.abs(f.right - start.right - (f.pointer - start.pointer)));
		t.expect(moving.length > 10 && Math.max(...drift) <= 2, `the list's edge follows the finger every frame: worst ${Math.max(...drift).toFixed(1)} px over ${moving.length} frames`);
		const after = await t.oracle.rect(".tc-stage-col.is-day");
		t.expect(Math.abs(after.width - (before.width + by)) <= 3, `the list is ${by} px wider: ${before.width} → ${after.width}`);
		await t.open();
		const reopened = await t.oracle.rect(".tc-stage-col.is-day");
		t.expect(Math.abs(reopened.width - after.width) <= 1, `the width is kept: reopened at ${reopened.width}, let go at ${after.width}`);
		await t.cdp.eval(`app.plugins.plugins["task-calendar"].viewSettings.set({ listShare: 0.5 }).then(() => 1)`);
	},
};
