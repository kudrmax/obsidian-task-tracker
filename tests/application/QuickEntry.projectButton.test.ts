import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { type EntryLook, QuickEntry } from "../../core/application/QuickEntry";
import type { Header, ListCard } from "../../core/application/nesting";
import type { DropColumn, ProjectNote, TaskItem } from "../../core/application/contracts";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

/** Projects polish, point 1 and 2: the quick entry's Project button, and Place keeping the field's project. */
const T = "2026-11-10";
const clock: Clock = { now: () => new Date(2026, 10, 10, 14, 20) };
const NOTES: readonly ProjectNote[] = [
	{ name: "Дружба", path: "Дружба.md", link: "Дружба" },
	{ name: "Английский", path: "Английский.md", link: "Английский" },
];
const key = (section: "backlog" | "soon", raw: string, index: number) => ({ section, index, path: [], raw });

interface Setup {
	readonly backlog?: { readonly cards: ListCard[]; readonly sections: Header[] };
	readonly soon?: { readonly cards: ListCard[]; readonly sections: Header[] };
	readonly project?: string;
}

const GROUPED_BACKLOG = {
	cards: [
		{ key: key("backlog", "- [ ] A 🗂️ [[Дружба]]", 0), level: 0, group: null, project: "Дружба" },
		{ key: key("backlog", "- [ ] B", 1), level: 0, group: null, project: null },
	] as ListCard[],
	sections: [
		{ group: null, project: "Английский" },
		{ group: null, project: "Дружба" },
		{ group: null, project: null },
	] as Header[],
};

const PLAIN_SOON = { cards: [{ key: key("soon", "- [ ] S", 0), level: 0, group: null }] as ListCard[], sections: [] as Header[] };

const GROUPED_SOON = {
	cards: [{ key: key("soon", "- [ ] S", 0), level: 0, group: null, project: null }] as ListCard[],
	sections: [
		{ group: null, project: "Английский" },
		{ group: null, project: "Дружба" },
		{ group: null, project: null },
	] as Header[],
};

function setup({ backlog = GROUPED_BACKLOG, soon = PLAIN_SOON, project }: Setup = {}) {
	const store = new InMemoryTaskFileStore("## Soon\n- [ ] S\n## Backlog\n- [ ] A 🗂️ [[Дружба]]\n- [ ] B\n");
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, { list: () => NOTES, onChange: () => () => undefined });
	const lists: Partial<Record<DropColumn, { readonly cards: ListCard[]; readonly sections: Header[] }>> = { backlog, soon };
	const look: EntryLook = {
		cards: (column) => lists[column]?.cards ?? [],
		sections: (column) => lists[column]?.sections ?? [],
		sectioned: (column) => column === "backlog" || column === "soon",
		day: () => T,
		today: () => T,
		shown: () => ["soon", "backlog"],
		...(project !== undefined && { project: () => project }),
	};
	return { svc, store, entry: new QuickEntry(svc, look) };
}

const IN_DRUZHBA = { kind: "list" as const, column: "backlog" as const, place: { kind: "gap" as const, index: 1, level: 0, group: null, project: "Дружба" } };

