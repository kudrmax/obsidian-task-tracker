import { el } from "../dom";
import { PROPERTY } from "../design";
import { icon, type IconName } from "../kit/icons";
import { KeyedRows } from "../motion/KeyedRows";
import { ScrollHold } from "../motion/ScrollHold";
import { ScrollEdges } from "../ScrollEdges";
import { fillCard, renderDue } from "../TaskCard";
import { branch, type ListEntry, PLATE } from "../TaskList";
import type { DropList } from "../drag/ListDrop";
import { branchOf, cardDue, type GroupName, type Header, type ListCard, type ProjectsCard, type ProjectsDropLanding, type ProjectsListRow, type ProjectsNewTask, type ProjectsStage, type ProjectsView, type TaskItem } from "../../../core/application/contracts";

/** A part of the tasks as drawn: where a new task let go in it is written, and the last row it holds. */
export interface DrawnPart {
	readonly newTask: ProjectsNewTask | null;
	readonly last: HTMLElement;
}

export interface ProjectTasksDeps {
	/**
	 * Each row drawn, a task's card or a subtask's: its taps, its menu, its drag. `owner` is the card the row belongs to (its
	 * own for a task); `subtree` the rows of its subtasks at every depth, which go wherever it goes.
	 */
	onCard?(card: HTMLElement, row: ProjectsListRow, owner: ProjectsCard, subtree: readonly HTMLElement[], signal: AbortSignal): void;
	/** An empty part's No tasks plate: a tap opens the field of a new task in its place, as a list's plate does. */
	onPlate?(plate: HTMLElement, newTask: ProjectsNewTask, signal: AbortSignal): void;
}

/** The stage's mark on the right of a card in By project: the symbols of the wheel and of Backlog's title. */
const STAGES: Readonly<Record<Exclude<ProjectsStage["kind"], "date">, { readonly icon: IconName; readonly name: string }>> = {
	today: { icon: "now", name: "Today" },
	soon: { icon: "soon", name: "Soon" },
	inbox: { icon: "inbox", name: "Inbox" },
	backlog: { icon: "backlog", name: "Backlog" },
	done: { icon: "done", name: "Done" },
};

/** A card a drag carries, waiting where it stood (`DragController`). */
const LIFTED = "is-lifted";
const HIDDEN = "tc-hidden";

function plateKey(name: GroupName): string {
	return JSON.stringify(name);
}

/**
 * The chosen node's tasks, drawn as a list column draws its rows (boards Main, ByStage, AllStage): By project in parts by
 * subproject, the node's own tasks first with no header, each card with its stage's mark or its date on the right; By
 * stage in parts Inbox, Backlog, Soon and Today, each card with its subproject small over its title. Each task's open
 * subtasks stand under it a level in, with the branches the lists draw; an empty part shows the No tasks plate. It is a
 * list cards are dropped in (`DropList`), as a list column is.
 */
export class ProjectTasks implements DropList {
	readonly el: HTMLElement;
	private readonly edges: ScrollEdges;
	private readonly keyed: KeyedRows;
	private readonly hold: ScrollHold;
	private drawnParts: DrawnPart[] = [];
	private drawnEnd: ProjectsNewTask | null = null;
	private entries: ListEntry[] = [];
	private nodes: HTMLElement[] = [];
	private heads = new Map<HTMLElement, Header>();
	private plates = new Map<string, HTMLElement>();
	private rowsByCard = new Map<HTMLElement, ProjectsListRow>();
	private cardsByRow = new Map<string, HTMLElement>();
	private opening = new Map<HTMLElement, boolean>();
	/** The rows of carried cards another node's drawing does not show, kept out of sight (see `render`). */
	private away = new Map<string, HTMLElement>();

	constructor(
		parent: HTMLElement,
		private readonly deps: ProjectTasksDeps,
	) {
		this.el = el(parent, "div", "tc-list tc-projects-list");
		this.keyed = new KeyedRows(this.el);
		this.hold = new ScrollHold(this.el);
		this.edges = new ScrollEdges(this.el);
	}

	/** The parts drawn, top to bottom. */
	get parts(): readonly DrawnPart[] {
		return this.drawnParts;
	}

	/** Where a new task let go past every part is written; null where nothing is (Done). */
	get endTask(): ProjectsNewTask | null {
		return this.drawnEnd;
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}

	/** Headers, plates and cards in the order they stand; the same array until the tasks are drawn again. */
	get elements(): readonly HTMLElement[] {
		return this.nodes;
	}

	listCard(entry: ListEntry): ListCard {
		return { key: entry.item.key, id: entry.item.id, level: entry.level, group: entry.group };
	}

	headerAt(node: HTMLElement): Header | undefined {
		return this.heads.get(node);
	}

	plateOf(name: GroupName): HTMLElement | null {
		return this.plates.get(plateKey(name)) ?? null;
	}

	/** The part's header opens its part as the core says (`ProjectsSection.opens`). */
	headerOpens(node: HTMLElement): boolean {
		return this.opening.get(node) ?? false;
	}

	/** The row a drawn card stands for. */
	rowOf(card: HTMLElement): ProjectsListRow | undefined {
		return this.rowsByCard.get(card);
	}

