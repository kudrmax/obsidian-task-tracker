import type { ProjectsDrop, ProjectsNodeId, ProjectsListRow, TaskItem } from "../../../core/application/contracts";
import type { TaskDragPayload } from "../drag/DropTarget";

/** What a carry reads of the Projects screen at the lift. */
export interface ProjectsCarryDeps {
	/** The row a card drawn now stands for; undefined for a card of no Projects list. */
	rowOf(card: HTMLElement): ProjectsListRow | undefined;
	/** The node chosen now; null before the screen is read. */
	selected(): ProjectsNodeId | null;
	/** The cards of the picked tasks carried along with `item`. */
	carried(item: TaskItem): readonly { readonly card: HTMLElement }[];
}

/**
 * The cards a drag carries from the Projects screen, read at the lift: each row's `drop` (the card's own first, a task of
 * two parts being two cards, then the picked ones carried along), handed to the core unchanged however the screen is drawn
 * after (a held card opens another node, whose cards are others), and the node they were lifted on.
 */
export class ProjectsCarry {
	private readonly drops = new WeakMap<TaskDragPayload, readonly ProjectsDrop[]>();
	private readonly nodes = new WeakMap<TaskDragPayload, ProjectsNodeId>();

	constructor(private readonly deps: ProjectsCarryDeps) {}

	/** `drag` lifted from `source`: nothing kept when `source` is no card of the Projects screen. */
	lift(drag: TaskDragPayload, source: HTMLElement): void {
		const row = this.deps.rowOf(source);
		const node = this.deps.selected();
		if (!row || node === null) return;
		const along = this.deps.carried(drag.item).flatMap((picked) => this.deps.rowOf(picked.card)?.drop ?? []);
		this.drops.set(drag, [row.drop, ...along]);
		this.nodes.set(drag, node);
	}

	/** What the core takes for the cards `drag` carries, as read at its lift; none for a drag lifted elsewhere. */
	dropsOf(drag: TaskDragPayload): readonly ProjectsDrop[] {
		return this.drops.get(drag) ?? [];
	}

	/** The node `drag` was lifted on; null for a drag lifted elsewhere. */
	liftedOn(drag: TaskDragPayload): ProjectsNodeId | null {
		return this.nodes.get(drag) ?? null;
	}
}
