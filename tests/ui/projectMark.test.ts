// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { TaskItem } from "../../core/application/contracts";
import { onProjectMark, renderTaskCard, showMeta } from "../../obsidian/ui/TaskCard";
import { onDay } from "../fakes/itemOnDay";

const ENV = { name: "Окружение", path: ["Окружение"], note: "Окружение.md", canOpenNote: true, mark: true };
const item = (extra: Partial<TaskItem> = {}): TaskItem => onDay({ key: { section: "soon", index: 0, path: [], raw: "- [ ] A" }, text: "A", status: "todo", dueDate: "2026-11-12", slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "soon", isSubtask: false, ...extra }, "2026-11-07");
const parts = (card: HTMLElement) => [...card.children].map((c) => c.classList[0]);

describe("the project mark on a card", () => {
	it("stands left of the date, its tooltip the project's name", () => {
		const card = renderTaskCard(null, item({ project: ENV }), { day: null });
		expect(parts(card)).toEqual(["tc-card-title", "tc-project-mark", "tc-due"]);
		expect(card.querySelector<HTMLElement>(".tc-project-mark")?.title).toBe("Окружение");
	});

	it("stands left of the subtask counter, which keeps its place when it changes", () => {
		const task = item({ project: ENV, dueDate: null, progress: { done: 1, total: 2 } });
		const card = renderTaskCard(null, task, { day: null });
		expect(parts(card)).toEqual(["tc-card-title", "tc-project-mark", "tc-meta"]);
		showMeta(card, { ...task, progress: { done: 2, total: 2 } });
		expect(parts(card)).toEqual(["tc-card-title", "tc-project-mark", "tc-meta"]);
	});

	it("is not drawn without a project, nor where the screen shows no mark", () => {
		expect(renderTaskCard(null, item(), { day: null }).querySelector(".tc-project-mark")).toBeNull();
		expect(renderTaskCard(null, item({ project: { ...ENV, mark: false } }), { day: null }).querySelector(".tc-project-mark")).toBeNull();
	});

	it("takes a tap on itself, not on the rest of the card", () => {
		const card = renderTaskCard(null, item({ project: ENV }), { day: null });
		expect(onProjectMark(card.querySelector(".tc-project-mark svg"))).toBe(true);
		expect(onProjectMark(card.querySelector(".tc-card-title"))).toBe(false);
	});
});
