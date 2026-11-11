import type { ProjectsNodeId } from "../../../core/application/contracts";

/** What the choices ask of the core and the screen. */
export interface ProjectsChoicesDeps {
	/** A card held over a row (`TaskService.hoverProjectNode`). */
	hover(node: ProjectsNodeId): Promise<void>;
	/** The node chosen again (`TaskService.selectProjectNode`). */
	select(node: ProjectsNodeId): Promise<void>;
	/** The Projects screen read and drawn again. */
	refresh(): Promise<void>;
	/** The node drawn now; null before the screen is read. */
	selected(): ProjectsNodeId | null;
	onError(error: unknown): void;
}

/**
 * The nodes a held card chooses on the Projects screen, one after another: each choice is kept on the device and the
 * screen drawn again before the next starts. While one is not drawn yet the tasks on the screen are another node's, so
 * nothing is let go among them (`choosing`); a drag let go nowhere goes back to the node it was lifted on only after it.
 */
export class ProjectsChoices {
	private last: Promise<void> = Promise.resolve();
	private pending = 0;

	constructor(private readonly deps: ProjectsChoicesDeps) {}

	/** A choice is being made or drawn: the tasks shown are not yet the chosen node's. */
	get choosing(): boolean {
		return this.pending > 0;
	}

	/** Resolves once every choice made so far is drawn. */
	settled(): Promise<void> {
		return this.last;
	}

	/** A card waited over `node`'s row: it unfolds or opens, the screen drawn again. */
	hover(node: ProjectsNodeId): Promise<void> {
		return this.queue(() => this.deps.hover(node));
	}

	/**
	 * A drag lifted on `start` let go nowhere: once the choices before are drawn, `start` is chosen again if another node
	 * shows. Null when the drag was lifted elsewhere: nothing to wait for.
	 */
	backTo(start: ProjectsNodeId | null): Promise<void> | null {
		if (start === null) return null;
		return this.queue(async () => {
			if (this.deps.selected() !== start) await this.deps.select(start);
		});
	}

	/** A failure is said, never thrown: a drag waiting on a choice goes on. */
	private queue(change: () => Promise<void>): Promise<void> {
		this.pending++;
		this.last = this.last.then(async () => {
			try {
				await change();
				await this.deps.refresh();
			} catch (error) {
				this.deps.onError(error);
			} finally {
				this.pending--;
			}
		});
		return this.last;
	}
}
