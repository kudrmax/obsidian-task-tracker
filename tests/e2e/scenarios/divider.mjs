/**
 * The divider between the day's list and the timeline (docs/plugin/screen.md, «Лента колонок»): dragged by its handle it
 * sets the list's width, which follows the finger every frame within the list's bounds; let go, the width is kept on the
 * device and the view opens with it.
 */
export default {
	name: "divider",
	features: ["F51", "F53"],
	async run(t) {
		/** Away from the window's middle, where a slow divider holds (`dividerAt`): this check is of following, not of the hold. */
		await t.cdp.eval(`${t.target.deviceSettings}.set({ listShare: 0.62 }).then(() => 1)`);
		await t.open();
		const handle = await t.oracle.rect(".tc-divider-handle");
		t.expect(handle !== null, "at Now–calendar the divider shows its handle");
		if (!handle) return;
		const before = await t.oracle.rect(".tc-stage-col.is-day");
		await t.cdp.eval(`(() => { const out = []; let run = true; const seen = []; const on = (e) => { seen.push(e.clientX); }; document.addEventListener("pointermove", on, true); const sample = () => { const day = document.querySelector(".tc-stage-col.is-day"); out.push({ right: day.getBoundingClientRect().right, pointers: seen.splice(0) }); }; const tick = () => { if (!run) return; setTimeout(sample, 0); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__divider = () => { run = false; document.removeEventListener("pointermove", on, true); return out; }; return 1; })()`);
		const by = t.platform === "phone" ? 40 : -180;
		if (t.platform === "phone") await t.input.swipe({ x: handle.x, y: handle.y }, { x: handle.x + by, y: handle.y + 3 }, { steps: 25, stepMs: 20, restMs: 100 });
		else await t.input.drag({ x: handle.x, y: handle.y }, { x: handle.x + by, y: handle.y + 3 }, { steps: 25, stepMs: 20 });
		await t.sleep(400);
		const frames = await t.cdp.eval(`window.__divider()`);
		/** Each frame, read once it is drawn, is held to the pointer positions of the last two frames: a frame draws what the pointer did before it began. */
		const first = frames.findIndex((f) => f.pointers.length > 0);
		const origin = { right: frames[first].right, x: frames[first].pointers[0] };
		const drift = [];
		for (let i = first + 2; i < frames.length; i++) {
			const recent = [...frames[i - 2].pointers, ...frames[i - 1].pointers, ...frames[i].pointers];
			if (recent.length === 0) continue;
			drift.push(Math.min(...recent.map((x) => Math.abs(frames[i].right - origin.right - (x - origin.x)))));
		}
		await (await import("node:fs/promises")).writeFile(`${t.out}/divider-frames.json`, JSON.stringify(frames));
		t.expect(drift.length > 10 && Math.max(...drift) <= 2, `the list's edge follows the finger within two frames: worst ${Math.max(...drift).toFixed(1)} px over ${drift.length} frames`);
		const after = await t.oracle.rect(".tc-stage-col.is-day");
		t.expect(Math.abs(after.width - (before.width + by)) <= 3, `the list is ${by} px wider: ${before.width} → ${after.width}`);
		await t.open();
		const reopened = await t.oracle.rect(".tc-stage-col.is-day");
		t.expect(Math.abs(reopened.width - after.width) <= 1, `the width is kept: reopened at ${reopened.width}, let go at ${after.width}`);
		await t.cdp.eval(`${t.target.deviceSettings}.set({ listShare: 0.5 }).then(() => 1)`);
	},
};
