import { carry } from "../lib/carry.mjs";

/** The block a person sees: in the note's reading view, as the test page lays the note out. */
const BLOCK = ".markdown-reading-view .tc-note-block";

/**
 * E0, the note's block (spec, principle 1): the same TaskScreen mounted in a note shows its list as the leaf does, and the
 * same drag works in it. The note is the test page's stand-in for Obsidian's reading view; the block inside Obsidian's
 * own note is checked by hand in the test Obsidian.
 */
export default {
	name: "e0-note",
	features: ["E0: the leaf and the note block, one TaskScreen"],
	async run(t) {
		await t.stand("openNote()");
		await t.sleep(1200);
		const block = await t.oracle.rect(`${BLOCK} .task-calendar`);
		t.expect(block !== null && block.height > 200, `the note shows the screen's block: ${JSON.stringify(block)}`);
		const titles = () => t.cdp.eval(`[...document.querySelectorAll('${BLOCK} [data-list="inbox"] .tc-card-title')].map((e) => e.textContent)`);
		const card = (title) => t.cdp.eval(`(() => { const c = [...document.querySelectorAll('${BLOCK} .tc-card[data-id]')].find((c) => c.querySelector('.tc-card-title').textContent === ${JSON.stringify(title)}); if (!c) return null; const r = c.getBoundingClientRect(); return { id: c.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom }; })()`);
		const wanted = (await t.oracle.tasks("Inbox")).slice(0, 5).map((task) => task.title);
		t.expect(JSON.stringify((await titles()).slice(0, 5)) === JSON.stringify(wanted), `it shows Inbox's first tasks in the file's order: ${JSON.stringify((await titles()).slice(0, 5))} against ${JSON.stringify(wanted)}`);
		await t.shot("note");
		const [a, b, c] = wanted;
		const lifted = await card(a);
		let aim = null;
		const frames = await t.frames(() => carry(t, lifted, async () => (aim ??= await card(c).then((under) => ({ x: lifted.x, y: under.bottom - 4 })))), { cast: "note-drag", maxStep: 60, carried: { id: lifted.id, from: 0, until: 1500 } });
		await t.sleep(500);
		const after = (await t.oracle.tasks("Inbox")).slice(0, 3).map((task) => task.title);
		t.expect(JSON.stringify(after) === JSON.stringify([b, c, a]), `the same drag works in the block: ${JSON.stringify(after)}`);
		t.expect(JSON.stringify((await titles()).slice(0, 3)) === JSON.stringify([b, c, a]), `and the block shows it: ${JSON.stringify((await titles()).slice(0, 3))}`);
		t.expect(frames.length === 0, `frames of a drag in the block: ${JSON.stringify(frames.slice(0, 4))}`);
	},
};
