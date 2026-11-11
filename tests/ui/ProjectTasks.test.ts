// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ProjectsCard, TaskItem } from "../../core/application/contracts";
import { ProjectTasks } from "../../obsidian/ui/projects/ProjectTasks";
import { onDay } from "../fakes/itemOnDay";

const item = (extra: Partial<TaskItem> = {}): TaskItem => onDay({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: "2026-11-12", slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "soon", isSubtask: false, ...extra }, "2026-11-07");

const card = (task: TaskItem, stage: ProjectsCard["stage"]): ProjectsCard => ({ id: "c1", item: task, stage, over: null, from: null, drop: { key: task.key, from: null }, menuFrom: "soon", canDrop: true });

function drawn(model: ProjectsCard): HTMLElement {
	const tasks = new ProjectTasks(document.body.appendChild(document.createElement("div")), {});
	tasks.render({ sections: [{ key: "own", group: null, title: null, header: false, opens: false, empty: false, plate: false, path: [], depth: 0, cards: [model], rows: [{ id: model.id, item: model.item, level: 0, card: model, drop: model.drop }], newTask: null }], emptyLabel: "No tasks", newTask: null }, false);
	return tasks.el.querySelector(".tc-card")!;
}

describe("a card of the Projects screen By project", () => {
	it("a dated card keeps the repeat mark beside its date", () => {
		const repeating = item({ repeat: { kind: "daily" } as unknown as TaskItem["repeat"] });
		const shown = drawn(card(repeating, { kind: "date", date: "2026-11-12", label: { text: "12 Nov" } as never }));
		expect(shown.querySelector(".tc-due-day")?.textContent).toBe("12");
		expect(shown.querySelector(".tc-due-repeat")).not.toBeNull();
	});

	it("a dated card that does not repeat has its date alone", () => {
		const shown = drawn(card(item(), { kind: "date", date: "2026-11-12", label: { text: "12 Nov" } as never }));
		expect(shown.querySelector(".tc-due-repeat")).toBeNull();
	});

	it("the stage's mark stands in the date's place", () => {
		const shown = drawn(card(item(), { kind: "soon" }));
		expect(shown.querySelector(".tc-stage-mark")?.getAttribute("aria-label")).toBe("Soon");
		expect(shown.querySelector(".tc-due")).toBeNull();
	});
});
