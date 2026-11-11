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

import type { ListPlace, ProjectsListRow, ProjectsSection } from "../../core/application/contracts";
import { ProjectsListDrop } from "../../obsidian/ui/projects/ProjectDrops";
import { shownCardSize } from "../../obsidian/ui/cardSize";

const task = (text: string, index: number, extra: Partial<TaskItem> = {}): TaskItem => item({ key: { section: "soon", index, path: [], raw: `- [ ] ${text}` }, text, id: `t${index}`, ...extra } as Partial<TaskItem>);

function cardOf(t: TaskItem, part: string): ProjectsCard {
	return { id: `${part}/${t.id}`, item: t, stage: { kind: "soon" }, over: null, from: part, drop: { key: t.key, from: part }, menuFrom: "soon", canDrop: true };
}

function rowsOf(part: string, cards: readonly ProjectsCard[], subtasks: Readonly<Record<string, readonly TaskItem[]>> = {}): ProjectsListRow[] {
	return cards.flatMap((card) => [
		{ id: card.id, item: card.item, level: 0, card, drop: card.drop },
		...(subtasks[card.item.id] ?? []).map((sub) => ({ id: `${part}/${sub.id}`, item: sub, level: 1, card: null, drop: { key: sub.key, from: part } })),
	]);
}

function section(key: string, title: string | null, cards: readonly ProjectsCard[], extra: Partial<ProjectsSection> = {}): ProjectsSection {
	return { key, group: title === null ? null : key, title, header: title !== null, opens: title !== null, empty: cards.length === 0, plate: false, path: [], depth: 0, cards, rows: rowsOf(key, cards), newTask: { place: { kind: "list", list: "soon", group: null, before: null }, project: key }, ...extra };
}

function list(sections: readonly ProjectsSection[], onCard?: (card: HTMLElement, owner: ProjectsCard, subtree: readonly HTMLElement[]) => void): ProjectTasks {
	const tasks = new ProjectTasks(document.body.appendChild(document.createElement("div")), { onCard: (card, _row, owner, subtree) => onCard?.(card, owner, subtree) });
	tasks.render({ sections, emptyLabel: "No tasks", newTask: null }, false);
	return tasks;
}

