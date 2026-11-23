import { describe, expect, it } from "vitest";
import { corePortOver, NOW, standText } from "./standCore";

/** The view the main screen draws and its button's menu, as the core keeps it on the device (F10–F13; Decision 149). */
describe("CorePort's view", () => {
	it("offers All columns on a wide screen only, By project not until the engine draws it, Two columns chosen first", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		expect(port.view(true).modes.map((m) => m.label)).toEqual(["Two columns", "All columns", "Rows"]);
		expect(port.view(false).modes.map((m) => m.label)).toEqual(["Columns", "Rows"]);
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

	it("draws a kept By project as two columns until the engine draws it", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		await port.setViewMode("byProject");
		expect(port.view(true)).toMatchObject({ mode: "twoColumns", ribbon: true });
		expect(port.view(true).modes.find((m) => m.checked)?.mode).toBe("twoColumns");
	});
});
