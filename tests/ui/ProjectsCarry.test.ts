// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ProjectsCard, ProjectsDrop, ProjectsNodeId, TaskItem } from "../../core/application/contracts";
import { ProjectTasks } from "../../obsidian/ui/projects/ProjectTasks";
import { ProjectsCarry } from "../../obsidian/ui/projects/ProjectsCarry";
import type { TaskDragPayload } from "../../obsidian/ui/drag/DropTarget";
import { onDay } from "../fakes/itemOnDay";
import { projectsView } from "../fakes/projectsView";

const task = (text: string, index: number): TaskItem =>
	onDay({ key: { section: "soon", index, path: [], raw: `- [ ] ${text}` }, id: `t${index}`, text, status: "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: true, priority: null, group: null, subtasks: [], progress: null, parentText: null, description: null, list: "soon", isSubtask: false } as Partial<TaskItem> as TaskItem, "2026-11-07");

const dropOf = (t: TaskItem, part: string): ProjectsDrop => ({ key: t.key, from: part, lifted: { id: t.id, list: "soon", origin: "soon" } });
const cardOf = (t: TaskItem, part: string): ProjectsCard => ({ id: `${part}/${t.id}`, item: t, stage: { kind: "soon" }, from: part, drop: dropOf(t, part), menuFrom: "soon", canDrop: true });

function drawNode(tasks: ProjectTasks, part: string, items: readonly TaskItem[]): void {
	const cards = items.map((t) => cardOf(t, part));
	const rows = cards.map((card) => ({ id: card.id, item: card.item, level: 0, card, drop: card.drop }));
	tasks.render(projectsView([{ key: part, group: null, title: null, header: false, opens: false, takes: true, empty: cards.length === 0, plate: false, path: [], depth: 0, cards, rows, newTask: null }]), false);
}

describe("the cards a drag carries from the Projects screen", () => {
	const a = task("A", 0);
	const b = task("B", 1);
	const c = task("C", 2);

	function lifted(picked: readonly TaskItem[] = []) {
		const tasks = new ProjectTasks(document.body.appendChild(document.createElement("div")), {});
		let selected: ProjectsNodeId = "project:P1";
		drawNode(tasks, "P1", [a, b]);
		const cardOfTask = (t: TaskItem) => tasks.cards.find((e) => e.item.id === t.id)!.card;
		const along = picked.map((t) => ({ card: cardOfTask(t) }));
		const carry = new ProjectsCarry({ rowOf: (card) => tasks.rowOf(card), selected: () => selected, carried: () => along });
		const drag: TaskDragPayload = { item: a, from: "soon", grabPx: 18 };
		carry.lift(drag, cardOfTask(a));
		const open = (node: ProjectsNodeId, items: readonly TaskItem[]) => {
			selected = node;
			drawNode(tasks, node, items);
		};
		return { carry, drag, open };
	}

	it("are read at the lift and stay as read once a held card opens another node, whose cards are others", () => {
		const { carry, drag, open } = lifted();
		open("project:P2", [c]);
		expect(carry.dropsOf(drag)).toEqual([dropOf(a, "P1")]);
		expect(carry.liftedOn(drag)).toBe("project:P1");
	});

	it("carry the picked cards along, the one lifted first, each as its own row hands it", () => {
		const { carry, drag, open } = lifted([b]);
		open("project:P2", [c]);
		open("project:P3", []);
		expect(carry.dropsOf(drag)).toEqual([dropOf(a, "P1"), dropOf(b, "P1")]);
	});

	it("are none for a card of no Projects list", () => {
		const carry = new ProjectsCarry({ rowOf: () => undefined, selected: () => "all", carried: () => [] });
		const drag: TaskDragPayload = { item: a, from: "soon", grabPx: 18 };
		carry.lift(drag, document.createElement("div"));
		expect(carry.dropsOf(drag)).toEqual([]);
		expect(carry.liftedOn(drag)).toBeNull();
	});
});
