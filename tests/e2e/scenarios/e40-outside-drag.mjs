import { carry, cardBy } from "../lib/carry.mjs";

/**
 * The file changed from outside while a card is carried (F7, F271; docs/plugin/file.md «Правка руками»; spec principle 5,
 * Decision 171). Sync or a hand edit deletes the very task the finger holds: the screen stays still under the finger,
 * the card is let go with the notice «The task changed in the file; the view was refreshed», nothing is written over the
 * edit, and the screen then draws the file. Sync moves two other tasks meanwhile: the carried card lands where it
 * was let go and the edit is kept and drawn.
 */
export default {
	name: "e40-outside-drag",
	features: ["F7, F271: the file changed from outside while a card is carried"],
	cases: ["held task deleted", "other tasks moved"],
	async run(t, item) {
		await t.setStop("inbox");
		const inbox = async () => (await t.oracle.tasks("Inbox")).map((task) => task.title);
		const [a, b, c, d] = await inbox();
		const held = await cardBy(t, a, "inbox");
		const aim = await cardBy(t, d, "inbox");
		let during = null;
		await carry(t, held, async () => ({ x: held.x, y: aim.bottom - 4 }), {
			during: async () => {
				if (item === "held task deleted") await t.stand(`removeFromOutside(${JSON.stringify(a)})`);
				else await t.stand(`moveFromOutside(${JSON.stringify(c)}, "inbox", ${JSON.stringify(b)})`);
				await t.sleep(200);
				during = (await t.oracle.cards("inbox")).slice(0, 4);
			},
		});
		await t.sleep(700);
		const notices = await t.stand("notices()");
		const file = await inbox();
		const screen = (await t.oracle.cards("inbox")).slice(0, 4);
		if (item === "held task deleted") {
			t.expect([a, b, c, d].every((title) => during?.includes(title)), `while the card is held, the screen stays still: ${JSON.stringify(during)}`);
			t.expect(JSON.stringify(notices) === JSON.stringify(["The task changed in the file; the view was refreshed"]), `the drop is refused and says so: ${JSON.stringify(notices)}`);
			t.expect(!file.includes(a), `nothing is written over the edit: ${JSON.stringify(file.slice(0, 4))}`);
			t.expect(JSON.stringify(screen) === JSON.stringify(file.slice(0, 4)), `the screen draws the file: ${JSON.stringify(screen)} against ${JSON.stringify(file.slice(0, 4))}`);
		} else {
			t.expect(JSON.stringify(notices) === "[]", `no notice: ${JSON.stringify(notices)}`);
			t.expect(file.indexOf(a) === file.indexOf(d) + 1, `the carried card landed below the one aimed at: ${JSON.stringify(file.slice(0, 5))}`);
			t.expect(file.indexOf(c) === file.indexOf(b) - 1, `the edit from outside is kept: ${JSON.stringify(file.slice(0, 5))}`);
			t.expect(JSON.stringify(screen) === JSON.stringify(file.slice(0, 4)), `the screen draws the file: ${JSON.stringify(screen)} against ${JSON.stringify(file.slice(0, 4))}`);
		}
	},
};
