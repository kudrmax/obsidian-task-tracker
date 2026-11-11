// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECTS_HOVER_MS, PROJECTS_INDENT, type ProjectsRow } from "../../core/application/contracts";
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
	afterEach(() => vi.useRealTimers());

	const card = { item: {} as never, from: "soon" as const, grabPx: 18 };
	const hovered = (rows: readonly ProjectsRow[]) => {
		vi.useFakeTimers();
		const hover = vi.fn(async () => undefined);
		const filled: (string | null)[] = [];
		const tree = { ...shown(rows), showDropOn: (node: string | null) => void filled.push(node) };
		tree.el.getClientRects = () => [tree.el.getBoundingClientRect()] as unknown as DOMRectList;
		return { drop: new TreeDrop({ tree: () => tree, hover }), hover, filled };
	};
	const opens = (r: ProjectsRow): ProjectsRow => ({ ...r, opensOnHover: true });
	const unfolds = (r: ProjectsRow): ProjectsRow => ({ ...r, unfoldsOnHover: true });

	it("opens a row that opens on hover once it has waited the core's pause there", () => {
		const { drop, hover } = hovered([row("all", "all", 0), opens(row("project:A", "project", 0)), row("project:B", "project", 0)]);
		drop.preview(20, 30 + 5, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS - 1);
		expect(hover).not.toHaveBeenCalled();
		drop.preview(20, 30 + 8, card);
		vi.advanceTimersByTime(1);
		expect(hover).toHaveBeenCalledWith("project:A");
		vi.advanceTimersByTime(PROJECTS_HOVER_MS * 3);
		expect(hover).toHaveBeenCalledTimes(1);
	});

	it("unfolds a folded row the same way, in the same one call", () => {
		const { drop, hover } = hovered([row("all", "all", 0), unfolds(row("project:A", "project", 0, true))]);
		drop.preview(20, 30 + 5, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		expect(hover).toHaveBeenCalledWith("project:A");
	});

	it("does nothing over a row that neither opens nor unfolds: All, the chosen one, Done", () => {
		const { drop, hover } = hovered([row("all", "all", 0), { ...row("project:A", "project", 0), selected: true }, row("done", "done", 0)]);
		for (const y of [5, 35, 65]) {
			drop.preview(20, y, card);
			vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		}
		expect(hover).not.toHaveBeenCalled();
	});

	it("stops the wait when the card moves to another row or leaves the tree", () => {
		const { drop, hover } = hovered([opens(row("project:A", "project", 0)), opens(row("project:B", "project", 0))]);
		drop.preview(20, 5, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS - 100);
		drop.preview(20, 35, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS - 100);
		drop.leave();
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		expect(hover).not.toHaveBeenCalled();
	});

	it("opens one row after another as the card waits over each in turn", () => {
		const { drop, hover } = hovered([opens(row("project:A", "project", 0)), opens(row("project:B", "project", 0))]);
		drop.preview(20, 35, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		drop.preview(20, 5, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		expect(hover.mock.calls).toEqual([["project:B"], ["project:A"]]);
	});

	it("fills the row it still waits over again once the screen is drawn anew", async () => {
		const { drop, filled } = hovered([opens(row("project:A", "project", 0))]);
		drop.preview(20, 5, card);
		filled.length = 0;
		await vi.advanceTimersByTimeAsync(PROJECTS_HOVER_MS);
		expect(filled).toEqual(["project:A"]);
	});

	it("fills nothing again once the card has left the tree before the screen is drawn", async () => {
		const { drop, filled, hover } = hovered([opens(row("project:A", "project", 0))]);
		let drawn: () => void = () => undefined;
		hover.mockImplementation(() => new Promise<undefined>((r) => (drawn = () => r(undefined))));
		drop.preview(20, 5, card);
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		drop.leave();
		filled.length = 0;
		drawn();
		await vi.advanceTimersByTimeAsync(0);
		expect(filled).toEqual([]);
	});

	it("never opens a row under the plus", () => {
		const { drop, hover } = hovered([row("all", "all", 0), opens(row("project:A", "project", 0)), row("none", "none", 0)]);
		drop.preview(20, 35, { from: "new", item: null, grabPx: 0 });
		vi.advanceTimersByTime(PROJECTS_HOVER_MS);
		expect(hover).not.toHaveBeenCalled();
	});
});
