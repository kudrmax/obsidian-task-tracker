import { describe, expect, it } from "vitest";
import type { DropColumn, ScreenView, TaskItem } from "../../core/application/contracts";
import type { ListCard } from "../../core/application/nesting";
import { memoryGrouping, type Clock } from "../../core/application/ports";
import { QuickEntrySession, type WriteLine } from "../../core/application/QuickEntrySession";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/** Rename and Add subtask on a folded result's step, which has no card of its own: the quick entry over the real service. */
const T = "2026-11-11";
const clock: Clock = { now: () => new Date(2026, 10, 11, 9, 0) };

const FILE = [
	"## Now",
	"- [ ] Before 📅 2026-11-11",
	"- [ ] 🎯 Компания 📁 📅 2026-11-11",
	"\t- [ ] Write to Marko",
	"\t- [ ] Book a table",
	"- [ ] 🎯 Trip 📁 ⏰ 2026-11-11 15:00-16:00",
	"\t- [ ] Pack",
	"## Soon",
	"## Done",
	"",
].join("\n");

class SerialWrites implements WriteLine {
	private tail: Promise<void> = Promise.resolve();
	push(job: () => Promise<void>): void {
		this.tail = this.tail.then(job);
	}
	async idle(): Promise<void> {
		let tail: Promise<void>;
		do {
			tail = this.tail;
			await tail;
		} while (tail !== this.tail);
	}
}

/** The cards a list draws: each task, and the subtasks of one not folded, at their depth. */
function cardsOf(items: readonly TaskItem[], level = 0): ListCard[] {
	return items.flatMap((item) => [{ key: item.key, id: item.id, level, group: item.group }, ...(item.collapsed ? [] : cardsOf(item.subtasks, level + 1))]);
}

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, undefined, memoryGrouping());
	let screen: ScreenView;
	const lists = (): Partial<Record<DropColumn, ListCard[]>> => ({ day: cardsOf(screen.day.list) });
	const entry = new QuickEntrySession(
		svc,
		{
			cards: (column) => lists()[column] ?? [],
			sections: () => [],
			sectioned: () => false,
			day: () => T,
			today: () => T,
			shown: () => ["day"],
			fresh: async (beforeShow) => {
				screen = await svc.screen(T);
				beforeShow?.((column) => lists()[column] ?? []);
			},
			onChange: () => undefined,
		},
		new SerialWrites(),
	);
	return {
		store,
		svc,
		entry,
		read: async () => (screen = await svc.screen(T)),
	};
}

const named = (items: readonly TaskItem[], title: string): TaskItem => {
	const flat = (list: readonly TaskItem[]): TaskItem[] => list.flatMap((i) => [i, ...flat(i.allSubtasks)]);
	return flat(items).find((i) => i.title === title)!;
};

describe("Rename of a folded result's step", () => {
	it("opens the field in the result card's place, with the step's title; the result's card hides; Enter writes the step", async () => {
		const { entry, read, store } = setup();
		const s = await read();
		const result = named(s.day.list, "Компания");
		const step = result.card.step!;
		expect(step.drawnOn).toMatchObject({ key: { raw: result.key.raw } });
		const spot = entry.renameSpot(step, false);
		expect(spot).toEqual({ kind: "list", column: "day", place: { kind: "gap", index: 1, level: 0, group: null } });
		entry.open(spot!, step);
		expect(entry.state!.text).toBe("Write to Marko");
		expect(entry.state!.renaming).toMatchObject({ id: result.id, key: { raw: result.key.raw }, text: "Write to Marko" });
		expect(entry.renaming).toMatchObject({ raw: result.key.raw });
		entry.type("Write to Marko today");
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(store.text).toContain("\t- [ ] Write to Marko today\n");
	});

	it("from the timeline's block of a result only on a time: the field over the block, which hides", async () => {
		const { entry, read, store } = setup();
		const s = await read();
		const trip = s.day.slotted.find((i) => i.title === "Trip")!;
		const step = trip.block.step!;
		const spot = entry.renameSpot(step, false);
		expect(spot).toEqual({ kind: "slot", slot: trip.slot });
		entry.open(spot!, step);
		expect(entry.state!.renaming).toMatchObject({ id: trip.id, key: { raw: trip.key.raw } });
		entry.type("Pack the bag");
		entry.enter();
		await entry.idle();
		expect(store.text).toContain("\t- [ ] Pack the bag\n");
	});

	it("a task with its own card is renamed there as before", async () => {
		const { entry, read } = setup();
		const s = await read();
		const before = named(s.day.list, "Before");
		entry.open(entry.renameSpot(before, false)!, before);
		expect(entry.state!.renaming).toMatchObject({ id: before.id, key: before.key });
	});
});

describe("Add subtask on a folded result's step", () => {
	it("unfolds the result, then stands last among the step's subtasks in the list; Enter writes the step's subtask", async () => {
		const { entry, read, store } = setup();
		const s = await read();
		const step = named(s.day.list, "Компания").card.step!;
		const spot = entry.subtaskSpot(step.key);
		expect(spot).toMatchObject({ kind: "list", column: "day", unfold: step.key });
		entry.open(spot);
		await entry.idle();
		expect(store.text).toContain("- [ ] 🎯 Компания 📅 2026-11-11\n");
		const now = await read();
		expect(named(now.day.list, "Компания").collapsed).toBe(false);
		expect(entry.state!.spot).toEqual({ kind: "list", column: "day", place: { kind: "gap", index: 3, level: 2, group: null } });
		entry.type("Find his mail");
		entry.enter();
		await entry.idle();
		expect(store.text).toContain("\t- [ ] Write to Marko\n\t\t- [ ] Find his mail\n\t- [ ] Book a table\n");
	});

	it("a task with its own card gets its field as before, no unfolding", async () => {
		const { entry, read } = setup();
		const s = await read();
		expect(entry.subtaskSpot(named(s.day.list, "Before").key)).not.toHaveProperty("unfold");
	});
});
