import { clear, el } from "../dom";
import type { ProjectsNodeId, ProjectsRow } from "../../../core/application/contracts";

export interface ProjectTreeDeps {
	/** A row tapped: the core chooses it, or folds the chosen one's branch. */
	onTap(node: ProjectsNodeId): void;
	/** Each row drawn: what a drag over it or a long press on it does. */
	onRow?(row: HTMLElement, model: ProjectsRow, signal: AbortSignal): void;
}

/**
 * The tree of the Projects screen (board TreeC, variant В): All, the projects with their branches, No project and Done,
 * one row per row of the core's. A project at the top is a tile; a subproject a line of text, each level a step further
 * in, a thin line beside the rows of each open branch. The chosen row is filled light, a waiting one has a grey name, a
 * folded tile shows a layer peeking out under it and a folded line an ellipsis.
 */
export class ProjectTree {
	readonly el: HTMLElement;
	private drawn: AbortController | null = null;
	private readonly rowsByNode = new Map<ProjectsNodeId, HTMLElement>();
	/** The rows as the core gave them and their elements, in the same order: what a gap's index counts. */
	private drawnRows: readonly ProjectsRow[] = [];
	private rowEls: HTMLElement[] = [];

	constructor(
		parent: HTMLElement,
		private readonly deps: ProjectTreeDeps,
	) {
		this.el = el(parent, "div", "tc-tree");
		this.el.setAttribute("role", "tree");
		this.el.setAttribute("aria-label", "Projects");
	}

	/** The row drawn for `node`: where a drop or a lifted project is shown. */
	rowOf(node: ProjectsNodeId): HTMLElement | null {
		return this.rowsByNode.get(node) ?? null;
	}

	/** The row a card is held over is filled with the colour of the place it would land in; null takes the fill away. */
	showDropOn(node: ProjectsNodeId | null): void {
		for (const [id, row] of this.rowsByNode) row.classList.toggle("is-drop", id === node);
	}

	/** The rows drawn, as the core gave them, and each one's element. */
	get rows(): readonly ProjectsRow[] {
		return this.drawnRows;
	}

	elementOf(index: number): HTMLElement | null {
		return this.rowEls[index] ?? null;
	}

	render(rows: readonly ProjectsRow[]): void {
		this.drawn?.abort();
		const drawn = new AbortController();
		this.drawn = drawn;
		const scroll = this.el.scrollTop;
		clear(this.el);
		this.rowsByNode.clear();
		this.drawnRows = rows;
		this.rowEls = [];
		/** The branch each depth's rows go into: the tree itself at depth 0, an open row's branch below it. */
		const levels: HTMLElement[] = [this.el];
		for (const model of rows) {
			levels.length = Math.min(levels.length, model.depth + 1);
			const parent = levels[levels.length - 1];
			const row = this.row(parent, model, drawn.signal);
			if (model.hasBranch && !model.folded) levels.push(el(parent, "div", "tc-tree-branch"));
			this.deps.onRow?.(row, model, drawn.signal);
		}
		for (const branch of this.el.querySelectorAll(".tc-tree-branch")) if (!branch.firstChild) branch.remove();
		this.el.scrollTop = scroll;
	}

	private row(parent: HTMLElement, model: ProjectsRow, signal: AbortSignal): HTMLElement {
		const row = el(parent, "div", `tc-tree-row ${model.tile ? "is-tile" : "is-line"} is-${model.kind}`);
		row.setAttribute("role", "treeitem");
		row.setAttribute("aria-selected", String(model.selected));
		if (model.hasBranch) row.setAttribute("aria-expanded", String(!model.folded));
		row.classList.toggle("is-selected", model.selected);
		row.classList.toggle("is-muted", model.muted);
		row.classList.toggle("is-folded", model.folded);
		el(row, "span", "tc-tree-name", model.title);
		if (model.folded && !model.tile) el(row, "span", "tc-tree-more", "…").setAttribute("aria-hidden", "true");
		row.addEventListener("click", () => this.deps.onTap(model.node), { signal });
		this.rowsByNode.set(model.node, row);
		this.rowEls.push(row);
		return row;
	}
}
