import { describe, expect, it } from "vitest";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * A past day's calendar (F190, Decision 145): the past is not kept (`docs/plugin/file.md`, rule 1), so what lands there
 * stands first in Now with today's due date and no time, a new task and a dropped one alike.
 */

const PAST = "2026-10-28";
const clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const FILE = "## Inbox\n\n## Now\n\n- [ ] A\n\n## Soon\n\n- [ ] S\n\n## Backlog\n\n## Done\n";

function setup() {
	const store = new InMemoryTaskFileStore(FILE);
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock) };
}

describe("a past day's calendar", () => {
	it("a new task typed there is today's, without a time", async () => {
		const { store, svc } = setup();
		await svc.createAtTime(PAST, 600, "N");
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] N 📅 2026-10-30\n- [ ] A\n\n## Soon\n\n- [ ] S\n\n## Backlog\n\n## Done\n");
	});

	it("a task dropped there is today's, without a time", async () => {
		const { store, svc } = setup();
		const s = (await svc.soonWithoutDateView()).find((item) => item.key.raw === "- [ ] S")!;
		await svc.setSlot(s.key, { date: PAST, start: 600, end: null });
		expect(store.text).toBe("## Inbox\n\n## Now\n\n- [ ] S 📅 2026-10-30\n- [ ] A\n\n## Soon\n\n## Backlog\n\n## Done\n");
	});
});
