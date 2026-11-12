import type { ViewLayout } from "../../../core/application/contracts";
import type { ProjectsListDrop } from "../projects/ProjectDrops";
import type { ProjectTasks } from "../projects/ProjectTasks";
import type { LayoutHost } from "./LayoutHost";
import type { LayoutDrop, LayoutMotion } from "./ModeLayout";
import { StillLayout } from "./StillLayout";

/**
 * By project (`byProject`, board D3): the node's tasks in its projects' parts (`projectsScreen(node)`), every open task
 * by its top project without a filter (decision 54), the timeline beside it behind the divider; in a note's block the
 * note's project alone, the whole width.
 */
export class ByProjectLayout extends StillLayout {
	private readonly list: ProjectTasks;
	private readonly drop: ProjectsListDrop;

	constructor(host: LayoutHost, layout: ViewLayout) {
		super(host, layout, "is-by-project");
		const body = this.columns.find((col) => col.column.id === "projects")?.body ?? this.stage;
		const made = host.projectsList(body);
		this.list = made.list;
		this.drop = made.drop;
	}

	render(motion: LayoutMotion): void {
		const view = this.host.projectsView();
		if (view) this.list.render(view, motion === "move");
		this.frame();
	}

	drops(): readonly LayoutDrop[] {
		return [this.drop];
	}

	override projects(): ProjectTasks {
		return this.list;
	}

	override destroy(): void {
		this.list.destroy();
		super.destroy();
	}

	override scroller(): HTMLElement | null {
		return this.timelineShows() ? null : this.list.el;
	}
}
