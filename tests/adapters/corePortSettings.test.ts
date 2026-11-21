import { describe, expect, it } from "vitest";
import { corePortOver, NOW, standText } from "./standCore";

/** What the screen draws straight from the settings follows them (Decision 138): the core's one signal redraws it. */
describe("CorePort follows the settings the screen shows", () => {
	it("draws No section's new name once the setting changes, and tells the screen once", async () => {
		const { port, settings } = await corePortOver(standText(NOW), NOW);
		const headed = () => port.read(1).lists.day.rows.filter((row) => row.kind === "section").map((row) => (row.kind === "section" ? row.title : ""));
		expect(headed()).toContain("No section");
		let told = 0;
		port.subscribe(() => told++);
		await settings.update({ groups: { ...settings.get().groups, ungrouped: "Без секции" } });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(told).toBeGreaterThan(0);
		expect(headed()).toContain("Без секции");
	});
});
