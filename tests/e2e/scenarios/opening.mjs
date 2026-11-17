/**
 * Opening the view and its hosts (docs/plugin/screen.md intro; docs/plugin/file.md): the command opens it, again it is
 * revealed rather than doubled; several tabs show the same; a change of the file from outside shows at once; without a
 * file the view offers to create it, and creating it writes the file.
 */
export default {
	name: "opening",
	features: ["F1", "F2", "F3", "F6", "F7"],
	async run(t) {
		const leaves = () => t.cdp.eval(`app.workspace.getLeavesOfType("task-calendar").length`);
		await t.cdp.eval(`app.commands.executeCommandById("task-calendar:open")`);
		await t.sleep(500);
		t.expect((await leaves()) === 1, "the command again reveals the open view, no second one");
		if (t.platform === "desktop") {
			const ribbon = await t.oracle.rect('.side-dock-ribbon-action[aria-label="Task Calendar"]');
			t.expect(ribbon !== null, "the ribbon icon «Task Calendar»");
		}

		await t.cdp.eval(`app.workspace.getLeaf("split").setViewState({ type: "task-calendar", active: true }).then(() => 1)`);
		await t.sleep(1200);
		t.expect((await leaves()) === 2, "a second tab with the view");
		const text = t.file();
		const added = "Дописано снаружи";
		const { writeFileSync } = await import("node:fs");
		writeFileSync(t.tasksPath, text.replace("## Now\n", `## Now\n- [ ] ${added}\n`));
		await t.sleep(1500);
		const shown = await t.cdp.eval(`[...document.querySelectorAll('.task-calendar [data-list="day"]')].map((list) => [...list.querySelectorAll(".tc-card-title")].some((c) => c.textContent === ${JSON.stringify(added)}))`);
		t.expect(shown.length === 2 && shown.every(Boolean), `a task written into the file from outside shows at once in both tabs: ${JSON.stringify(shown)}`);
		await t.open();

		await t.cdp.eval(`app.vault.adapter.remove(app.plugins.plugins["task-calendar"].get().tasksFile ?? "TODOs Tasks.md").then(() => 1)`);
		await t.sleep(1500);
		const offer = await t.oracle.text();
		t.expect(offer.includes("No tasks file at TODOs Tasks.md") && offer.includes("Create file"), `no file: the offer to create it: ${JSON.stringify(offer.slice(0, 80))}`);
		await t.shot("missing");
		const create = await t.oracle.rect(".tc-missing-btn");
		if (t.platform === "phone") await t.input.tap(create.x, create.y);
		else await t.input.click(create.x, create.y);
		await t.sleep(1500);
		const made = t.file();
		t.expect(["## Inbox", "## Now", "## Soon", "## Backlog", "## Done"].every((head) => made.includes(head)), `Create file writes the five sections: ${JSON.stringify(made.slice(0, 80))}`);
		t.expect(!(await t.oracle.text()).includes("No tasks file"), "and the screen shows the lists");
	},
};
