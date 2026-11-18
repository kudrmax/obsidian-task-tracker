/**
 * Opening the view and its hosts (docs/plugin/screen.md intro; docs/plugin/file.md): the command opens it, again it is
 * revealed rather than doubled; several tabs show the same; a change of the file from outside shows at once; without a
 * file the view offers to create it, and creating it writes the file.
 */
export default {
	name: "opening",
	features: ["F1", "F2", "F3", "F6", "F7"],
	async run(t) {
		const leaves = () => t.cdp.eval(`app.workspace.getLeavesOfType("${t.target.viewType}").length`);
		await t.cdp.eval(`app.commands.executeCommandById("${t.target.openCommand}")`);
		await t.sleep(500);
		t.expect((await leaves()) === 1, "the command again reveals the open view, no second one");
		if (t.platform === "desktop") {
			const ribbon = await t.oracle.rect(`.side-dock-ribbon-action[aria-label="${t.target.ribbonLabel}"]`);
			t.expect(ribbon !== null, `the ribbon icon «${t.target.ribbonLabel}»`);
		}

		/** Two tabs side by side: the desktop's; the phone shows one tab at a time. */
		const tabs = t.platform === "desktop" ? 2 : 1;
		if (tabs === 2) {
			await t.cdp.eval(`app.workspace.getLeaf("split").setViewState({ type: "${t.target.viewType}", active: true }).then(() => 1)`);
			await t.sleep(1200);
			t.expect((await leaves()) === 2, "a second tab with the view");
		}
		const text = await t.file();
		const added = "Дописано снаружи";
		await t.setFile(text.replace("## Now\n", `## Now\n- [ ] ${added}\n`));
		await t.sleep(1500);
		const shown = await t.cdp.eval(`[...document.querySelectorAll('.task-calendar [data-list="day"]')].map((list) => [...list.querySelectorAll(".tc-card-title")].some((c) => c.textContent === ${JSON.stringify(added)}))`);
		t.expect(shown.length === tabs && shown.every(Boolean), `a task written into the file from outside shows at once in every tab: ${JSON.stringify(shown)}`);
		await t.open();

		await t.setFile(null);
		await t.sleep(1500);
		const offer = await t.oracle.text();
		t.expect(offer.includes("No tasks file at TODOs Tasks.md") && offer.includes("Create file"), `no file: the offer to create it: ${JSON.stringify(offer.slice(0, 80))}`);
		await t.shot("missing");
		const create = await t.oracle.rect(".tc-missing-btn");
		if (t.platform === "phone") await t.input.tap(create.x, create.y);
		else await t.input.click(create.x, create.y);
		await t.sleep(1500);
		const made = await t.file();
		t.expect(["## Inbox", "## Now", "## Soon", "## Backlog", "## Done"].every((head) => made.includes(head)), `Create file writes the five sections: ${JSON.stringify(made.slice(0, 80))}`);
		t.expect(!(await t.oracle.text()).includes("No tasks file"), "and the screen shows the lists");
	},
};
