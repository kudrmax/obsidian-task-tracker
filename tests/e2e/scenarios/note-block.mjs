/**
 * The block at the end of a project's note (docs/plugin/screen.md, «Блок в заметке проекта»): the project's view, rows by
 * default, with no timeline, no wheel and no ribbon; the bottom row holds Undo, the view button and the plus; shown in
 * Reading view and in Live Preview, never written into the note.
 */
export default {
	name: "note-block",
	features: ["F278", "F279", "F280", "F282"],
	async run(t) {
		const note = t.notePath;
		/** The block the open view shows: Obsidian keeps a note's reading view and its editor both, one hidden. */
		const shown = `[...document.querySelectorAll(".tc-project-block")].find((b) => b.offsetParent !== null)`;
		const before = await t.cdp.eval(`app.vault.adapter.read(${JSON.stringify(note)})`);
		for (const mode of ["preview", "source"]) {
			await t.cdp.eval(`(async () => {
				const leaf = app.workspace.getLeavesOfType("${t.target.viewType}")[0] ?? app.workspace.getLeaf(false);
				await leaf.setViewState({ type: "empty" });
				await leaf.openFile(app.vault.getAbstractFileByPath(${JSON.stringify(note)}), { state: { mode: "${mode}" } });
				return 1;
			})()`);
			const block = await t.waitFor(() => t.oracle.rect(".tc-project-block .task-calendar.is-note .tc-card"));
			await t.sleep(500);
			t.expect(block !== null, `${mode}: the block stands at the note's end`);
			if (!block) continue;
			const labels = await t.cdp.eval(`[...(${shown}?.querySelectorAll(".tc-row-label") ?? [])].map((l) => l.textContent)`);
			t.expect(JSON.stringify(labels) === JSON.stringify(["Inbox", "Backlog", "Soon", "Today"]), `${mode}: the rows by default: ${JSON.stringify(labels)}`);
			const cards = await t.cdp.eval(`[...(${shown}?.querySelectorAll(".tc-card .tc-card-title") ?? [])].map((c) => c.textContent)`);
			/** The project's tasks and its subproject's (Subprojects on, the default): the file's lines that name either. */
			const home = (await t.file()).split("\n").filter((line) => /^- \[ \]/.test(line) && /🗂️ (Дом|Кухня)/u.test(line)).map((line) => line.replace(/^- \[.\] (p[12] )?/, "").split(" 🗂️")[0]);
			t.expect(home.length > 0 && JSON.stringify([...cards].sort()) === JSON.stringify([...home].sort()), `${mode}: the project's tasks and only them: ${JSON.stringify(cards)} against ${JSON.stringify(home)}`);
			const parts = await t.cdp.eval(`(() => { const b = ${shown}; return { timeline: !!b.querySelector(".tc-timeline"), wheel: !!b.querySelector(".tc-seg"), undo: !!b.querySelector(".tc-undo"), view: !!b.querySelector(".tc-view-btn"), plus: !!b.querySelector(".tc-plus") }; })()`);
			t.expect(!parts.timeline && !parts.wheel && parts.undo && parts.view && parts.plus, `${mode}: no timeline or wheel; Undo, the view button and the plus: ${JSON.stringify(parts)}`);
			const grown = await t.cdp.eval(`(() => { const b = ${shown}; const stack = b.querySelector(".tc-rows-stack"); return { block: b.getBoundingClientRect().height, content: stack.scrollHeight }; })()`);
			t.expect(grown.block >= Math.min(grown.content, 200), `${mode}: the frame grows with its tasks: ${JSON.stringify(grown)}`);
			await t.shot(`note-${mode}`);
		}
		const after = await t.cdp.eval(`app.vault.adapter.read(${JSON.stringify(note)})`);
		t.expect(after === before, "the note's text is never written");
	},
};
