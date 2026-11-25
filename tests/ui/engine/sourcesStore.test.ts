// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { takesKeys } from "../../../obsidian/ui/engine/keys";
import { createScreenStore } from "../../../obsidian/ui/engine/store";
import { standPort } from "./standPort";

const NOW = new Date(2026, 10, 18, 14, 20);

describe("the sources window in the store (F32, F276)", () => {
	it("opens only while the calendar shows, one layer at a time, and the screen's keys wait for it", async () => {
		const { port } = await standPort(NOW);
		const store = createScreenStore(port);
		store.getState().setStop("soon");
		store.getState().openSources();
		expect(store.getState().sources).toBe(false);
		store.getState().setStop("calendar");
		store.getState().openViewMenu();
		store.getState().openSources();
		expect([store.getState().sources, store.getState().viewMenu]).toEqual([true, false]);
		expect(takesKeys(store.getState())).toBe(false);
		store.getState().closeSources();
		expect([store.getState().sources, takesKeys(store.getState())]).toEqual([false, true]);
	});

	it("Refresh now closes the window and asks the port to refresh the sources", async () => {
		const { port } = await standPort(NOW);
		const refresh = vi.spyOn(port, "refreshSources");
		const store = createScreenStore(port);
		store.getState().setStop("calendar");
		store.getState().openSources();
		store.getState().refreshSources();
		expect([store.getState().sources, refresh.mock.calls.length]).toEqual([false, 1]);
	});
});
