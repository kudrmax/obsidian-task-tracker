import type { MenuFrom, TaskItem } from "../../../core/application/contracts";
import type { LocalDate } from "../types";

/**
 * The Projects screen as the core will give it (`TaskService.projectsScreen`), named as the contract names it: when the
 * contract lands these types come from `contracts.ts` and this file goes. Only the fields the screen draws are here.
 */

/** A node of the tree: `all`, `none`, `done`, or `project:` and the project's name. */
export type ProjectsNodeId = string;

export type ProjectsMode = "byProject" | "byStage";

/** A row of the tree, top to bottom; depth 0 is a tile, a deeper row a line of text. */
export interface ProjectsRow {
	readonly node: ProjectsNodeId;
	readonly kind: "all" | "project" | "none" | "done";
	readonly title: string;
	readonly depth: number;
	readonly tile: boolean;
	/** The grey name: a project waiting, and No project and Done. */
	readonly waiting: boolean;
	readonly selected: boolean;
	readonly hasBranch: boolean;
	/** A tile shows a layer peeking out, a line an ellipsis. */
	readonly folded: boolean;
	/** A dragged card may be let go on it. */
	readonly acceptsTask: boolean;
	/** A long press lifts it to reorder or nest. */
	readonly canLift: boolean;
	/** A held card over it unfolds its branch after a pause. */
	readonly unfoldsOnHover: boolean;
}

/** The right side of a card in By project: the stage's mark, or the task's date. */
export type ProjectsStage = { readonly kind: "today" | "soon" | "inbox" | "backlog" | "done" } | { readonly kind: "date"; readonly date: LocalDate };

export interface ProjectsCard {
	readonly item: TaskItem;
	/** By project: the stage's mark on the right; null in By stage. */
	readonly stage: ProjectsStage | null;
	/** By stage: the subproject, small over the title; null for the chosen project's own and in By project. */
	readonly over: string | null;
	/** The project it is shown under: what a drop on the tree replaces. */
	readonly from: string | null;
	readonly menuFrom: MenuFrom;
	readonly canDrop: boolean;
}

/** A part of the tasks: By project a subproject's (the node's own first, untitled), By stage a stage's. */
export interface ProjectsSection {
	readonly key: string;
	readonly title: string | null;
	readonly cards: readonly ProjectsCard[];
}

export interface ProjectsView {
	readonly rows: readonly ProjectsRow[];
	readonly selected: ProjectsNodeId;
	readonly mode: ProjectsMode;
	readonly modes: readonly { readonly mode: ProjectsMode; readonly label: string }[];
	/** The header over the tasks: the chosen node's name. */
	readonly title: string;
	/** The chosen project has a menu (its title tapped): null for All, No project and Done. */
	readonly menu: object | null;
	readonly sections: readonly ProjectsSection[];
	/** The words over an empty list of tasks. */
	readonly emptyLabel: string;
	/** No tasks file. */
	readonly missing: boolean;
}

/** What the screen asks the core: the same calls `TaskService` will have, so wiring it is passing the service. */
export interface ProjectsSource {
	projectsScreen(): Promise<ProjectsView>;
	tapProjectNode(node: ProjectsNodeId): Promise<void>;
	setProjectsMode(mode: ProjectsMode): Promise<void>;
}
