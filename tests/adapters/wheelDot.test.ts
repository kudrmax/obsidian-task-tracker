import { describe, expect, it } from "vitest";
import { corePortOver, NOW, standText } from "./standCore";

/** The day's events fetched afresh, as the port asks for them the first time a day is read. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("the dot on the wheel's calendar icon (F33)", () => {
	it("is the core's alert for the shown day: none while the calendars are fresh", async () => {
		const { port } = await corePortOver(standText(NOW));
		port.read(0);
		await settle();
		expect(port.read(0).day.alert).toBe("none");
	});
	it("on once a calendar in use has gone old: red here, its refresh failing too (the stand's Google answers nothing)", async () => {
		const { port } = await corePortOver(standText(NOW), NOW, 0, { staleAfterMinutes: -1 });
		port.read(0);
		await settle();
		expect(port.read(0).day.alert).toBe("broken");
	});
});
