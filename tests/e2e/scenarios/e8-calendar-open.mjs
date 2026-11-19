/**
 * E3, where today opens (F86; the plugin's `scrollPlace`): the now line stands at half of what a person sees of the
 * calendar (above the screen's foot), even near the day's first hour or its last, where empty room over or under the day
 * lets it stand there.
 */
export default {
	name: "e8-calendar-open",
	features: ["E3: today opens with the now line in the middle of what is seen, near the day's edges too (F86)"],
	cases: ["05:20", "12:00", "04:30"],
	async run(t, at) {
		await t.setClock(at);
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const seen = await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const r = room.getBoundingClientRect(); const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height; const line = document.querySelector(".tc-now-line").getBoundingClientRect(); return { top: r.top, visible: r.height - foot, now: line.top + line.height / 2 }; })()`);
		const share = (seen.now - seen.top) / seen.visible;
		t.expect(Math.abs(share - 0.5) <= 0.05, `today at ${at} opens with the now line at half of what is seen: ${share.toFixed(3)} (${JSON.stringify(seen)})`);
		await t.shot(`open-${at.replace(":", "")}`);
	},
};
