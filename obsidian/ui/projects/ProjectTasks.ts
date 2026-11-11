import { clear, el } from "../dom";
import { icon, type IconName } from "../kit/icons";
import { ScrollEdges } from "../ScrollEdges";
import { fillCard, renderDue } from "../TaskCard";
import { cardDue, type ProjectsCard, type ProjectsNewTask, type ProjectsStage, type ProjectsView, type TaskItem } from "../../../core/application/contracts";

/** A part of the tasks as drawn: where a new task let go in it is written, and the last row it holds. */
export interface DrawnPart {
	readonly newTask: ProjectsNewTask | null;
	readonly last: HTMLElement;
}

export interface ProjectTasksDeps {
	/** Each card drawn: its taps, its menu and its drag onto the tree. */
	onCard?(card: HTMLElement, model: ProjectsCard, signal: AbortSignal): void;
}

/** The stage's mark on the right of a card in By project: the symbols of the wheel and of Backlog's title. */
const STAGES: Readonly<Record<Exclude<ProjectsStage["kind"], "date">, { readonly icon: IconName; readonly name: string }>> = {
	today: { icon: "now", name: "Today" },
	soon: { icon: "soon", name: "Soon" },
	inbox: { icon: "inbox", name: "Inbox" },
	backlog: { icon: "backlog", name: "Backlog" },
	done: { icon: "done", name: "Done" },
};

/**
 * The chosen node's tasks, as plain cards of a list (boards Main, ByStage, AllStage): By project in parts by subproject,
 * the node's own tasks first with no header, each card with its stage's mark or its date on the right; By stage in parts
 * Today, Soon, Inbox and Backlog, each card with its subproject small over its title.
 */
export class ProjectTasks {
	readonly el: HTMLElement;
	private readonly edges: ScrollEdges;
	private drawn: AbortController | null = null;
	private drawnParts: DrawnPart[] = [];
	private drawnEnd: ProjectsNewTask | null = null;

	constructor(
		parent: HTMLElement,
		private readonly deps: ProjectTasksDeps,
	) {
		this.el = el(parent, "div", "tc-list tc-projects-list");
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

	render(view: Pick<ProjectsView, "sections" | "emptyLabel" | "newTask">, sameNode: boolean): void {
		this.drawn?.abort();
		const drawn = new AbortController();
		this.drawn = drawn;
		const scroll = sameNode ? this.el.scrollTop : 0;
		clear(this.el);
		this.drawnParts = [];
		this.drawnEnd = view.newTask;
		if (view.sections.length === 0) el(this.el, "div", "tc-group-empty tc-projects-empty", view.emptyLabel);
		for (const section of view.sections) {
			let last: HTMLElement | null = null;
			if (section.title !== null) {
				last = el(this.el, "div", "tc-group-head");
				el(last, "span", "tc-group-name", section.title);
			}
			for (const model of section.cards) last = this.card(model, drawn.signal);
			if (last) this.drawnParts.push({ newTask: section.newTask, last });
		}
		this.el.scrollTop = scroll;
		this.edges.update();
	}

	private card(model: ProjectsCard, signal: AbortSignal): HTMLElement {
		const card = el(this.el, "div", "tc-card");
		fillCard(card, model.item, { day: null, over: model.over, corner: model.stage === null });
		if (model.stage) renderStage(card, model.item, model.stage);
		this.deps.onCard?.(card, model, signal);
		return card;
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
