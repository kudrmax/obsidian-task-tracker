/**
 * E0, the time scale (spec, «Time scale», «Time»): read the way a person reads it, from the hour labels on the screen. The
 * now line stands where its time falls between the two hour lines around it; each block's top stands on its start time
 * as the file writes it, unless the stack pushed it down (its start written) or its time has passed (it rides the now line); tasks that overlap never share the width.
 */
export default {
	name: "e0-timeline",
	features: ["E0: time scale, the minute tick"],
	/**
	 * The clock the made-up tasks are laid around: the day's middle, and late evening, where the last blocks fall past
	 * midnight at the day's end. Read at whatever hour the run happens, the tasks ahead of the clock may not fit the day.
	 */
	cases: ["12:00", "22:50"],
	async run(t, clock) {
		await t.setClock(clock);
		const labels = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline .tc-hour-line")].map((l, i) => ({ y: l.getBoundingClientRect().top, label: document.querySelectorAll(".tc-timeline .tc-hour-label")[i].textContent }))`);
		/**
		 * Where a time stands, read off the hour lines in their order down the day: the day runs from its first line's hour
		 * past midnight (05 … 23, 00 … 04), so a time is placed by its hours since that first line, never by a label's name,
		 * which a day past midnight shows once at its end. The last hour ends one hour's height under its line.
		 */
		const yAt = (time) => {
			const [h, m] = time.split(":").map(Number);
			const first = Number(labels[0]?.label);
			const at = (h - first + 24) % 24;
			const here = labels[at]?.y;
			const height = labels.length > 1 ? (labels[Math.min(at + 1, labels.length - 1)].y - labels[Math.min(at + 1, labels.length - 1) - 1].y) : undefined;
			return here === undefined || height === undefined || labels[at].label !== String(h).padStart(2, "0") ? null : here + (height * m) / 60;
		};
		const now = await t.cdp.eval(`(() => { const n = document.querySelector(".tc-now"); const line = n.querySelector(".tc-now-line").getBoundingClientRect(); return { label: n.querySelector(".tc-now-pill").textContent, y: line.top + line.height / 2 }; })()`);
		const expected = yAt(now.label);
		t.expect(expected !== null && Math.abs(now.y - expected) <= 1.5, `the now line «${now.label}» stands at its time between the hour lines: ${now.y} against ${expected}`);
		const view = await t.oracle.rect(".tc-timeline");
		t.expect(now.y > view.top && now.y < view.bottom, "the timeline opens with the now line in sight");

		const file = await t.file();
		const timed = [...file.matchAll(/^- \[ \] (.+?) 📅 \S+ 📌 \S+ (\d\d:\d\d)-(\d\d:\d\d)$/gm)].map((m) => ({ title: m[1], start: m[2] }));
		const blocks = await t.cdp.eval(`[...document.querySelectorAll(".tc-timeline [data-block]")].map((b) => { const r = b.closest(".tc-block").getBoundingClientRect(); const corner = b.querySelector(".tc-block-meta:not(.is-hidden)"); return { title: b.querySelector(".tc-card-title").textContent, top: r.top, left: r.left, right: r.right, height: r.height, corner: corner ? [...corner.children].map((c) => c.textContent).join(":") : null }; })`);
		t.expect(blocks.length === timed.length && timed.length >= 4, `every timed task of the file has its block: ${blocks.length} of ${timed.length}`);
		/**
		 * Each block stands on its start (E3, the design's «Задачи на таймлайне»), except one pushed down by the stack, which
		 * writes its start on its right and stands below its line, and one whose time has passed, which rides the now line.
		 */
		for (const task of timed) {
			const block = blocks.find((b) => b.title === task.title);
			const y = yAt(task.start);
			const riding = y !== null && y < now.y - 1;
			const stacked = block?.corner === `${Number(task.start.slice(0, 2))}:${task.start.slice(3)}`;
			const ok = block && y !== null && (riding ? Math.abs(block.top - now.y) <= 2.5 : stacked ? block.top >= y - 1 : Math.abs(block.top - y) <= 2);
			t.expect(ok, `«${task.title}» at ${task.start}${riding ? " (past, riding the now line)" : stacked ? " (stacked)" : ""}: its top ${block?.top} against the line at ${y}, the now line at ${now.y}`);
		}
		const first = blocks.find((b) => b.title === "Пересекается первая");
		const second = blocks.find((b) => b.title === "Пересекается вторая");
		if (first && second) t.expect(second.top >= first.top + 35 || second.left > first.left, `two tasks that overlap never share the width: the later under the head of the first, or over its body further in: ${JSON.stringify([first, second])}`);
		await t.shot("timeline");
	},
};
