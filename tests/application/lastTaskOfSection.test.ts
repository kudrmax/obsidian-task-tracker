import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../core/application/contracts";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * Max's rule of 05.11 (empty sections spec §1, Decision 145): a section goes when an action takes its last task away
 * (a drop on the calendar, another list, Done, Delete), and every other line of the file stays as it was; a section
 * made empty stays.
 */

const T = "2026-10-30";
const LATER = "2026-11-03";
const clock = { now: () => new Date(2026, 9, 30, 14, 20) };

const file = (now: readonly string[], soon: readonly string[], done: readonly string[] = []) =>
	["## Inbox", "", "## Now", "", ...now, "", "## Soon", "", ...soon, "", "## Backlog", "", "## Done", "", ...done].join("\n") + "\n";

const FILE = file(["- [ ] A", "", "### Evening", "- [ ] B", "", "### Made empty"], ["### Evening", "- [ ] S 📅 2026-11-03"]);

function setup() {
	const store = new InMemoryTaskFileStore(FILE);
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock) };
}

async function takeB(action: (svc: TaskServiceImpl, b: TaskKey) => Promise<void>): Promise<string> {
	const { store, svc } = setup();
	const b = (await svc.dayView(T)).list.find((item) => item.key.raw === "- [ ] B")!;
	await action(svc, b.key);
	return store.text ?? "";
}

describe("the last task taken out of a section", () => {
	it("dropped on today's calendar: Evening goes, the task stays in Now with its time", async () => {
		expect(await takeB((svc, b) => svc.setSlot(b, { date: T, start: 600, end: null }))).toBe(
			file(["- [ ] A", "- [ ] B 📌 2026-10-30 10:00", "", "### Made empty"], ["### Evening", "- [ ] S 📅 2026-11-03"]),
		);
	});

	it("dropped on a later day's calendar: Evening goes, the task goes to Soon with its time", async () => {
		expect(await takeB((svc, b) => svc.setSlot(b, { date: LATER, start: 600, end: null }))).toBe(
			file(["- [ ] A", "", "### Made empty"], ["- [ ] B 📌 2026-11-03 10:00", "### Evening", "- [ ] S 📅 2026-11-03"]),
		);
	});

	it("moved to another list: Evening goes", async () => {
		expect(await takeB((svc, b) => svc.moveToEnd(b, "backlog"))).toBe(
			file(["- [ ] A", "", "### Made empty"], ["### Evening", "- [ ] S 📅 2026-11-03"]).replace("## Backlog\n", "## Backlog\n\n- [ ] B\n"),
		);
	});

	it("done: Evening goes, the task goes to Done", async () => {
		expect(await takeB((svc, b) => svc.toggleDone(b))).toBe(file(["- [ ] A", "", "### Made empty"], ["### Evening", "- [ ] S 📅 2026-11-03"], ["- [x] B", ""]));
	});

	it("deleted: Evening goes", async () => {
		expect(await takeB((svc, b) => svc.remove(b))).toBe(file(["- [ ] A", "", "### Made empty"], ["### Evening", "- [ ] S 📅 2026-11-03"]));
	});

	it("a section made empty stays through every write", async () => {
		const { store, svc } = setup();
		const a = (await svc.dayView(T)).list.find((item) => item.key.raw === "- [ ] A")!;
		await svc.setSlot(a.key, { date: T, start: 600, end: null });
		expect(store.text).toContain("### Made empty\n");
	});
});
