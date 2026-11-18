/**
 * E0, the time scale (spec, «Time scale», «Time»): read the way a person reads it, from the hour labels on the screen. The
 * now line stands where its time falls between the two hour lines around it; each block's top stands on its start time
 * as the file writes it; blocks that overlap stand side by side.
 */
export default {
	name: "e0-timeline",
	features: ["E0: time scale, the minute tick"],
	async run(t) {
		const labels = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline .tc-hour-line")].map((l, i) => ({ y: l.getBoundingClientRect().top, label: document.querySelectorAll(".tc-timeline .tc-hour-label")[i].textContent }))`);
		const lineOf = (hh) => labels.find((l) => l.label === hh)?.y;
		const yAt = (time) => {
			const [h, m] = time.split(":").map(Number);
			const here = lineOf(String(h).padStart(2, "0"));
			const next = lineOf(String((h + 1) % 24).padStart(2, "0"));
			return here === undefined || next === undefined ? null : here + ((next - here) * m) / 60;
		};
		const now = await t.cdp.eval(`(() => { const n = document.querySelector(".tc-now"); const line = n.querySelector(".tc-now-line").getBoundingClientRect(); return { label: n.querySelector(".tc-now-pill").textContent, y: line.top + line.height / 2 }; })()`);
		const expected = yAt(now.label);
		t.expect(expected !== null && Math.abs(now.y - expected) <= 1.5, `the now line «${now.label}» stands at its time between the hour lines: ${now.y} against ${expected}`);
		const view = await t.oracle.rect(".tc-timeline");
		t.expect(now.y > view.top && now.y < view.bottom, "the timeline opens with the now line in sight");

		const file = await t.file();
		const timed = [...file.matchAll(/^- \[ \] (.+?) 📅 \S+ 📌 \S+ (\d\d:\d\d)-(\d\d:\d\d)$/gm)].map((m) => ({ title: m[1], start: m[2] }));
		const blocks = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline [data-block]")].map((b) => { const r = b.closest(".tc-block").getBoundingClientRect(); return { title: b.querySelector(".tc-card-title").textContent, top: r.top, left: r.left, right: r.right }; })`);
		t.expect(blocks.length === timed.length && timed.length >= 4, `every timed task of the file has its block: ${blocks.length} of ${timed.length}`);
		for (const task of timed) {
			const block = blocks.find((b) => b.title === task.title);
			const y = yAt(task.start);
			t.expect(block && y !== null && Math.abs(block.top - y) <= 2, `«${task.title}» starts on ${task.start}: its top ${block?.top} against the line at ${y}`);
		}
		const first = blocks.find((b) => b.title === "Пересекается первая");
		const second = blocks.find((b) => b.title === "Пересекается вторая");
		if (first && second) t.expect(first.right <= second.left + 1, `two blocks that overlap stand side by side: ${JSON.stringify([first, second])}`);
		await t.shot("timeline");
	},
};
