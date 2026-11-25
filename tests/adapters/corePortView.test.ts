import { describe, expect, it } from "vitest";
import { projectNodeOf } from "../../core/application/contracts";
import { corePortOver, NOW, standText } from "./standCore";

/** The view the main screen draws and its button's menu, as the core keeps it on the device (F10–F13; Decision 149). */
describe("CorePort's view", () => {
	it("offers All columns on a wide screen only, By project everywhere (Decision 165), Two columns chosen first", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		expect(port.view(true).modes.map((m) => m.label)).toEqual(["Two columns", "All columns", "Rows", "By project"]);
		expect(port.view(false).modes.map((m) => m.label)).toEqual(["Columns", "Rows", "By project"]);
		expect(port.view(true)).toMatchObject({ mode: "twoColumns", ribbon: true, icon: "columns-2" });
		expect(port.view(true).modes.filter((m) => m.checked).map((m) => m.mode)).toEqual(["twoColumns"]);
	});

	it("keeps a mode picked, tells the screen, and the button wears its icon", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		port.view(true);
		let told = 0;
		port.subscribe(() => told++);
		await port.setViewMode("rows");
		expect(told).toBeGreaterThan(0);
		expect(port.view(true)).toMatchObject({ mode: "rows", ribbon: false, icon: "rows-3" });
		expect(port.view(false).mode).toBe("rows");
	});

	it("draws By project as the core reads it: the chosen node's parts in one list, its cards known by their tasks (F229, Decision 165)", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		port.view(true);
		await port.setViewMode("byProject");
		expect(port.view(true)).toMatchObject({ mode: "byProject", ribbon: false });
		expect(port.view(true).modes.find((m) => m.checked)?.mode).toBe("byProject");
		const list = port.read(0).lists.projects;
		const tasks = list.rows.filter((row) => row.kind === "task");
		expect(tasks.length).toBeGreaterThan(0);
		expect(tasks.every((row) => row.id in port.read(0).cards)).toBe(true);
		expect(list.rows.some((row) => row.kind === "section")).toBe(true);
	});

	it("offers the Subprojects row while a project with subprojects is chosen, and turns its check over (F13)", async () => {
		const { port, core } = await corePortOver(`${standText(NOW)}\n## Projects\n\n- Дом\n\t- Ремонт\n`, NOW);
		expect(port.view(true).subprojects).toBeNull();
		await core.tasks.pickProjectNode(projectNodeOf("Дом"), true);
		await port.toggleSubprojects();
		await port.toggleSubprojects();
		expect(port.view(true).subprojects).toEqual({ label: "Subprojects", checked: true });
		await port.toggleSubprojects();
		expect(port.view(true).subprojects).toEqual({ label: "Subprojects", checked: false });
		expect(port.view(true).mode).toBe("twoColumns");
	});
});
