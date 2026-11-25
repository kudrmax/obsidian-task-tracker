import { describe, expect, it } from "vitest";
import { CorePort } from "../../obsidian/adapters/CorePort";
import { memoryCore } from "../../obsidian/memoryCore";
import { mockFile } from "../../obsidian/stand/mockData";
import { standEvents } from "../../obsidian/stand/standEvents";
import { corePortOver, NOW, standText } from "./standCore";

/** The day's events fetched afresh, as the port asks for them the first time a day is read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the calendar sources window (F273–F276)", () => {
	it("draws the core's rows: those the day takes calendars from, then the spare ones, each worded and toned by the core", async () => {
		const { port } = await corePortOver(standText(NOW), NOW, 0, { staleAfterMinutes: -1 });
		port.read(0);
		await settle();
		const { sources } = port.read(0).day;
		expect(sources.inUse.map((row) => [row.source, row.tone, row.sub])).toEqual([
			["google", "broken", "not logged in"],
			["work", "old", "Exported from file"],
		]);
		expect(sources.spare.map((row) => [row.source, row.tone])).toEqual([["iphone", "spare"]]);
		expect([sources.notInUse, sources.alert, sources.inUse[0].alert, sources.inUse[0].time]).toEqual(["Not in use", "Refresh failed", "Refresh failed", "14:20"]);
	});

	it("has no rows before the day's events are read", async () => {
		const { port } = await corePortOver(standText(NOW));
		expect(port.read(0).day.sources).toEqual({ inUse: [], spare: [], notInUse: "", alert: "" });
	});

	it("Refresh now reads the sources again: the rows show the new update's time", async () => {
		let now = NOW;
		const clock = { now: () => now };
		const made = memoryCore(standText(NOW), clock, {}, standEvents(mockFile(NOW), NOW));
		const port = await CorePort.open({ ...made.core, clock, tasksFile: () => made.settings.get().tasksFile, onError: (error) => {
			throw error;
		} });
		port.read(0);
		await settle();
		expect(port.read(0).day.sources.inUse.find((row) => row.source === "work")?.time).toBe("14:20");
		now = new Date(2026, 10, 18, 14, 45);
		await port.refreshSources();
		port.read(0);
		await settle();
		expect(port.read(0).day.sources.inUse.find((row) => row.source === "work")?.time).toBe("14:45");
	});
});
