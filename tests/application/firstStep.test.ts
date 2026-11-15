import { describe, expect, it } from "vitest";
import { StaleTaskError, type TaskItem } from "../../core/application/contracts";
import { taskMenu } from "../../core/application/menus";
import type { Clock } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/** First step (spec 2026-11-15): one command, a task's key and a text, writes the step first under the task and folds it. */

const T = "2026-10-30";
const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };
const file = (now: string) => `## Inbox\n\n## Now\n\n${now}\n## Soon\n\n## Backlog\n\n## Done\n`;

function setup(text: string) {
	const store = new InMemoryTaskFileStore(text);
	const history = new UndoHistory(store);
	return { store, history, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, history) };
}

async function named(svc: TaskServiceImpl, text: string): Promise<TaskItem> {
	const find = (items: readonly TaskItem[]): TaskItem | null => {
		for (const item of items) {
			if (item.text === text) return item;
			const inner = find(item.allSubtasks);
			if (inner) return inner;
		}
		return null;
	};
	return find((await svc.dayView(T)).list)!;
}

describe("firstStep writes the step and the fold", () => {
	it("gives a task without subtasks its first step and folds it", async () => {
		const { store, svc } = setup(file("- [ ] Taxes\n"));
		await svc.firstStep((await named(svc, "Taxes")).key, "Find the forms");
		expect(store.text).toBe(file("- [ ] Taxes 📁\n\t- [ ] Find the forms\n"));
		const taxes = await named(svc, "Taxes");
		expect(taxes.card).toMatchObject({ over: "Taxes", text: "Find the forms" });
	});

	it("puts the step before every subtask the task has, done ones too", async () => {
		const { store, svc } = setup(file("- [ ] Trip\n\t- [x] Book\n\t- [ ] Pack\n"));
		await svc.firstStep((await named(svc, "Trip")).key, "Pick a date");
		expect(store.text).toBe(file("- [ ] Trip 📁\n\t- [ ] Pick a date\n\t- [x] Book\n\t- [ ] Pack\n"));
		expect((await named(svc, "Trip")).card.text).toBe("Pick a date");
	});

	it("keeps the description above the subtasks", async () => {
		const { store, svc } = setup(file("- [ ] Trip\n\tA note\n\t- [ ] Pack\n"));
		await svc.firstStep((await named(svc, "Trip")).key, "Pick a date");
		expect(store.text).toBe(file("- [ ] Trip 📁\n\tA note\n\t- [ ] Pick a date\n\t- [ ] Pack\n"));
	});

	it("leaves a folded task folded, the new step shown", async () => {
		const { store, svc } = setup(file("- [ ] Trip 📁\n\t- [ ] Pack\n"));
		await svc.firstStep((await named(svc, "Trip")).key, "Pick a date");
		expect(store.text).toBe(file("- [ ] Trip 📁\n\t- [ ] Pick a date\n\t- [ ] Pack\n"));
		expect((await named(svc, "Trip")).card).toMatchObject({ over: "Trip", text: "Pick a date" });
	});

	it("works on a subtask at any depth: the step goes under it, and it is the one folded", async () => {
		const { store, svc } = setup(file("- [ ] Move\n\t- [ ] Kitchen\n\t\t- [ ] Boxes\n"));
		await svc.firstStep((await named(svc, "Kitchen")).key, "Buy tape");
		expect(store.text).toBe(file("- [ ] Move\n\t- [ ] Kitchen 📁\n\t\t- [ ] Buy tape\n\t\t- [ ] Boxes\n"));
	});

	it("writes the text as the quick entry does: one line, trimmed, no list marker", async () => {
		const { store, svc } = setup(file("- [ ] Taxes\n"));
		await svc.firstStep((await named(svc, "Taxes")).key, "  - [ ] Call\nthe bank  ");
		expect(store.text).toBe(file("- [ ] Taxes 📁\n\t- [ ] Call the bank\n"));
	});

	it("writes nothing for an empty or blank text", async () => {
		const { store, svc } = setup(file("- [ ] Taxes\n"));
		const key = (await named(svc, "Taxes")).key;
		await svc.firstStep(key, "");
		await svc.firstStep(key, "   ");
		await svc.firstStep(key, "p1 ");
		expect(store.writes).toBe(0);
		expect(store.text).toBe(file("- [ ] Taxes\n"));
	});

	it("is one write and one undo step: undo takes the step and the fold back", async () => {
		const before = file("- [ ] Trip\n\t- [ ] Pack\n");
		const { store, history, svc } = setup(before);
		await svc.firstStep((await named(svc, "Trip")).key, "Pick a date");
		expect(store.writes).toBe(1);
		await history.undo();
		expect(store.text).toBe(before);
		expect(history.canUndo()).toBe(false);
	});

	it("rejects a stale key and leaves the file alone", async () => {
		const { store, svc } = setup(file("- [ ] Taxes\n"));
		const key = (await named(svc, "Taxes")).key;
		store.text = file("- [ ] Taxes, renamed\n");
		await expect(svc.firstStep(key, "Step")).rejects.toBeInstanceOf(StaleTaskError);
		expect(store.text).toBe(file("- [ ] Taxes, renamed\n"));
	});
});

