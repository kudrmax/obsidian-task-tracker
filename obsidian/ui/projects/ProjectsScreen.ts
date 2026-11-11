import { PROPERTY } from "../design";
import { Divider } from "../Divider";
import { el, px } from "../dom";
import { GroupNameField } from "../GroupNameField";
import type { GestureArbiter } from "../gestures";
import { centeredListWidth, listWidthMax } from "../listWidth";
import { ProjectsSegment } from "./ProjectsSegment";
import { PLATE } from "../TaskList";
import { ProjectTasks, type ProjectTasksDeps } from "./ProjectTasks";
import type { TasksShown, TreeShown } from "./ProjectDrops";
import { ProjectTree } from "./ProjectTree";
import { LIST_WIDTHS, type ProjectsNodeId, type ProjectsRow, type ProjectsView, type TaskService } from "../../../core/application/contracts";

const HIDDEN = "tc-hidden";

/** What the screen asks the core. */
export type ProjectsSource = Pick<TaskService, "projectsScreen" | "tapProjectNode" | "setProjectsMode">;

export interface ProjectsScreenDeps {
	readonly source: ProjectsSource;
	readonly arbiter: GestureArbiter;
	/** The tree's width the divider was last let go at on this device; null for the design's. */
	treeWidth(): number | null;
	setTreeWidth(width: number): void;
	onSnap(): void;
	/** The chosen project's title tapped: its menu, Rename and Note. */
	onMenu?(title: HTMLElement, view: ProjectsView): void;
	onCard?: ProjectTasksDeps["onCard"];
	onPlate?: ProjectTasksDeps["onPlate"];
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
		this.tasks = new ProjectTasks(el(this.el, "div", "tc-projects-tasks-column"), { onCard: deps.onCard, onPlate: deps.onPlate });
	}

	/** Rename: the name typed where the title stands, the caret at its end; Enter gives the name, anything else null. */
	editTitle(onDone: (name: string | null) => void): void {
		const name = this.title.textContent ?? "";
		this.title.classList.add("is-renaming");
		const slot = el(this.el, "div", "tc-projects-title-field");
		GroupNameField.open(slot, {
			value: name,
			onDone: (to) => {
				slot.remove();
				this.title.classList.remove("is-renaming");
				onDone(to);
			},
		});
	}

	/** The tree as its drop targets read it. */
	get treeShown(): TreeShown {
		const tree = this.tree;
		return { el: tree.el, rows: tree.rows, elementOf: (i) => tree.elementOf(i), showDropOn: (node) => tree.showDropOn(node) };
	}

	/** The tasks as drawn: the list a card is dropped in. */
	get tasksList(): ProjectTasks {
		return this.tasks;
	}

	/** The tasks as their drop target reads them. */
	get tasksShown(): TasksShown {
		return { el: this.tasks.el, parts: this.tasks.parts, endTask: this.tasks.endTask };
	}

	/** The view drawn last; null before the first read. */
	get shown(): ProjectsView | null {
		return this.view;
	}

	/** A new project's name typed at a gap of the tree, `depth` steps in; resolves with the name, or null for nothing typed. */
	askProjectName(gap: number, depth: number): Promise<string | null> {
		const before = this.tree.elementOf(gap);
		const slot = el(null, "div", "tc-tree-field");
		slot.style.setProperty(PROPERTY.level, String(depth));
		if (before) before.before(slot);
		else this.tree.el.appendChild(slot);
		return this.ask(slot, "Project name");
	}

	/**
	 * A new task's text typed after `after` among the tasks (first when null); a No tasks plate gives the field its place
	 * while it is open. Resolves with the text, or null for nothing typed.
	 */
	askTaskText(after: HTMLElement | null): Promise<string | null> {
		const slot = el(null, "div", "tc-projects-task-field");
		if (after?.isConnected) after.after(slot);
		else this.tasks.el.prepend(slot);
		const plate = after?.classList.contains(PLATE) ? after : null;
		plate?.classList.add(HIDDEN);
		return this.ask(slot, "New task").finally(() => plate?.classList.remove(HIDDEN));
	}

	private ask(slot: HTMLElement, placeholder: string): Promise<string | null> {
		return new Promise((resolve) => {
			const field = GroupNameField.open(slot, {
				value: "",
				placeholder,
				onDone: (text) => {
					slot.remove();
					resolve(text);
				},
			});
			field.scrollIntoView({ block: "nearest" });
		});
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

	/** The tree alone read again and drawn, the tasks left as they stand: a branch opened under a card still carried from them. */
	async refreshTree(): Promise<void> {
		const reading = ++this.reading;
		const view = await this.deps.source.projectsScreen();
		if (reading !== this.reading || !this.view) return;
		this.view = { ...this.view, rows: view.rows };
		this.tree.render(view.rows);
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
