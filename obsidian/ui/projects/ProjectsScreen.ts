import { LIST_WIDTHS } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import { Divider } from "../Divider";
import { el, px } from "../dom";
import type { GestureArbiter } from "../gestures";
import { centeredListWidth, listWidthMax } from "../listWidth";
import { ProjectsSegment } from "./ProjectsSegment";
import { ProjectTasks } from "./ProjectTasks";
import { ProjectTree } from "./ProjectTree";
import type { ProjectsCard, ProjectsNodeId, ProjectsRow, ProjectsSource, ProjectsView } from "./projectsView";

export interface ProjectsScreenDeps {
	readonly source: ProjectsSource;
	readonly arbiter: GestureArbiter;
	/** The tree's width the divider was last let go at on this device; null for the design's. */
	treeWidth(): number | null;
	setTreeWidth(width: number): void;
	onSnap(): void;
	/** The chosen project's title tapped: its menu, Rename and Note. */
	onMenu?(title: HTMLElement, view: ProjectsView): void;
	onCard?(card: HTMLElement, model: ProjectsCard, signal: AbortSignal): void;
	onRow?(row: HTMLElement, model: ProjectsRow, signal: AbortSignal): void;
	onError(error: unknown): void;
}

/**
 * The Projects screen, the strip's place left of Inbox: «Projects» over the tree on the left, the divider with its handle
 * as between the day's list and the calendar, and on the right the chosen node's name over By project / By stage and its
 * tasks. On the desktop (boards DeskProj, DeskAll) the titles are larger and the segment stands in the title row.
 */
export class ProjectsScreen {
	readonly el: HTMLElement;
	private readonly title: HTMLElement;
	private readonly segment: ProjectsSegment;
	private readonly tree: ProjectTree;
	private readonly tasks: ProjectTasks;
	private view: ProjectsView | null = null;
	private reading = 0;

	constructor(
		root: HTMLElement,
		private readonly deps: ProjectsScreenDeps,
	) {
		this.el = el(root, "div", "tc-projects");
		el(this.el, "div", "tc-projects-tree-title", "Projects");
		this.title = el(this.el, "div", "tc-projects-title");
		this.title.addEventListener("click", () => {
			if (this.view?.menu) this.deps.onMenu?.(this.title, this.view);
		});
		this.segment = new ProjectsSegment(this.el, (mode) => void this.act(() => deps.source.setProjectsMode(mode)));
		const treeColumn = el(this.el, "div", "tc-projects-tree-column");
		this.tree = new ProjectTree(treeColumn, { onTap: (node) => void this.tap(node), onRow: deps.onRow });
		new Divider(el(this.el, "div"), {
			width: () => treeColumn.offsetWidth,
			onWidth: (width) => this.el.style.setProperty(PROPERTY.treeWidth, px(width)),
			onRelease: (width) => deps.setTreeWidth(width),
			min: LIST_WIDTHS.min,
			max: () => listWidthMax(this.el.clientWidth),
			center: () => centeredListWidth(this.el.clientWidth),
			onSnap: () => deps.onSnap(),
			arbiter: deps.arbiter,
		});
		this.tasks = new ProjectTasks(el(this.el, "div", "tc-projects-tasks-column"), { onCard: deps.onCard });
	}

	/** The tree's row of `node`, where a card held over the tree is let go. */
	rowOf(node: ProjectsNodeId): HTMLElement | null {
		return this.tree.rowOf(node);
	}

	showDropOn(node: ProjectsNodeId | null): void {
		this.tree.showDropOn(node);
	}

	/** Reads the screen from the core and draws it; a read overtaken by a later one is dropped. */
	async refresh(): Promise<void> {
		const reading = ++this.reading;
		const view = await this.deps.source.projectsScreen();
		if (reading === this.reading) this.render(view);
	}

	render(view: ProjectsView): void {
		const sameNode = this.view?.selected === view.selected;
		this.view = view;
		const width = this.deps.treeWidth();
		if (width === null) this.el.style.removeProperty(PROPERTY.treeWidth);
		else this.el.style.setProperty(PROPERTY.treeWidth, px(width));
		this.el.classList.toggle("is-missing", view.missing);
		this.title.textContent = view.title;
		this.title.classList.toggle("has-menu", view.menu !== null);
		this.segment.render(view);
		this.tree.render(view.rows);
		this.tasks.render(view, sameNode);
	}

	private async tap(node: ProjectsNodeId): Promise<void> {
		await this.act(() => this.deps.source.tapProjectNode(node));
	}

	private async act(change: () => Promise<void>): Promise<void> {
		try {
			await change();
			await this.refresh();
		} catch (error) {
			this.deps.onError(error);
		}
	}
}
