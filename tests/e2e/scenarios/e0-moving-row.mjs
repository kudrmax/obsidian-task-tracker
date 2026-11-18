/**
 * E0, rows that move (spec, «Rows that move»; principle 3): a change from outside the screen (Sync, a hand edit) moves a
 * card the same way a drag does: it glides to its new place, the cards it passes glide too, nothing jumps, doubles or
 * flickers; a task new in the file comes in at its place. Checked against the file and the frames.
 */
export default {
	name: "e0-moving-row",
	features: ["E0: MovingRow"],
	async run(t) {
		await t.setStop("inbox");
		const inbox = async () => (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const [a, b, c] = await inbox();
		const moved = await t.frames(async () => {
			await t.stand(`moveFromOutside(${JSON.stringify(c)}, "inbox", ${JSON.stringify(a)})`);
		}, { cast: "move-from-outside", maxStep: 40, settleMs: 800 });
		t.expect(JSON.stringify((await inbox()).slice(0, 3)) === JSON.stringify([c, a, b]), `the file has the third first: ${JSON.stringify((await inbox()).slice(0, 3))}`);
		t.expect(JSON.stringify((await t.oracle.cards("inbox")).slice(0, 3)) === JSON.stringify([c, a, b]), `and the screen shows it first: ${JSON.stringify((await t.oracle.cards("inbox")).slice(0, 3))}`);
		t.expect(moved.length === 0, `frames of a move from outside: ${JSON.stringify(moved.slice(0, 4))}`);

		const added = await t.frames(async () => {
			await t.stand(`addFromOutside("inbox", "Пришла снаружи")`);
		}, { cast: "add-from-outside", maxStep: 40, settleMs: 800 });
		t.expect((await t.oracle.cards("inbox"))[0] === "Пришла снаружи" && (await inbox())[0] === "Пришла снаружи", "a task new in the file comes in first, on the screen too");
		t.expect(added.length === 0, `frames of a task added from outside: ${JSON.stringify(added.slice(0, 4))}`);
	},
};