	/** The card a drop lands on, as drawn now: a card of its part, or the subtask's row; null when it is not on the screen. */
	cardOf(landing: ProjectsDropLanding): HTMLElement | null {
		if (landing.kind === "card") return this.cardsByRow.get(landing.card) ?? null;
		if (landing.kind === "away") return null;
		const row = [...this.rowsByCard.entries()].find(([, r]) => r.level > 0 && r.item.id === landing.id);
		return row?.[0] ?? null;
	}

	/**
	 * `moving`: the same node drawn again, its rows sliding to their new places; another node is drawn at once, from the top.
	 * A card still carried (a held card opened another node) stays in the page out of sight while the drawing does not show
	 * it: the finger's pointer stays with it, and the node it was lifted on, drawn again, has it back as its waiting place.
	 */
	render(view: Pick<ProjectsView, "sections" | "emptyLabel" | "newTask">, moving: boolean): void {
		if (moving) this.hold.keep();
		else this.el.scrollTop = 0;
		const carried = [...this.cardsByRow, ...this.away].filter(([, node]) => node.classList.contains(LIFTED));
		const drawing = this.keyed.begin(moving);
		this.drawnParts = [];
		this.drawnEnd = view.newTask;
		this.entries = [];
		this.nodes = [];
		this.heads = new Map();
		this.plates = new Map();
		this.rowsByCard = new Map();
		this.cardsByRow = new Map();
		this.opening = new Map();
		if (view.sections.length === 0) this.nodes.push(this.plate(drawing.take("plate:none", () => el(null, "div", PLATE)).node, view.emptyLabel, null));
		const rows: { node: HTMLElement; level: number }[] = [];
		const signals = new Map<HTMLElement, AbortSignal>();
		const owners = new Map<HTMLElement, ProjectsCard>();
		for (const section of view.sections) {
			let last: HTMLElement | null = null;
			if (section.header) {
				const head = drawing.take(`head:${section.key}`, () => el(null, "div", "tc-group-head")).node;
				head.replaceChildren();
				el(head, "span", "tc-group-name", section.title ?? "");
				this.heads.set(head, section.group);
				this.opening.set(head, section.opens);
				this.nodes.push(head);
				last = head;
			}
			if (section.plate) {
				const taken = drawing.take(`plate:${section.key}`, () => el(null, "div", PLATE));
				const plate = this.plate(taken.node, view.emptyLabel, section.group);
				if (section.newTask) this.deps.onPlate?.(plate, section.newTask, taken.signal);
				this.nodes.push(plate);
				last = plate;
			}
			const start = this.entries.length;
			let owner: ProjectsCard | null = null;
			for (const row of section.rows) {
				owner = row.card ?? owner;
				if (!owner) continue;
				const { node, signal } = drawing.take(`row:${row.id}`, () => el(null, "div", "tc-card"));
				node.classList.remove(HIDDEN);
				node.replaceChildren();
				if (row.card) {
					fillCard(node, row.item, { day: null, over: row.card.over, corner: row.card.stage === null });
					if (row.card.stage) renderStage(node, row.item, row.card.stage);
				} else fillCard(node, row.item, { day: null });
				node.style.setProperty(PROPERTY.level, String(row.level));
				this.entries.push({ card: node, item: row.item, level: row.level, group: section.group });
				this.nodes.push(node);
				this.rowsByCard.set(node, row);
				this.cardsByRow.set(row.id, node);
				signals.set(node, signal);
				owners.set(node, owner);
				rows.push({ node, level: row.level });
				last = node;
			}
			this.subtrees(start, signals, owners);
			if (last) this.drawnParts.push({ newTask: section.newTask, last });
		}
		rows.forEach((row, i) => {
			const lines = branchOf(rows.map((r) => r.level), i);
			if (lines) branch(row.node, lines.through, lines.last);
		});
		this.away = new Map();
		for (const [id] of carried) {
			if (this.cardsByRow.has(id)) continue;
			const { node } = drawing.take(`row:${id}`, () => el(null, "div", "tc-card"));
			node.classList.add(HIDDEN);
			this.away.set(id, node);
		}
		drawing.finish();
		this.edges.update();
	}

	/** Each card drawn from `from` on is handed out with the cards of its subtasks: those right after it, deeper than it. */
	private subtrees(from: number, signals: Map<HTMLElement, AbortSignal>, owners: Map<HTMLElement, ProjectsCard>): void {
		for (let i = from; i < this.entries.length; i++) {
			const { card, level } = this.entries[i];
			let end = i + 1;
			while (end < this.entries.length && this.entries[end].level > level) end++;
			this.deps.onCard?.(card, this.rowsByCard.get(card)!, owners.get(card)!, this.entries.slice(i + 1, end).map((e) => e.card), signals.get(card)!);
		}
	}

	private plate(plate: HTMLElement, label: string, group: GroupName): HTMLElement {
		plate.textContent = label;
		this.plates.set(plateKey(group), plate);
		return plate;
	}
}

/** The stage's mark, or for a dated card its date with the repeat's mark beside it, as any card's corner shows them. */
function renderStage(card: HTMLElement, item: TaskItem, stage: ProjectsStage): void {
	if (stage.kind === "date") return renderDue(card, stage.date, cardDue(item, null)?.repeats ?? false);
	const mark = el(card, "span", "tc-stage-mark");
	const shown = STAGES[stage.kind];
	mark.setAttribute("aria-label", shown.name);
	mark.title = shown.name;
	mark.appendChild(icon(shown.icon));
}
