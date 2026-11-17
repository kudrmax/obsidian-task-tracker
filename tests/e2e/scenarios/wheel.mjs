/**
 * The wheel at the bottom (docs/plugin/screen.md, «Колёсико»): its pill shows which two columns the window holds, and a
 * tap on an icon outside the window turns the ribbon to the nearest place that shows it.
 */
export default {
	name: "wheel",
	features: ["F28", "F29"],
	async run(t) {
		const tapIcon = async (column) => {
			const icon = await t.oracle.rect(`.tc-seg-view .tc-seg-icon[data-column="${column}"]`);
			if (t.platform === "phone") await t.input.tap(icon.x, icon.y);
			else await t.input.click(icon.x, icon.y);
			await t.sleep(700);
		};
		const inPill = async () =>
			t.cdp.eval(`(() => { const pill = document.querySelector(".tc-seg-pill").getBoundingClientRect(); return [...document.querySelectorAll(".tc-seg-view .tc-seg-icon")].filter((i) => { const r = i.getBoundingClientRect(); const mid = r.left + r.width / 2; return mid > pill.left && mid < pill.right; }).map((i) => i.dataset.column); })()`);
		t.expect(JSON.stringify(await inPill()) === JSON.stringify(["now", "calendar"]), `at Now–calendar the pill holds Now and the calendar: ${JSON.stringify(await inPill())}`);
		await tapIcon("inbox");
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Inbox", "Backlog", "Soon"]), `a tap on Inbox turns to Inbox–Soon: ${JSON.stringify(await t.oracle.columns())}`);
		t.expect(JSON.stringify(await inPill()) === JSON.stringify(["inbox", "soon"]), `and the pill holds Inbox and Soon: ${JSON.stringify(await inPill())}`);
		await tapIcon("now");
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Soon", "Today"]), `a tap on Now from Inbox turns to the nearest place that shows it, Soon–Now: ${JSON.stringify(await t.oracle.columns())}`);
		await tapIcon("calendar");
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Today"]), "a tap on the calendar turns to Now–calendar");
		const faults = await t.frames(() => tapIcon("soon"), { cast: "tap-soon", maxStep: 600 });
		t.expect(JSON.stringify(await t.oracle.columns()) === JSON.stringify(["Soon", "Today"]), "a tap on Soon turns to Soon–Now");
		t.expect(faults.length === 0, `frames of a turn by the wheel: ${JSON.stringify(faults.slice(0, 3))}`);
	},
};
