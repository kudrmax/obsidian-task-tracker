/**
 * E2, a change of context drawn in place (F23; spec, principle 3; docs/plugin/screen.md «Режимы вида»; Decision 132):
 * another project chosen, or none, redraws the screen where it stands: no card flies in, slides apart or fades; only the
 * chosen project's tasks (with their subtasks) show in every list and on the calendar, and every task again once none is
 * chosen. The tasks file says which tasks are the project's.
 */
const PROJECT = "Дом";

/** The titles of the project's open tasks and of their subtasks, as the tasks file has them. */
function projectTitles(file, project) {
	const titles = new Set();
	let mine = false;
	for (const line of file.split("\n")) {
		const m = /^(\s*)- \[[ /]\] (?:p[12] )?(.*)$/u.exec(line);
		if (!m) continue;
		const title = m[2].split(/ (?:📅|📌|🗂️|📁)/u)[0];
		if (m[1] === "") mine = line.includes(`🗂️ ${project}`);
		if (mine) titles.add(title);
	}
	return titles;
}

/** The blocks' titles on the calendar, as drawn now. */
const blocks = (t) => t.cdp.eval(`[...document.querySelectorAll(".task-calendar .tc-block-card .tc-card-title")].map((e) => e.textContent).sort()`);

/**
 * What moved where nothing may move: drawn in place, a card stands in the new context's place from the frame it is drawn,
 * so it changes its place at most once and is never seen part-faded.
 */
function moved(frames) {
	const faults = [];
	const changes = new Map();
	for (let i = 1; i < frames.length; i++) {
		const before = new Map(frames[i - 1].items.map((item) => [item.id, item]));
		for (const item of frames[i].items) {
			const was = before.get(item.id);
			if (was && (Math.abs(was.x - item.x) > 0.5 || Math.abs(was.y - item.y) > 0.5)) changes.set(item.id, [...(changes.get(item.id) ?? []), { t: frames[i].t, dy: +(item.y - was.y).toFixed(1) }]);
			if (item.o > 0.05 && item.o < 0.95) faults.push({ t: frames[i].t, id: item.id, o: item.o });
		}
	}
	for (const [id, steps] of changes) if (steps.length > 1) faults.push({ id, steps });
	return faults;
}

export default {
	name: "e23-context",
	features: ["E2: a change of context drawn in place (F23)"],
	cases: ["inbox", "soon", "calendar"],
	async run(t, stop) {
		await t.setStop(stop);
		const lists = stop === "inbox" ? ["inbox", "soon"] : stop === "soon" ? ["soon", "day"] : ["day"];
		const mine = projectTitles(await t.file(), PROJECT);
		const blocksBefore = await blocks(t);

		const chosen = await t.record(() => t.stand(`setProject(${JSON.stringify(PROJECT)})`), { cast: "choose", settleMs: 700 });
		const chosenMoves = moved(chosen);
		t.expect(chosenMoves.length === 0, `choosing a project moves and fades no card: ${JSON.stringify(chosenMoves.slice(0, 4))}`);
		for (const list of lists) {
			const cards = await t.oracle.cards(list);
			t.expect(cards.length > 0 && cards.every((title) => mine.has(title)), `${list} shows only «${PROJECT}»'s tasks: ${JSON.stringify(cards)}`);
		}
		const own = blocksBefore.filter((title) => mine.has(title));
		t.expect(JSON.stringify(await blocks(t)) === JSON.stringify(own), `the calendar too: ${JSON.stringify(await blocks(t))}, want ${JSON.stringify(own)}`);
		await t.shot(`${stop}-project`);

		const none = await t.record(() => t.stand(`setProject(null)`), { cast: "none", settleMs: 700 });
		const noneMoves = moved(none);
		t.expect(noneMoves.length === 0, `choosing none moves and fades no card: ${JSON.stringify(noneMoves.slice(0, 4))}`);
		const all = await t.oracle.cards(lists[0]);
		t.expect(all.some((title) => !mine.has(title)), `every task again: ${JSON.stringify(all)}`);
		t.expect(JSON.stringify(await blocks(t)) === JSON.stringify(blocksBefore), `every block again: ${JSON.stringify(await blocks(t))}`);
	},
};
