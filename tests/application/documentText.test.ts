import { describe, expect, it } from "vitest";
import { applyOperation, boundaryOf, markersOf, readDocument } from "../../src/application/documentText";
import { TaskServiceImpl } from "../../src/application/TaskServiceImpl";
import { setStatus } from "../../src/domain/operations";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const NOW = new Date(2026, 9, 30, 14, 20);
const TEXT = "## Now\n\n- [ ] A ⏰ 2026-10-29 10:00\n- [ ] B 🚨 2026-10-30 10:00\n\n## Soon\n\n- [ ] C\n";

describe("documentText", () => {
	it("applyOperation writes what the service writes", async () => {
		const store = new InMemoryTaskFileStore(TEXT);
		const svc = new TaskServiceImpl(store, new FakeSettingsStore(), { now: () => NOW });
		const view = await svc.dayView("2026-10-30");
		await svc.setStatus(view.slotted[0].key, "done");
		const phone = applyOperation(TEXT, DEFAULT_SETTINGS, NOW, (doc) => setStatus(doc, doc.tasks("now").find((e) => e.task.text === "B")!, "done"));
		expect(phone).toBe(store.text);
	});

	it("readDocument of an empty text has every section", () => {
		const doc = readDocument("", DEFAULT_SETTINGS, "2026-10-30");
		expect(doc.serialize()).toContain("## Done");
	});

	it("markersOf and boundaryOf follow the settings", () => {
		expect(markersOf({ ...DEFAULT_SETTINGS, alarmSlotMarker: "!" })).toMatchObject({ slot: "⏰", alarmSlot: "!", silentSlot: "🔕" });
		expect(boundaryOf({ ...DEFAULT_SETTINGS, dayStartHour: 4 }).dayOf(new Date(2026, 9, 30, 3, 0))).toBe("2026-10-29");
	});
});
