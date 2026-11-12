import { LIST_WIDTHS, type ProjectsNodeId, type ProjectsPanel, type ProjectsRow } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import { Divider } from "../Divider";
import { el, px } from "../dom";
import { GroupNameField } from "../GroupNameField";
import type { GestureArbiter } from "../gestures";
import { listWidthMax } from "../listWidth";
import { ScrollEdges } from "../ScrollEdges";
import type { TreeShown } from "./ProjectDrops";
import { ProjectTree } from "./ProjectTree";

export interface TreePanelDeps {
	readonly arbiter: GestureArbiter;
	/** The tree's width as its divider was let go at on this device; null for the design's. */
	treeWidth(): number | null;
	/** The divider moved: the tree is this wide while the finger holds it, and the lists beside it give way. */
	onWidth(width: number): void;
	setTreeWidth(width: number): void;
	onSnap(): void;
	/** A row tapped (`TaskService.pickProjectNode`). */
	onPick(node: ProjectsNodeId): void;
	/** The dim beside the panel tapped, on the phone: the panel closes. */
	onClose(): void;
	onRow?(row: HTMLElement, model: ProjectsRow, signal: AbortSignal): void;
}

/**
 * The projects' tree as a panel (boards D1, T2): «Projects» beside the projects button, the tree under it, the divider with
 * its handle at its right edge. On the desktop it stands docked left of the lists, which give it room, until the button
 * closes it; on the phone it lies over the lists, the rest of the screen dimmed, until a pick or a tap on the dim.
 */
export class TreePanel {
	readonly el: HTMLElement;
	private readonly dim: HTMLElement;
	private readonly tree: ProjectTree;
	private readonly edges: ScrollEdges;

	constructor(
		private readonly root: HTMLElement,
		private readonly deps: TreePanelDeps,
	) {
		this.dim = el(root, "div", "tc-tree-dim");
		this.dim.addEventListener("click", () => deps.onClose());
		this.el = el(root, "div", "tc-tree-panel");
		this.el.setAttribute("aria-label", "Projects");
		el(this.el, "div", "tc-tree-panel-title", "Projects");
		const column = el(this.el, "div", "tc-tree-column");
		this.tree = new ProjectTree(column, { onTap: (node) => deps.onPick(node), onRow: deps.onRow });
		/** Rows scrolled under the title fade out there, as a list's do. */
		this.edges = new ScrollEdges(this.tree.el);
		new Divider(el(this.el, "div"), {
			width: () => column.offsetWidth,
			onWidth: (width) => {
				root.style.setProperty(PROPERTY.treeWidth, px(width));
				deps.onWidth(width);
			},
			onRelease: (width) => deps.setTreeWidth(width),
			min: LIST_WIDTHS.min,
			max: () => listWidthMax(root.clientWidth),
			center: () => Math.round(root.clientWidth / 2),
			onSnap: () => deps.onSnap(),
			arbiter: deps.arbiter,
		});
	}

	/** The tree as its drop targets read it; the tree hidden is none. */
	get treeShown(): TreeShown {
		const tree = this.tree;
		return { el: tree.el, rows: tree.rows, elementOf: (i) => tree.elementOf(i), showDropOn: (node) => tree.showDropOn(node) };
	}

	/** The tree's rows and the width it was let go at. */
	render(panel: ProjectsPanel): void {
		const width = this.deps.treeWidth();
		if (width === null) this.root.style.removeProperty(PROPERTY.treeWidth);
		else this.root.style.setProperty(PROPERTY.treeWidth, px(width));
		this.el.classList.toggle("is-missing", panel.missing);
		this.tree.render(panel.rows);
		this.edges.update();
	}

	/** A new project's name typed at a gap of the tree, `depth` steps in; resolves with the name, or null for nothing typed. */
	askProjectName(gap: number, depth: number): Promise<string | null> {
		const before = this.tree.elementOf(gap);
		const slot = el(null, "div", "tc-tree-field");
		slot.style.setProperty(PROPERTY.level, String(depth));
		if (before) before.before(slot);
		else this.tree.el.appendChild(slot);
		return new Promise((resolve) => {
			const field = GroupNameField.open(slot, {
				value: "",
				placeholder: "Project name",
				onDone: (text) => {
					slot.remove();
					resolve(text);
				},
			});
			field.scrollIntoView({ block: "nearest" });
		});
	}
}