describe("the Projects tasks as a list column (spec «Projects order» 1–3)", () => {
	const a = task("A", 0);
	const sub = task("A1", 1);
	const b = task("B", 2);

	it("draws a task's open subtasks under it a level in, with the branch the lists draw", () => {
		const own = cardOf(a, "p");
		const tasks = list([{ ...section("p", "P", [own, cardOf(b, "p")]), rows: rowsOf("p", [own, cardOf(b, "p")], { t0: [sub] }) }]);
		const cards = Array.from(tasks.el.querySelectorAll<HTMLElement>(".tc-card"));
		expect(cards.map((c) => c.style.getPropertyValue("--tc-level"))).toEqual(["0", "1", "0"]);
		expect(cards[1].querySelector(".tc-branch.is-last")).not.toBeNull();
		expect(tasks.cards.map((e) => [e.item.id, e.level, e.group])).toEqual([["t0", 0, "p"], ["t1", 1, "p"], ["t2", 0, "p"]]);
	});

	it("hands each row out with the card it belongs to and its subtasks' rows, which go wherever it goes", () => {
		const own = cardOf(a, "p");
		const seen: [string, string, number][] = [];
		list([{ ...section("p", "P", [own]), rows: rowsOf("p", [own], { t0: [sub] }) }], (card, owner, subtree) => seen.push([card.textContent ?? "", owner.id, subtree.length]));
		expect(seen.map(([, owner, n]) => [owner, n])).toEqual([["p/t0", 1], ["p/t0", 0]]);
	});

	it("a header only where the part says, the No tasks plate only where it says", () => {
		const tasks = list([section("own", null, [], { plate: false }), section("s", "Soon", [], { plate: true }), section("t", "Today", [cardOf(a, "t")])]);
		expect(Array.from(tasks.el.children).map((n) => n.textContent)).toEqual(["Soon", "No tasks", "Today", "A"]);
		expect(tasks.plateOf("s")).not.toBeNull();
		expect(tasks.plateOf("own")).toBeNull();
		expect(tasks.headerAt(tasks.el.children[2] as HTMLElement)).toBe("t");
	});

	it("an empty part's plate opens the part's new task", () => {
		const opened: string[] = [];
		const tasks = new ProjectTasks(document.body.appendChild(document.createElement("div")), { onPlate: (plate, newTask) => plate.addEventListener("click", () => opened.push(newTask.project ?? "")) });
		tasks.render({ sections: [section("s", "Soon", [], { plate: true })], emptyLabel: "No tasks", newTask: null }, false);
		tasks.plateOf("s")!.click();
		expect(opened).toEqual(["s"]);
	});

	it("finds the card a drop lands on: a part's card by its id, a subtask by its task", () => {
		const own = cardOf(a, "p");
		const tasks = list([{ ...section("p", "P", [own]), rows: rowsOf("p", [own], { t0: [sub] }) }]);
		expect(tasks.cardOf({ kind: "card", id: "t0", item: a, card: "p/t0", section: "p", index: 0 })?.textContent).toContain("A");
		expect(tasks.cardOf({ kind: "subtask", id: "t1", item: sub, parent: "t0", index: 0 })).toBe(tasks.cards[1].card);
		expect(tasks.cardOf({ kind: "away", id: "t9", item: null })).toBeNull();
	});

	describe("as a place to drop", () => {
		/** Rows stand 40 px apart from the list's top at 100. */
		function placed(sections: readonly ProjectsSection[], reorders = true, takes: (place: ListPlace) => boolean = () => true, node: () => string | null = () => "project:P") {
			document.body.innerHTML = "";
			const tasks = list(sections);
			tasks.elements.forEach((node, i) =>
				Object.defineProperties(node, {
					offsetTop: { configurable: true, value: i * 40 },
					offsetHeight: { configurable: true, value: 35 },
					offsetLeft: { configurable: true, value: 0 },
					offsetWidth: { configurable: true, value: 300 },
				}),
			);
			const area = tasks.el.parentElement!;
			area.getBoundingClientRect = () => new DOMRect(0, 100, 300, 600);
			tasks.el.getBoundingClientRect = () => new DOMRect(0, 100, 300, 600);
			return new ProjectsListDrop(tasks, area, { reorders: () => reorders, takesAt: (place) => takes(place), node });
		}
		const carried = (t: TaskItem) => ({ item: t, from: "soon" as const, grabPx: shownCardSize().height / 2 });
		/** A carried card hangs by its middle: the finger at `y` is where its middle is. */
		const middleAt = (y: number) => y;

		it("lets go of nothing at a place read on another node than the one drawn now: the card flies back", () => {
			let node = "project:P";
			const drop = placed([section("s", "Soon", [cardOf(a, "s")]), section("t", "Today", [cardOf(b, "t")])], true, () => true, () => node);
			const y = middleAt(100 + 3 * 40 + 5);
			drop.preview(10, y, carried(a));
			node = "project:Q";
			expect(drop.drop(10, y, carried(a))).toBeNull();
		});

		it("takes a card between two cards of another part as a place in that part, for dropInProjects", () => {
			const drop = placed([section("s", "Soon", [cardOf(a, "s")]), section("t", "Today", [cardOf(b, "t")])]);
			const y = middleAt(100 + 3 * 40 + 5);
			drop.preview(10, y, carried(a));
			expect(drop.drop(10, y, carried(a))).toEqual({ kind: "projectsPlace", place: { kind: "task", group: "t", before: b.key } });
		});

		it("passes each header's opens as the core gives it: the gap under the own part's last card is the own part's", () => {
			const drop = placed([section("own", null, [cardOf(a, "own")]), section("s", "Sub", [cardOf(b, "s")], { opens: false })]);
			const under = 100 + 40 - 2;
			drop.preview(10, under, carried(b));
			expect(drop.drop(10, under, carried(b))).toEqual({ kind: "projectsPlace", place: { kind: "task", group: null, before: null } });
		});

		it("an empty own part drawn as nothing still takes a card let go over the first header", () => {
			const drop = placed([section("own", null, []), section("s", "Sub", [cardOf(a, "s"), cardOf(b, "s")], { opens: false })]);
			const over = 100 + 5;
			drop.preview(10, over, carried(b));
			expect(drop.drop(10, over, carried(b))).toEqual({ kind: "projectsPlace", place: { kind: "task", group: null, before: null } });
		});

		it("the line into an empty own part stands under the list's top, not over it", () => {
			const drop = placed([section("own", null, []), section("s", "Sub", [cardOf(a, "s"), cardOf(b, "s")], { opens: false })]);
			drop.preview(10, 100 + 5, carried(b));
			const line = document.querySelector<HTMLElement>(".tc-list-drop")!;
			expect(Number(/translate3d\([^,]+,\s*(-?[\d.]+)px/.exec(line.style.transform)![1])).toBeGreaterThanOrEqual(0);
		});

		it("a header that opens its part takes the list's top for it", () => {
			const drop = placed([section("s", "Soon", [cardOf(a, "s"), cardOf(b, "s")])]);
			const over = 100 + 5;
			drop.preview(10, over, carried(b));
			expect(drop.drop(10, over, carried(b))).toEqual({ kind: "projectsPlace", place: { kind: "task", group: "s", before: a.key } });
		});

		it("a place the core refuses shows no line and lets go of nothing, as a list that does not take the card", () => {
			const asked: ListPlace[] = [];
			const drop = placed([section("s", "Soon", [cardOf(a, "s")]), section("t", "Today", [cardOf(b, "t")])], true, (place) => {
				asked.push(place);
				return false;
			});
			const y = 100 + 3 * 40 + 5;
			drop.preview(10, y, carried(a));
			expect(document.querySelector(".tc-list-drop")).toBeNull();
			expect(drop.drop(10, y, carried(a))).toBeNull();
			expect(asked[0]).toEqual({ kind: "task", group: "t", before: b.key });
		});

		it("takes no plus and nothing while the node keeps its order", () => {
			const sections = [section("s", "Soon", [cardOf(a, "s")])];
			expect(placed(sections).hitTest(10, 150, { from: "new", item: null, grabPx: 0 })).toBe(false);
			expect(placed(sections, false).hitTest(10, 150, carried(a))).toBe(false);
			expect(placed(sections).hitTest(10, 150, carried(a))).toBe(true);
		});
	});
});

describe("a card still carried while a held card opens another node", () => {
	const a = task("A", 0);
	const b = task("B", 2);
	const c = task("C", 3);
	const node = (part: string, cards: readonly ProjectsCard[]) => ({ sections: [section(part, null, cards)], emptyLabel: "No tasks", newTask: null });

	it("stays in the page out of sight, in no list a drop reads, and comes back as itself when its node is drawn again", () => {
		const tasks = list([section("p1", null, [cardOf(a, "p1"), cardOf(b, "p1")])]);
		const lifted = tasks.el.querySelector<HTMLElement>(".tc-card")!;
		lifted.classList.add("is-lifted", "is-waiting");
		tasks.render(node("p2", [cardOf(c, "p2")]), false);
		expect(lifted.isConnected).toBe(true);
		expect(lifted.classList.contains("tc-hidden")).toBe(true);
		expect(tasks.cards.map((e) => e.item.id)).toEqual(["t3"]);
		expect(tasks.elements).not.toContain(lifted);
		tasks.render(node("p3", []), false);
		expect(lifted.isConnected).toBe(true);
		tasks.render(node("p1", [cardOf(a, "p1"), cardOf(b, "p1")]), false);
		expect(tasks.el.querySelector(".tc-card")).toBe(lifted);
		expect(lifted.classList.contains("tc-hidden")).toBe(false);
		expect(lifted.classList.contains("is-waiting")).toBe(true);
	});

	it("goes once the drag is over and its node is not drawn", () => {
		const tasks = list([section("p1", null, [cardOf(a, "p1")])]);
		const lifted = tasks.el.querySelector<HTMLElement>(".tc-card")!;
		lifted.classList.add("is-lifted");
		tasks.render(node("p2", [cardOf(c, "p2")]), false);
		lifted.classList.remove("is-lifted");
		tasks.render(node("p2", [cardOf(c, "p2")]), true);
		expect(lifted.isConnected).toBe(false);
	});
});
