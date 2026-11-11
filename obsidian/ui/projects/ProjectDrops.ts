import { projectsGap, type ProjectsNodeId, type ProjectsRow } from "../../../core/application/contracts";
import { tokenPx } from "../design";
import { DropLine } from "../drag/DropLine";
import type { DragPayload, DropResult, DropTarget, ProjectsDrop } from "../drag/DropTarget";
import { readFrame } from "../drag/listFrame";
import type { DrawnPart } from "./ProjectTasks";

/** What the tree's targets read of the tree as drawn. */
export interface TreeShown {
	readonly el: HTMLElement;
	readonly rows: readonly ProjectsRow[];
	elementOf(index: number): HTMLElement | null;
	showDropOn(node: ProjectsNodeId | null): void;
}

/** A row's place on the screen, top to bottom. */
function rectOf(tree: TreeShown, index: number): DOMRect | null {
	return tree.elementOf(index)?.getBoundingClientRect() ?? null;
}

function within(el: HTMLElement, x: number, y: number): boolean {
	const r = el.getBoundingClientRect();
	return el.getClientRects().length > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

/** The row under `y`; null between rows and past them. */
export function rowUnder(tree: TreeShown, y: number): ProjectsRow | null {
	for (let i = 0; i < tree.rows.length; i++) {
		const r = rectOf(tree, i);
		if (r && y >= r.top && y <= r.bottom) return tree.rows[i];
	}
	return null;
}

/** A lifted project's own depth and where the finger stood when it was lifted: its depth changes only with the finger's sideways shift. */
export interface ShiftFrom {
	readonly depth: number;
	readonly x: number;
}

/**
 * The gap a point of the tree stands at, among the projects (All above them and No project below closing the run): the
 * row whose middle is under the point, and its depth. The plus takes the depth of where the finger stands, a step per
 * indent from the tree's left edge; a lifted project (`from`) keeps its own depth until the finger shifts sideways, a
 * level per indent either way.
 */
export function treeGap(tree: TreeShown, x: number, y: number, lifted?: ProjectsNodeId | null, from?: ShiftFrom): { readonly gap: number; readonly depth: number } | null {
	const rows = tree.rows;
	const first = rows.findIndex((row) => row.kind === "project" || row.kind === "none");
	const last = rows.findIndex((row) => row.kind === "none");
	if (first < 0 || last < 0) return null;
	let gap = last;
	for (let i = first; i < last; i++) {
		const r = rectOf(tree, i);
		if (r && y < r.top + r.height / 2) {
			gap = i;
			break;
		}
	}
	const left = rectOf(tree, first)?.left ?? tree.el.getBoundingClientRect().left;
	const indent = tokenPx(tree.el, "--tc-tree-indent") || 1;
	const depth = Math.max(0, from ? from.depth + Math.round((x - from.x) / indent) : Math.round((x - left) / indent - 0.5));
	const landing = projectsGap(rows, gap, depth, lifted);
	return { gap, depth: landing.depth };
}

/** The drop line of a gap of the tree: under the row above it (or over the row below), from its depth's indent to the right edge. */
export function showGapLine(line: DropLine, tree: TreeShown, gap: number, depth: number, finger: { readonly x: number; readonly y: number } | null): void {
	const above = gap > 0 ? rectOf(tree, gap - 1) : null;
	const below = rectOf(tree, gap);
	const frame = readFrame(tree.el);
	const y = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom : (below?.top ?? frame.box.top);
	const left = (rectOf(tree, tree.rows.findIndex((row) => row.kind === "project" || row.kind === "none"))?.left ?? frame.box.left) + depth * tokenPx(tree.el, "--tc-tree-indent");
	line.show(left, frame.box.right, y, frame, finger);
}

/** What the tree's drop asks of the screen: how long a card waits over a folded row, and that row opened. */
export interface TreeDropDeps {
	tree(): TreeShown | null;
	/** How long a card held still over a folded row waits before its branch opens: a long press's time. */
	hoverMs(): number;
	/** A folded row's branch opened under a held card (`TaskService.unfoldProjectNode`), the tree drawn again. */
	unfold(node: ProjectsNodeId): void;
}

/** The row a held card waits over, and since when its branch is about to open. */
interface Hover {
	readonly node: ProjectsNodeId;
	readonly timer: number;
}

/**
 * The tree as a place to let go (board Drag): a card held over a row that takes it fills the row with the place's colour,
 * and let go there the card's project gives way to the row's; held a moment over a folded row, the row opens (spec: «Задержка
 * над свёрнутой веткой раскрывает её»). The plus held over the tree shows the gap a new project would take, at the depth
 * the finger's distance from the left picks.
 */
export class TreeDrop implements DropTarget {
	/** The row a card lands on, filled, and the plus's line stay in sight: the card rides above the finger. */
	readonly clearsFinger = true;
	private readonly line: DropLine;
	private result: ProjectsDrop | null = null;
	private hover: Hover | null = null;

	constructor(private readonly deps: TreeDropDeps) {
		this.line = new DropLine(() => this.deps.tree()?.el ?? document.body);
	}

	private tree(): TreeShown | null {
		return this.deps.tree();
	}

	/** The card waits over `row`: a folded one opens once it has waited a long press's time there, any other stops the wait. */
	private hoverOver(row: ProjectsRow | null): void {
		if (row?.node === this.hover?.node) return;
		this.stopHover();
		if (!row?.unfoldsOnHover) return;
		const node = row.node;
		this.hover = { node, timer: window.setTimeout(() => this.deps.unfold(node), this.deps.hoverMs()) };
	}

	private stopHover(): void {
		if (this.hover) window.clearTimeout(this.hover.timer);
		this.hover = null;
	}

	hitTest(x: number, y: number): boolean {
		const tree = this.tree();
		return tree !== null && within(tree.el, x, y);
	}

	preview(x: number, y: number, drag: DragPayload): void {
		const tree = this.tree();
		if (!tree) return;
		if (drag.from !== "new") {
			const row = rowUnder(tree, y);
			const node = row?.acceptsTask ? row.node : null;
			tree.showDropOn(node);
			this.hoverOver(row);
			this.result = node === null ? null : { kind: "projectRow", node };
			return;
		}
		const at = treeGap(tree, x, y);
		if (!at) return this.leave();
		this.result = { kind: "projectGap", gap: at.gap, landing: projectsGap(tree.rows, at.gap, at.depth) };
		showGapLine(this.line, tree, at.gap, at.depth, { x, y });
	}

	landing(): DOMRect | null {
		return null;
	}

	leave(): void {
		this.result = null;
		this.stopHover();
		this.tree()?.showDropOn(null);
		this.line.hide();
	}

	clear(): void {
		this.leave();
	}

	drop(): DropResult | null {
		const result = this.result;
		this.leave();
		return result;
	}
}

/** What the tasks' target reads of the tasks as drawn. */
export interface TasksShown {
	readonly el: HTMLElement;
	readonly parts: readonly DrawnPart[];
	readonly endTask: DrawnPart["newTask"];
}

/**
 * The tasks as a place for the plus: the part under the finger, its end marked by the drop line; let go, the field of a
 * new task opens there, written into that part's project (decision 10). Done takes nothing.
 */
export class TasksDrop implements DropTarget {
	private readonly line: DropLine;
	private result: ProjectsDrop | null = null;

	constructor(private readonly tasks: () => TasksShown | null) {
		this.line = new DropLine(() => this.tasks()?.el ?? document.body);
	}

	hitTest(x: number, y: number, drag: DragPayload): boolean {
		const tasks = this.tasks();
		return drag.from === "new" && tasks !== null && within(tasks.el, x, y);
	}

	preview(x: number, y: number): void {
		const tasks = this.tasks();
		if (!tasks) return;
		const part = tasks.parts.find((p) => p.last.getBoundingClientRect().bottom >= y) ?? null;
		const newTask = part ? part.newTask : tasks.endTask;
		if (!newTask) return this.leave();
		const after = part?.last ?? tasks.parts[tasks.parts.length - 1]?.last ?? null;
		this.result = { kind: "projectTasks", newTask, after };
		const frame = readFrame(tasks.el);
		const lastRect = after?.getBoundingClientRect();
		const at = lastRect ? lastRect.bottom : frame.box.top;
		this.line.show(lastRect?.left ?? frame.box.left, lastRect?.right ?? frame.box.right, at, frame, { x, y });
	}

	landing(): DOMRect | null {
		return null;
	}

	leave(): void {
		this.result = null;
		this.line.hide();
	}

	clear(): void {
		this.leave();
	}

	drop(): DropResult | null {
		const result = this.result;
		this.leave();
		return result;
	}
}
