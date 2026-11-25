// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { corePortOver, NOW, standText } from "../../adapters/standCore";

/** F50: «Day starts at» changed opens the screen on today afresh, whatever day it showed. */
describe("the screen when the day's start moves", () => {
	it("goes back to today", async () => {
		const { port, settings } = await corePortOver(standText(NOW), NOW);
		const store = createScreenStore(port);
		const stop = store.getState().start();
		store.getState().turnDay(1);
		store.getState().turnDay(1);
		expect(store.getState().dayOffset).toBe(2);
		await settings.update({ dayStartHour: settings.get().dayStartHour === 6 ? 7 : 6 });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(store.getState().dayOffset).toBe(0);
		stop();
	});

	it("turns a day either way past the calendar, and the title goes back to today", async () => {
		const { port } = await corePortOver(standText(NOW), NOW);
		const store = createScreenStore(port);
		store.getState().setStop("soon");
		store.getState().turnDay(-1);
		expect(store.getState()).toMatchObject({ stop: "calendar", dayOffset: -1 });
		expect(store.getState().shown.lists.day.title).toBe("Yesterday");
		store.getState().backToToday();
		expect(store.getState().dayOffset).toBe(0);
	});
});
