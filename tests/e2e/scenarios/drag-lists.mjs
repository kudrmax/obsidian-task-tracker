import { carry, cardBy, listNow } from "../lib/carry.mjs";

/**
 * Drag and drop in and between lists (docs/plugin/tasks.md, «Перетаскивание»; spec 2026-11-18, «Decided» 1): the card
 * follows the finger, the cards part where it will land and the gap is that place; let go, the file has the task there and
 * the card shows there, every frame of it seen as its card or its copy. Checked against the file and what the screen reads.
 */
export default {
	name: "drag-lists",
	features: ["F146", "F147", "F151", "F152", "F153", "F159", "F161", "F163", "F165", "F168", "F171", "F288", "F295"],
	async run(t) {
		const inbox = async () => (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const checkFrames = (label, faults) => t.expect(faults.length === 0, `${label}: ${JSON.stringify(faults.slice(0, 4))}`);

		await t.setPlace("inbox");
		await t.open();
		const [a, b, c, d] = (await inbox()).slice(0, 4);

		/** Within Inbox: the second card below the fourth. */
		const lifted = await cardBy(t, b, "inbox");
		let parted = null;
		const within = await t.frames(
			() =>
				carry(t, lifted, async () => {
					const below = await cardBy(t, d, "inbox");
					return { x: lifted.x, y: below.bottom + 3 };
				}, { during: async () => (parted = await listNow(t, "inbox")) }),
			{ cast: "within", maxStep: 60, carried: { id: lifted.id, from: 0, until: 1500 } },
		);
		const shownParted = parted?.filter((row) => row !== "[home]" && row !== "No section").slice(0, 4);
		t.expect(JSON.stringify(shownParted) === JSON.stringify([a, c, d, "[gap]"]), `while carried the cards part and the gap is below the fourth: ${JSON.stringify(parted?.slice(0, 6))}`);
		await t.sleep(500);
		t.expect(JSON.stringify((await inbox()).slice(0, 4)) === JSON.stringify([a, c, d, b]), `the file has it there: ${JSON.stringify((await inbox()).slice(0, 4))}`);
		t.expect(JSON.stringify((await t.oracle.cards("inbox")).slice(0, 4)) === JSON.stringify([a, c, d, b]), "and the screen shows it there");
		checkFrames("frames of a drag within a list", within);

		/** Deeper: right of the list's middle, under the card above it is its subtask. */
		const sub = await cardBy(t, c, "inbox");
		await carry(t, sub, async () => {
			const parent = await cardBy(t, a, "inbox");
			/** The finger right of the list's middle by more than an indent: a level deeper. */
			return { x: parent.left + parent.width * 0.5 + 30, y: parent.bottom + 3 };
		});
		await t.sleep(600);
		const text = await t.file();
		t.expect(text.includes(`- [ ] ${a}\n\t- [ ] ${c}`) || new RegExp(`- \\[ \\] (p1 )?${a}\\n\\t- \\[ \\] ${c}`).test(text), `let go right of the middle under a card, it is that card's subtask in the file`);

		/** Inbox → Soon: the Soon column takes it, no date. */
		const toSoon = await cardBy(t, d, "inbox");
		const across = await t.frames(
			() =>
				carry(t, toSoon, async () => {
					const first = await t.oracle.rect('[data-list="soon"] .tc-card');
					return { x: first.x, y: first.top + 3 };
				}),
			{ cast: "inbox-to-soon", maxStep: 60, carried: { id: toSoon.id, from: 0, until: 1500 } },
		);
		await t.sleep(500);
		t.expect((await t.oracle.tasks("Soon")).some((task) => task.title === d && !task.dated) && !(await inbox()).includes(d), "dropped on Soon, the task is in Soon, undated, and gone from Inbox");
		checkFrames("frames of Inbox to Soon", across);

		/** On a column's title: into that list at the end of its part without a section; the title lights under the card. */
		const toTitle = await cardBy(t, a, "inbox");
		let lit = false;
		await carry(t, toTitle, async () => t.oracle.rect('.tc-stage-col.is-soon .tc-head-title'), { during: async () => (lit = await t.cdp.eval(`document.querySelector('.tc-stage-col.is-soon .tc-head-title').classList.contains("is-hot")`)) });
		await t.sleep(600);
		const soon = await t.oracle.tasks("Soon");
		const unsectioned = soon.filter((task) => task.section === null);
		t.expect(lit, "the title lights while the card is over it");
		t.expect(unsectioned.at(-1)?.title === a, `dropped on Soon's title, it ends Soon's part without a section: ${JSON.stringify(unsectioned.slice(-2).map((task) => task.title))}`);

		/** Cancelled (desktop: Escape): nothing written, the card back in its place. */
		if (t.platform === "desktop") {
			const before = await t.file();
			const back = await cardBy(t, c, "inbox") ?? (await cardBy(t, (await inbox())[1], "inbox"));
			const cancelled = await t.frames(() => carry(t, back, async () => ({ x: back.x, y: back.y + 120 }), { end: "cancel" }), { cast: "cancel", maxStep: 60, carried: { id: back.id, from: 0, until: 1200 } });
			await t.sleep(400);
			t.expect((await t.file()) === before, "a cancelled drag writes nothing");
			checkFrames("frames of a cancelled drag", cancelled);
		}

		/** Today → Soon: due date removed. */
		await t.setPlace("soon");
		await t.open();
		const today = (await t.oracle.tasks("Now")).find((task) => task.dated && !task.timed && task.status === " " && /\d+$/.test(task.title));
		const dayCard = await cardBy(t, today.title, "day");
		await carry(t, dayCard, async () => {
			const first = await t.oracle.rect('[data-list="soon"] .tc-card');
			return { x: first.x, y: first.top + 3 };
		});
		await t.sleep(600);
		t.expect((await t.oracle.tasks("Soon")).some((task) => task.title === today.title && !task.dated), "today's task dropped in Soon is in Soon without its date");
	},
};
