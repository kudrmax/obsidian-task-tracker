import { describe, expect, it } from "vitest";
import { refOf } from "../../core/application/agent/agentWire";
import type { DropColumn, ScreenView, TaskItem, TaskPlace } from "../../core/application/contracts";
import { memoryProjectsScreen } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { settingsFrom } from "../../core/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";
import { clockAt, makeVault, NOW, run, SETTINGS, T, TASKS } from "./vault";

/**
 * The program draws nothing of its own: each list it answers is the column read the Obsidian screen and the iPhone app
 * draw (`columnView`), and each task's place is `placeOf`, which By project's stage mark says too.
 */

function screens() {
	const tasks = new TaskServiceImpl(new InMemoryTaskFileStore(TASKS), new FakeSettingsStore(settingsFrom(JSON.parse(SETTINGS))), clockAt(NOW), null, undefined, memoryProjectsScreen({ doneOpen: true }));
	return tasks;
}

type Wired = { readonly ref: string; readonly place?: string; readonly date?: string };
type WiredSection = { readonly name: string | null; readonly tasks: readonly Wired[] };

const refsOf = (groups: readonly { readonly name: string | null; readonly items: readonly TaskItem[] }[]) => groups.map((g) => [g.name, g.items.map((i) => refOf(i.key))]);
const wiredRefs = (sections: readonly WiredSection[]) => sections.map((s) => [s.name, s.tasks.map((t) => t.ref)]);
const placeOfWire = (t: Wired): TaskPlace => (t.date === undefined ? { kind: t.place as "inbox" } : { kind: t.place as "today", date: t.date });

describe("the program's lists are the screens' column read", () => {
	it("Soon, Inbox, Backlog and each day's list: the same sections, the same tasks, in the same order", async () => {
		const service = screens();
		const vault = makeVault();
		const today = await service.screen(T);
		for (const list of ["soon", "inbox", "backlog"] as const) {
			const answer = (await run(vault, [list])).answer;
			expect({ list, sections: wiredRefs(answer.sections) }).toEqual({ list, sections: refsOf(service.columnView(today, list).groups) });
		}
		for (const date of [T, "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]) {
			const screen: ScreenView = await service.screen(date);
			const day = (await run(vault, ["day", date])).answer;
			expect({ date, list: wiredRefs(day.list.sections) }).toEqual({ date, list: refsOf(service.columnView(screen, "day" as DropColumn).groups) });
			expect({ date, timeline: day.timeline.map((t: Wired) => t.ref) }).toEqual({ date, timeline: screen.day.slotted.map((i) => refOf(i.key)) });
		}
	});

	it("under a project filter too", async () => {
		const service = screens();
		const vault = makeVault();
		const screen = await service.screen(T, "project:Отчёты");
		const soon = (await run(vault, ["soon", "--project", "Отчёты"])).answer;
		expect(wiredRefs(soon.sections)).toEqual(refsOf(service.columnView(screen, "soon").groups));
		const today = (await run(vault, ["today", "--project", "Отчёты"])).answer;
		expect(wiredRefs(today.list.sections)).toEqual(refsOf(service.columnView(screen, "day").groups));
	});

	it("every task's place is placeOf's, which By project's stage mark agrees with", async () => {
		const service = screens();
		const vault = makeVault();
		const all = (await run(vault, ["all"])).answer.tasks as Wired[];
		const open = await service.openTasks();
		expect(all.map((t) => [t.ref, placeOfWire(t)])).toEqual(open.map((t) => [refOf(t.item.key), t.place]));
		for (const { item, place } of open) expect(await service.placeOf(item)).toEqual(place);
		const project = (await run(vault, ["project", "Отчёты", "--done"])).answer;
		const view = await service.projectsScreen("project:Отчёты");
		const history = await service.projectHistory("project:Отчёты");
		const cards = [...view.sections, ...history].flatMap((s) => s.cards);
		const wired = project.parts.flatMap((p: { tasks: Wired[] }) => p.tasks);
		expect(wired.map((t: Wired) => t.ref)).toEqual(cards.map((c) => refOf(c.item.key)));
		for (const [i, card] of cards.entries()) {
			const place = await service.placeOf(card.item);
			expect(placeOfWire(wired[i])).toEqual(place);
			const stage = card.stage!;
			expect(stage.kind === "date" ? { kind: "day", date: stage.date } : stage).toEqual(place.kind === "today" ? { kind: "today" } : place);
		}
	});
});