describe("the quick entry's Project button", () => {
	it("a field opened in a project's group starts with that project, lit, its page the task menu's", () => {
		const { entry } = setup();
		entry.open(IN_DRUZHBA);
		const project = entry.state!.project!;
		expect(project.lit).toBe(true);
		expect(project.page.options.map((o) => [o.project.name, o.checked])).toEqual([
			["Английский", false],
			["Дружба", true],
		]);
		expect(project.page).toMatchObject({ none: false, noneLabel: "No project", newLabel: "New project…", value: "Дружба", disabled: false });
	});

	it("a field in a list without a project starts with none: not lit, No project ticked", () => {
		const { entry } = setup();
		entry.openAtEnd("soon");
		expect(entry.state!.project).toMatchObject({ lit: false, page: { none: true, current: null, value: "No project" } });
	});

	it("in a project's own view the field starts with that project, the slot's too", () => {
		const { entry } = setup({ project: "Дружба" });
		entry.openSlot({ date: T, start: 600, end: null });
		expect(entry.state!.project).toMatchObject({ lit: true, page: { current: { name: "Дружба" } } });
	});

	it("a project chosen is written with the task; the next field keeps it", () => {
		const { entry } = setup();
		entry.openAtEnd("soon");
		entry.setProject("Английский");
		entry.type("Words");
		entry.enter();
		expect(entry.state!.project!.lit).toBe(true);
		const call = entry.call(entry.session.jobs[0].id);
		expect(call).toEqual({ method: "createInPlace", args: ["Words", null, { kind: "list", list: "soon", group: null, before: null }, null, [], "Английский"] });
	});

	it("No project chosen in a project's group writes the task without one, at the end of No project's part", () => {
		const { entry } = setup();
		entry.open(IN_DRUZHBA);
		entry.setProject(null);
		expect(entry.state!.spot).toEqual({ kind: "list", column: "backlog", place: { kind: "gap", index: 2, level: 0, group: null, project: null } });
		entry.type("Loose");
		entry.enter();
		const call = entry.call(entry.session.jobs[0].id);
		expect(call?.args[2]).toMatchObject({ kind: "list", list: "backlog", project: null });
		expect(call?.args[5]).toBeNull();
	});

	it("another project chosen in a grouped list moves the field to the end of that project's part", () => {
		const { entry } = setup();
		entry.open(IN_DRUZHBA);
		entry.setProject("Английский");
		expect(entry.state!.spot).toEqual({ kind: "list", column: "backlog", place: { kind: "gap", index: 2, level: 0, group: null, project: "Английский" } });
	});

	it("a subtask's field has no Project button, nor a section's name; a slot's has one", () => {
		const { entry } = setup();
		entry.open({ kind: "stack", parent: GROUPED_BACKLOG.cards[0].key });
		expect(entry.state!.project).toBeNull();
		entry.openAtEnd("soon");
		entry.toggleSection();
		expect(entry.state!.project).toBeNull();
		entry.openSlot({ date: T, start: 600, end: null });
		expect(entry.state!.project).not.toBeNull();
	});

	it("the task written lands in the file with its project", async () => {
		const { svc, store, entry } = setup();
		entry.openAtEnd("soon");
		entry.setProject("Английский");
		entry.type("Words");
		entry.enter();
		const call = entry.call(entry.session.jobs[0].id)!;
		await (svc.createInPlace as (...a: unknown[]) => Promise<unknown>)(...call.args);
		expect(store.text).toContain("- [ ] S\n- [ ] Words 🗂️ [[Английский]]\n");
	});

	it("a rename starts with the task's project, and a new one chosen is written by the edit", async () => {
		const { svc, store, entry } = setup();
		const screen = await svc.screen(T);
		const a = screen.backlog.find((i) => i.text === "A") as TaskItem;
		entry.open(entry.renameSpot(a, false)!, a);
		expect(entry.state!.project!.page.current?.name).toBe("Дружба");
		entry.setProject("Английский");
		entry.enter();
		const call = entry.call(entry.session.jobs[0].id)!;
		expect(call.method).toBe("edit");
		await (svc.edit as (...a: unknown[]) => Promise<unknown>)(...call.args);
		expect(store.text).toContain("- [ ] A 🗂️ [[Английский]]\n");
	});
});

describe("Place keeps the field's project", () => {
	it("moved by Place to an ungrouped list, the field keeps its project and writes it", () => {
		const { entry } = setup();
		entry.open(IN_DRUZHBA);
		entry.choosePlace({ kind: "soon" });
		expect(entry.state!.project!.page.current?.name).toBe("Дружба");
		entry.type("Meet");
		entry.enter();
		const call = entry.call(entry.session.jobs[0].id);
		expect(call?.args[5]).toBe("Дружба");
		expect(call?.args[2]).toMatchObject({ kind: "list", list: "soon" });
	});

	it("moved by Place to a grouped list, the field goes to the end of its project's part", () => {
		const { entry } = setup({ soon: GROUPED_SOON });
		entry.open(IN_DRUZHBA);
		entry.choosePlace({ kind: "soon" });
		expect(entry.state!.spot).toEqual({ kind: "list", column: "soon", place: { kind: "gap", index: 1, level: 0, group: null, project: "Дружба" } });
	});

	it("moved to a grouped list that draws no part of its project, the field stands at the list's end, the project kept", () => {
		const { entry } = setup({ soon: { cards: GROUPED_SOON.cards, sections: [{ group: null, project: null }] } });
		entry.open(IN_DRUZHBA);
		entry.choosePlace({ kind: "soon" });
		expect(entry.state!.spot).toEqual({ kind: "list", column: "soon", place: { kind: "gap", index: 1, level: 0, group: null, project: null } });
		expect(entry.state!.project!.lit).toBe(true);
	});
});

