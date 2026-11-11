// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { ProjectsRow } from "../../core/application/contracts";
import { treeGap, type TreeShown } from "../../obsidian/ui/projects/ProjectDrops";

const row = (node: string, kind: ProjectsRow["kind"], depth: number, hasBranch = false): ProjectsRow => ({
	node, kind, title: node.replace("project:", ""), depth, tile: depth === 0, waiting: false, muted: false, status: null, selected: false, hasBranch, folded: false, project: null,
	acceptsTask: kind === "project" || kind === "none", canLift: kind === "project", unfoldsOnHover: false,
});

/** The tree as laid out: rows 30 px tall from y 0, a depth's indent 1 px (happy-dom reads no token), the tree from x 10. */
function shown(rows: readonly ProjectsRow[]): TreeShown {
	const el = document.createElement("div");
	el.getBoundingClientRect = () => new DOMRect(10, 0, 175, 30 * rows.length);
	return { el, rows, showDropOn: () => undefined, elementOf: (i) => ({ getBoundingClientRect: () => new DOMRect(10 + rows[i].depth, i * 30, 175, 30) }) as HTMLElement };
}

const ROWS = [row("all", "all", 0), row("project:A", "project", 0, true), row("project:A1", "project", 1), row("project:B", "project", 0), row("none", "none", 0), row("done", "done", 0)];

describe("the depth a gap of the tree takes", () => {
	it("a lifted project let go where it stood, the finger not shifted sideways, keeps its own depth", () => {
		const tree = shown(ROWS);
		expect(treeGap(tree, 140, 3 * 30 + 5, "project:B", { depth: 0, x: 140 })?.depth).toBe(0);
		expect(treeGap(tree, 140, 2 * 30 + 5, "project:A1", { depth: 1, x: 140 })?.depth).toBe(1);
	});

	it("a lifted project goes a level in or out per indent the finger shifts, within the gap's levels", () => {
		const tree = shown(ROWS);
		expect(treeGap(tree, 141, 3 * 30 + 5, "project:B", { depth: 0, x: 140 })?.depth).toBe(1);
		expect(treeGap(tree, 139, 2 * 30 + 5, "project:A1", { depth: 1, x: 140 })?.depth).toBe(0);
	});

	it("the plus takes the depth of where the finger stands, from the tree's left edge", () => {
		const tree = shown(ROWS);
		expect(treeGap(tree, 10, 3 * 30 + 5)?.depth).toBe(0);
		expect(treeGap(tree, 12, 3 * 30 + 5)?.depth).toBe(2);
	});
});
