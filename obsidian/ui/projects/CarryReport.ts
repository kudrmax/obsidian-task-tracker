import type { CarryPoint, TaskService } from "../../../core/application/contracts";
import { LAYOUT } from "../design";
import { rowUnder, type TreeShown } from "./ProjectDrops";

export interface CarryReportDeps {
	readonly tasks: Pick<TaskService, "carryAt">;
	/** The view the edge is the left of. */
	root(): HTMLElement;
	/** The tree while the panel shows; null while it is closed. */
	tree(): TreeShown | null;
	/** The host's clock, ms. */
	now(): number;
	/** The core may have moved the panel or the filter: the screen reads it again. */
	changed(): Promise<void>;
	onError(error: unknown): void;
}

/**
 * Where a carrying finger is, told to the core's carry (`TaskService.carryAt`): at the left edge, over a row of the panel.
 * The core decides what a pause there does and how long to wait; the finger staying put is told again once that is up.
 * Told only when the point changes, or when the wait is over.
 */
export class CarryReport {
	private last: CarryPoint | null = null;
	private timer = 0;

	constructor(private readonly deps: CarryReportDeps) {}

	move(x: number, y: number): void {
		const point = this.pointAt(x, y);
		if (this.last && this.last.edge === point.edge && this.last.node === point.node) return;
		this.last = point;
		void this.tell(point);
	}

	end(): void {
		window.clearTimeout(this.timer);
		this.timer = 0;
		this.last = null;
	}

	private pointAt(x: number, y: number): CarryPoint {
		const edge = x - this.deps.root().getBoundingClientRect().left < LAYOUT.panelEdge;
		const tree = this.deps.tree();
		if (!tree) return { edge, node: null };
		const r = tree.el.getBoundingClientRect();
		const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
		return { edge, node: inside ? (rowUnder(tree, y)?.node ?? null) : null };
	}

	private async tell(point: CarryPoint): Promise<void> {
		window.clearTimeout(this.timer);
		this.timer = 0;
		try {
			const { wait } = await this.deps.tasks.carryAt(point, this.deps.now());
			await this.deps.changed();
			if (wait === null || this.last !== point) return;
			this.timer = window.setTimeout(() => {
				if (this.last === point) void this.tell(point);
			}, wait);
		} catch (error) {
			this.deps.onError(error);
		}
	}
}