describe("the field follows its project once the list draws its part", () => {
	/** Grouped Soon: Окружение's empty part, then No project with «Ремонт»; Дача has no part until its first task is drawn. */
	function grouped() {
		const svc = new TaskServiceImpl(new InMemoryTaskFileStore("## Soon\n- [ ] Loose\n### Ремонт\n- [ ] Fix\n"), new FakeSettingsStore(), clock, null, { list: () => NOTES, onChange: () => () => undefined });
		const soonKey = (raw: string, index: number) => key("soon", raw, index);
		let cards: ListCard[] = [
			{ key: soonKey("- [ ] Loose", 0), level: 0, group: null, project: null },
			{ key: soonKey("- [ ] Fix", 1), level: 0, group: "Ремонт", project: null },
		];
		let sections: Header[] = [
			{ group: null, project: "Окружение" },
			{ group: null, project: null },
			{ group: "Ремонт", project: null },
		];
		const look: EntryLook = {
			cards: (column) => (column === "soon" ? cards : []),
			sections: (column) => (column === "soon" ? sections : []),
			sectioned: (column) => column === "soon",
			day: () => T,
			today: () => T,
			shown: () => ["soon"],
		};
		const entry = new QuickEntry(svc, look);
		/** Дача's first task drawn: its part comes first, by name. */
		const drawDacha = () => {
			const made = { key: soonKey("- [ ] Покрасить забор 🗂️ [[Дача]]", 0), level: 0, group: null, project: "Дача" } as ListCard;
			cards = [made, ...cards.map((c, i) => ({ ...c, key: soonKey(c.key.raw, i + 1) }))];
			sections = [{ group: null, project: "Дача" }, ...sections];
			return made;
		};
		return { entry, drawDacha, coming: (column: DropColumn) => look.cards(column) };
	}

	it("a new project's first task drawn: the next field stands at the end of that project's part, not under a heading", () => {
		const { entry, drawDacha, coming } = grouped();
		entry.openIn("soon", null, "Окружение");
		entry.setProject("Дача");
		entry.type("Покрасить забор");
		entry.enter();
		const [job] = entry.session.jobs;
		entry.call(job.id);
		const made = drawDacha();
		entry.shown(job.id, made.key, coming);
		entry.done(job.id);
		const shown = entry.listEntry("soon");
		expect(shown?.place).toEqual({ kind: "gap", index: 1, level: 0, group: null, project: "Дача" });
		expect(entry.state!.spot).toEqual({ kind: "list", column: "soon", place: { kind: "gap", index: 1, level: 0, group: null, project: "Дача" } });
		entry.type("Купить краску");
		entry.enter();
		expect(entry.call(entry.session.jobs[0].id)?.args[2]).toMatchObject({ kind: "list", list: "soon", group: null, before: null, project: "Дача" });
	});

	it("the project's empty group appearing in a drawing takes the field there", () => {
		const { entry } = grouped();
		entry.openIn("soon", null, "Окружение");
		entry.setProject("Дача");
		const drawn = { cards: [] as ListCard[], sections: [{ group: null, project: "Дача" }, { group: null, project: "Окружение" }] as Header[] };
		expect(entry.listEntry("soon", drawn)?.place).toEqual({ kind: "gap", index: 0, level: 0, group: null, project: "Дача" });
	});

	it("while a line still waits to be written, the field stays with it", () => {
		const { entry, drawDacha } = grouped();
		entry.openIn("soon", null, "Окружение");
		entry.setProject("Дача");
		entry.type("Покрасить забор");
		entry.enter();
		drawDacha();
		expect(entry.listEntry("soon")?.place.project).toBe("Окружение");
	});
});
