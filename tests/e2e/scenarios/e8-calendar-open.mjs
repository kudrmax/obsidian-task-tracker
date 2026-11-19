/**
 * E3, where today opens (F86; the plugin's `scrollPlace`, amended by Max on 2026-11-19, spec Decision 48): the now line
 * stands at half of what a person sees of the calendar (above the screen's foot) as far as the day's ends let it: near the
 * day's first hour the calendar stands at the day's start, near its last at the day's end, with no empty room kept beyond.
 */
export default {
	name: "e8-calendar-open",
	features: ["E3: today opens with the now line in the middle of what is seen, the day's ends stopping it (F86)"],
	cases: ["05:20", "12:00", "04:30"],
	async run(t, at) {
		await t.setClock(at);
		await t.cdp.eval(`(async () => { window.__tcStand.step("step-calendar"); await new Promise((r) => setTimeout(r, 700)); return 1; })()`);
		const seen = await t.cdp.eval(`(() => { const room = document.querySelector(".tc-timeline"); const r = room.getBoundingClientRect(); const foot = room.querySelector(".tc-foot-probe").getBoundingClientRect().height; const line = document.querySelector(".tc-now-line").getBoundingClientRect(); return { top: r.top, visible: r.height - foot, now: line.top + line.height / 2, scroll: room.scrollTop, max: room.scrollHeight - room.clientHeight }; })()`);
		const share = (seen.now - seen.top) / seen.visible;
		const half = Math.abs(share - 0.5) <= 0.05;
		const atStart = seen.scroll <= 0.5 && share < 0.5;
		const atEnd = seen.scroll >= seen.max - 0.5 && share > 0.5;
		t.expect(half || atStart || atEnd, `today at ${at} opens with the now line at half of what is seen, or the day's end stops it nearer: ${share.toFixed(3)} (${JSON.stringify(seen)})`);
		if (at === "05:20") t.expect(atStart, `at 05:20 the calendar stands at the day's start, no room over it: ${JSON.stringify(seen)}`);
		if (at === "12:00") t.expect(half, `at 12:00 the now line stands at half: ${share.toFixed(3)}`);
		await t.shot(`open-${at.replace(":", "")}`);
	},
};
