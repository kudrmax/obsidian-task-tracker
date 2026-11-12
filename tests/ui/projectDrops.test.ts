// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { PROJECTS_INDENT, type ProjectsRow } from "../../core/application/contracts";
import { DESIGN } from "../../obsidian/ui/design";
import { liftLanding, plusLanding, TreeDrop, type TreeShown } from "../../obsidian/ui/projects/ProjectDrops";

const row = (node: string, kind: ProjectsRow["kind"], depth: number, hasBranch = false): ProjectsRow => ({
	node, kind, title: node.replace("project:", ""), depth, tile: depth === 0, waiting: false, muted: false, status: null, selected: false, hasBranch, folded: false, project: null,
	acceptsTask: kind === "project" || kind === "none", canLift: kind === "project", unfoldsOnHover: false, opensOnHover: false,
});

/** The tree as laid out: rows 30 px tall from y 0, each a tree step further in per depth from x 10. */
function shown(rows: readonly ProjectsRow[]): TreeShown {
	const el = document.createElement("div");
	el.getBoundingClientRect = () => new DOMRect(10, 0, 175, 30 * rows.length);
	return { el, rows, showDropOn: () => undefined, elementOf: (i) => ({ getBoundingClientRect: () => new DOMRect(10 + rows[i].depth * PROJECTS_INDENT, i * 30, 175, 30) }) as HTMLElement };
}

const ROWS = [row("all", "all", 0), row("project:A", "project", 0, true), row("project:A1", "project", 1), row("project:B", "project", 0), row("none", "none", 0), row("done", "done", 0)];

describe("where a lifted project lands (the core's projectsDrop)", () => {
	it("let go where it stood, the finger not shifted sideways, keeps its own depth", () => {
		const tree = shown(ROWS);
		expect(liftLanding(tree, 3 * 30 + 5, 0, "project:B")?.landing.depth).toBe(0);
		expect(liftLanding(tree, 2 * 30 + 5, 0, "project:A1")?.landing.depth).toBe(1);
	});

	it("goes a level in or out per tree step the finger shifts, within the gap's levels", () => {
		const tree = shown(ROWS);
		expect(liftLanding(tree, 3 * 30 + 5, PROJECTS_INDENT, "project:B")?.landing.depth).toBe(1);
		expect(liftLanding(tree, 2 * 30 + 5, -PROJECTS_INDENT, "project:A1")?.landing.depth).toBe(0);
		expect(liftLanding(tree, 3 * 30 + 5, PROJECTS_INDENT / 3, "project:B")?.landing.depth).toBe(0);
	});
});

describe("where the plus lands in the tree", () => {
	it("takes the depth of where the finger stands: the row above's, a step in per tree step right of that row's start", () => {
		const tree = shown(ROWS);
		const aboveStart = 10 + 1 * PROJECTS_INDENT;
		expect(plusLanding(tree, aboveStart + 2, 3 * 30 + 5)?.landing.depth).toBe(1);
		expect(plusLanding(tree, aboveStart + PROJECTS_INDENT, 3 * 30 + 5)?.landing.depth).toBe(2);
		expect(plusLanding(tree, 10, 3 * 30 + 5)?.landing.depth).toBe(0);
	});

	it("stands among the projects only: past the last, the gap before No project", () => {
		const tree = shown(ROWS);
		expect(plusLanding(tree, 10, 4 * 30 + 20)?.gap).toBe(4);
	});
});

describe("the tree's step", () => {
	it("is the core's: the stylesheet's indent and a drag's sideways step are one measure", () => {
		expect(DESIGN.treeIndent).toBe(PROJECTS_INDENT);
	});
});

describe("a card held over a row of the tree", () => {
	const card = { item: {} as never, from: "soon" as const, grabPx: 18 };
	const held = (rows: readonly ProjectsRow[]) => {
		const filled: (string | null)[] = [];
		const tree = { ...shown(rows), showDropOn: (node: string | null) => void filled.push(node) };
		tree.el.getClientRects = () => [tree.el.getBoundingClientRect()] as unknown as DOMRectList;
		return { drop: new TreeDrop({ tree: () => tree }), filled };
	};

	it("fills the row it is over again once the tree is drawn anew (a pause opened it: the core's carry)", () => {
		const { drop, filled } = held([row("project:A", "project", 0)]);
		drop.preview(20, 5, card);
		filled.length = 0;
		drop.refill();
		expect(filled).toEqual(["project:A"]);
	});

	it("fills nothing again once the card has left the tree", () => {
		const { drop, filled } = held([row("project:A", "project", 0)]);
		drop.preview(20, 5, card);
		drop.leave();
		filled.length = 0;
		drop.refill();
		expect(filled).toEqual([]);
	});
});