describe("the First step row", () => {
	const edits = (item: TaskItem, from: Parameters<typeof taskMenu>[5]) => taskMenu([item], T, [], [], null, from).edits;

	it("stands right after Add subtask on an open task and subtask, in the lists and on the timeline", async () => {
		const { svc } = setup(file("- [ ] Move\n\t- [ ] Kitchen\n\t\t- [ ] Boxes\n"));
		for (const name of ["Move", "Kitchen", "Boxes"]) {
			const item = await named(svc, name);
			expect(item.can.firstStep).toBe(true);
			for (const from of ["day", "soon", "inbox", "backlog", "timeline"] as const) {
				const row = edits(item, { kind: "task", from });
				expect(row.slice(row.indexOf("subtask"))).toEqual(["subtask", "firstStep"]);
			}
		}
	});

	it("is for the whole task on a folded card, not for the step it shows", async () => {
		const { svc } = setup(file("- [ ] Trip 📁\n\t- [ ] Pack\n"));
		const trip = await named(svc, "Trip");
		expect(trip.card.step?.text).toBe("Pack");
		expect(edits(trip, { kind: "task", from: "day" })).toContain("firstStep");
		expect(trip.can.firstStep).toBe(true);
	});

	it("is not offered on a closed task, in a stack, on the full screen or to picked tasks", async () => {
		const { svc } = setup(file("- [ ] Trip\n\t- [x] Book\n\t- [-] Fly\n"));
		const trip = await named(svc, "Trip");
		for (const closed of trip.allSubtasks) {
			expect(closed.can.firstStep).toBe(false);
			expect(edits(closed, { kind: "task", from: "full" })).not.toContain("firstStep");
			expect(edits(closed, { kind: "task", from: "day" })).not.toContain("firstStep");
		}
		expect(edits(trip, { kind: "task", from: "stack" })).not.toContain("firstStep");
		expect(edits(trip, { kind: "task", from: "full" })).not.toContain("firstStep");
		expect(edits(trip, { kind: "task", from: "done" })).not.toContain("firstStep");
		expect(edits(trip, { kind: "bulk" })).not.toContain("firstStep");
	});
});

describe("the card First step's field is drawn on", () => {
	it("is a folded card: over it the task's own title, plain; its step line the field", async () => {
		const { svc } = setup(file("- [ ] Read [[Deep Work]]\n- [ ] Trip 📁\n\t- [ ] Pack\n\t\t- [ ] Socks\n"));
		const read = await named(svc, "Read [[Deep Work]]");
		expect(read.firstStepCard).toEqual({ text: "", title: "", over: "Read Deep Work", step: null });
		expect((await named(svc, "Trip")).firstStepCard.over).toBe("Trip");
		expect((await named(svc, "Pack")).firstStepCard.over).toBe("Pack");
	});
});
