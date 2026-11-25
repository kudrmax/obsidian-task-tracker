import { describe, expect, it } from "vitest";
import { projectNodeOf } from "../../core/application/contracts";
import { corePortOver, NOW, standText } from "./standCore";

const WIDE = { wide: true, note: null };
const NARROW = { wide: false, note: null };
const TREE = `${standText(NOW)}\n## Projects\n\n- Дом\n\t- Ремонт\n`;

/** The view a screen draws, as the core gives it, in the screen's own context (F10–F14; Decisions 148, 149). */
describe("CorePort's view", () => {
	it("passes the core's choice: All columns on a wide screen only, Two columns chosen first, the layout and the wheel the core's", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		expect(port.within(undefined, WIDE).view().modes.map((m) => m.label)).toEqual(["Two columns", "All columns", "Rows"]);
		expect(port.within(undefined, NARROW).view().modes.map((m) => m.label)).toEqual(["Columns", "Rows"]);
		const view = port.within(undefined, WIDE).view();
		expect(view).toMatchObject({ mode: "twoColumns", chosen: "twoColumns", wheel: true, icon: "columns-2", layout: { swipe: "pages" } });
	});

	it("keeps a mode picked, tells the screen, the layout and the context change with it", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		const screen = port.within(undefined, WIDE);
		const before = screen.view().context;
		let told = 0;
		screen.subscribe(() => told++);
		await screen.setViewMode("rows");
		expect(told).toBeGreaterThan(0);
		expect(screen.view()).toMatchObject({ mode: "rows", wheel: false, icon: "rows-3", layout: { swipe: "none", stack: { lists: ["inbox", "backlog", "soon", "day"] } } });
		expect(screen.view().context).not.toBe(before);
		expect(screen.view().plates).toMatchObject({ inbox: "No tasks", day: "No tasks" });
	});

	it("leaves By project out of the menu until the engine draws it", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		expect(port.within(undefined, WIDE).view().modes.some((m) => m.mode === "byProject")).toBe(false);
	});

	it("reads the main screen's view in its own context, never the device's chosen node (review finding 5)", async () => {
		const { port, core } = await corePortOver(TREE, NOW);
		await core.tasks.pickProjectNode(projectNodeOf("Дом"), true);
		expect(port.within(undefined, WIDE).view().subprojects).toBeNull();
		await core.tasks.pickProjectNode(projectNodeOf("done"), true);
		expect(port.within(undefined, WIDE).view().mode).toBe("twoColumns");
	});

	it("offers the Subprojects row in a project with subprojects, turns its check over, and tells the context apart (F13)", async () => {
		const { port } = await corePortOver(TREE, NOW);
		const home = port.within({ project: "Дом" }, WIDE);
		const on = home.view();
		expect(on.subprojects).toEqual({ label: "Subprojects", checked: true });
		await home.toggleSubprojects();
		expect(home.view().subprojects).toEqual({ label: "Subprojects", checked: false });
		expect(home.view().context).not.toBe(on.context);
		expect(home.view().mode).toBe(on.mode);
	});

	it("gives a note's block its own view, not the main screen's (review finding 8)", async () => {
		const { port } = await corePortOver(TREE, NOW);
		await port.within(undefined, WIDE).setViewMode("allColumns");
		const note = port.within({ project: "Дом" }, { wide: true, note: "Дом.md" });
		expect(note.view().mode).not.toBe("allColumns");
	});

	it("draws Rows' empty list with the core's No tasks plate, Two columns' without a filter none (F17, F64)", async () => {
		const { port } = await corePortOver("## Inbox\n\n## Now\n\n## Soon\n\n## Backlog\n\n## Done\n", NOW);
		const screen = port.within(undefined, WIDE);
		expect(screen.read(0).lists.inbox.rows).toEqual([]);
		expect(screen.read(0).lists.inbox.plate).toBeNull();
		await screen.setViewMode("rows");
		expect(screen.read(0).lists.inbox.plate).toBe("No tasks");
	});
});
