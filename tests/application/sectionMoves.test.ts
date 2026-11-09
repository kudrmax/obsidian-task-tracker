import { describe, expect, it } from "vitest";
import { groupPlaceOf, type GroupName, type GroupPlace, listView, type ScreenView } from "../../core/application/contracts";
import { callDoor, type DoorContext } from "../../core/application/PhoneCalls";
import type { ListView } from "../../core/application/sections";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { UndoHistory } from "../../core/application/UndoHistory";
import { settingsFrom } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/**
 * A section's header carried to a gap among the day list's headers: the gap's place (`rules.groupPlaceOf`), written
 * (`tasks.moveGroup`), and the screen read next draws the list's sections with that section in the gap and every other
 * where it stood, No section too, each keeping its id. The phone through the door, the plugin through its service.
 */

const NOW = new Date(2026, 10, 4, 9, 30);
const T = "2026-11-04";
const SETTINGS = { groups: { ungrouped: "No section" } };

const file = (now: readonly string[], soon: readonly string[] = []) => ["## Inbox", "", "## Now", "", ...now, "", "## Soon", "", ...soon, "", "## Backlog", "", "## Done", ""].join("\n");

const SHAPES: Readonly<Record<string, string>> = {
	"tasks without a section, then sections": file(["- [ ] Loose one", "- [ ] Loose two", "", "### Evening", "- [ ] Read", "", "### Work", "- [ ] Mail", "", "### Errands", "- [ ] Shop"]),
	"no blank lines, a subtask and a note": file(["- [ ] Loose", "\t- [ ] Sub", "\tA note", "### Evening", "- [ ] Read", "### Work", "- [ ] Mail", "### Errands", "- [ ] Shop"]),
	"empty sections": file(["- [ ] Parent", "\t- [ ] Child", "### Evening", "- [ ] Cook", "### Work", "### Errands"]),
	"No section under its own heading among the sections": file(["### Evening", "- [ ] Read", "### No section", "- [ ] Loose", "### Errands", "- [ ] Shop"]),
	"No section only on the timeline": file(["- [ ] Slotted ⏰ 2026-11-04 10:00-11:00", "### Evening", "- [ ] Read", "### Errands", "- [ ] Shop"]),
	"Soon's tasks due today": file(["- [ ] Loose", "### Evening", "- [ ] Read", "### Errands", "- [ ] Shop"], ["- [ ] Due 📅 2026-11-04", "### Errands", "- [ ] Also due 📅 2026-11-04", "### Elsewhere", "- [ ] Due too 📅 2026-11-04"]),
	"a section named twice": file(["- [ ] Loose", "### Evening", "- [ ] Read", "### Errands", "- [ ] Shop", "### Evening", "- [ ] Late"]),
};

interface Drawn {
	readonly name: GroupName;
	readonly id: string;
}

/** The phone: each call through the door, its text, ids and history handed in again as the app does. */
class Phone {
	private context: DoorContext;

	constructor(text: string) {
		this.context = { tasks: text, settings: JSON.stringify(SETTINGS), nowMs: NOW.getTime() };
	}

	get text(): string {
		return this.context.tasks!;
	}

	call(method: string, args: readonly unknown[]): unknown {
		const answer = callDoor(method, args, this.context);
		if (!answer.ok) throw new Error(`${method}: ${answer.error.message}`);
		this.context = { ...this.context, tasks: answer.tasks ?? this.context.tasks, ids: answer.ids ?? this.context.ids, history: answer.history ?? this.context.history };
		return answer.result;
	}

	sections(): Drawn[] {
		const screen = this.call("tasks.screen", [T]) as ScreenView;
		const view = this.call("rules.listView", [screen.day.list, true, screen.sections.now]) as ListView;
		return view.groups.map((g) => ({ name: g.name, id: g.id }));
	}
}

/** The plugin: its service over the same text. */
async function pluginSections(text: string, move: { group: GroupName; place: GroupPlace } | null): Promise<GroupName[]> {
	const store = new InMemoryTaskFileStore(text);
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(settingsFrom(SETTINGS as never)), { now: () => NOW }, new UndoHistory(store));
	await svc.screen(T);
	if (move) await svc.moveGroup("now", move.group, move.place);
	const screen = await svc.screen(T);
	return listView(screen.day.list, true, screen.sections.now).groups.map((g) => g.name);
}

/** The sections as drawn with `lifted` let go at gap `slot`: before the one standing there, or last. */
function carried<T>(drawn: readonly T[], lifted: number, slot: number): T[] {
	const order = [...drawn];
	const [moved] = order.splice(lifted, 1);
	order.splice(slot > lifted ? slot - 1 : slot, 0, moved);
	return order;
}

describe("a section moved among the day list's headers", () => {
	it("Errands carried to just before Evening stands under the tasks without a section and over Evening", () => {
		const phone = new Phone(SHAPES["tasks without a section, then sections"]);
		const drawn = phone.sections();
		expect(drawn.map((d) => d.name)).toEqual([null, "Evening", "Work", "Errands"]);
		const place = groupPlaceOf(drawn.map((d) => d.name), 3, 1);
		expect(place).toEqual({ before: "Evening" });
		phone.call("tasks.moveGroup", ["now", "Errands", place]);
		expect(phone.text).toMatch(/- \[ \] Loose two\n\n### Errands\n- \[ \] Shop\n\n### Evening/);
		expect(phone.sections()).toEqual(carried(drawn, 3, 1));
	});

	for (const [shape, text] of Object.entries(SHAPES)) {
		it(`every header to every gap, ${shape}: the next read draws it there, the rest as they stood`, async () => {
			const drawn = new Phone(text).sections();
			const names = drawn.map((d) => d.name);
			expect(names.filter((n) => n !== null).length).toBeGreaterThan(1);
			for (let lifted = 0; lifted < drawn.length; lifted++) {
				for (let slot = 0; slot <= drawn.length; slot++) {
					const place = groupPlaceOf(names, lifted, slot);
					if (place === null) continue;
					const phone = new Phone(text);
					phone.sections();
					phone.call("tasks.moveGroup", ["now", names[lifted], place]);
					const where = `${String(names[lifted])} to ${JSON.stringify(place)}`;
					expect(phone.sections(), where).toEqual(carried(drawn, lifted, slot));
					expect(await pluginSections(text, { group: names[lifted], place }), where).toEqual(carried(names, lifted, slot));
				}
			}
		});
	}
});
