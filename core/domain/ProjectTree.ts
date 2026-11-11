import { isTaskLine } from "./TaskLine";
import { projectKey, projectName } from "./Project";

/** The heading of the tasks file's projects: `## Projects`, a nested list of their names. */
export const PROJECTS_HEADING = "Projects";

/** The mark of a folder on its tree line, a word of its own right after the name: `- Работа 🗃️`. */
export const FOLDER_MARK = "🗃️";
/** The folder's mark as a word of a tree line, with or without its variation selector. */
const FOLDER_RE = /(^|\s)\u{1F5C3}\u{FE0F}?(?=\s|$)/gu;

/**
 * A project of the tree: its name, the link of the note attached to it (the text inside `[[…]]`), whether it is a folder
 * (it only holds subprojects: no task is given it), and its subprojects in order.
 */
export interface ProjectNode {
	readonly name: string;
	readonly note: string | null;
	readonly folder: boolean;
	readonly children: readonly ProjectNode[];
}

/** Where a project goes in the tree: among `parent`'s subprojects (null: the top level), right before `before` or last. */
export interface TreePlace {
	readonly parent: string | null;
	readonly before: string | null;
}

/**
 * The sections as the file has them: the first heading's line and where its section ends, the lines of the list in every
 * `## Projects` (Sync may merge two), those of the first alone (`own`), the other sections (`extra`: a heading, where its
 * section ends, and whether it holds nothing but the list and blank lines), and the list's indent.
 */
export interface TreeSpan {
	readonly heading: number | null;
	readonly end: number;
	readonly items: readonly number[];
	readonly own: readonly number[];
	readonly extra: readonly { readonly heading: number; readonly end: number; readonly bare: boolean }[];
	readonly unit: string;
}

const HEADING_RE = /^##\s+(.*?)\s*$/;
const LIST_END_RE = /^#{1,2}(\s|$)/;
const ITEM_RE = /^([ \t]*)[-*+][ \t]+(.*?)\s*$/;
const NOTE_RE = /^(.*?)\s*\[\[([^[\]]+)\]\]$/;
const DEFAULT_UNIT = "\t";

/** An indent's width, a tab as wide as two spaces: «two spaces or a tab» is one level. */
function widthOf(indent: string): number {
	return indent.replace(/\t/g, "  ").length;
}

/** The section of the projects in `lines`: none when the file has no `## Projects`. */
export function treeSpan(lines: readonly string[]): TreeSpan {
	const sections: { heading: number; end: number; items: number[]; bare: boolean }[] = [];
	lines.forEach((line, heading) => {
		if (HEADING_RE.exec(line)?.[1] !== PROJECTS_HEADING) return;
		let end = heading + 1;
		while (end < lines.length && !LIST_END_RE.test(lines[end])) end++;
		const items: number[] = [];
		let bare = true;
		for (let i = heading + 1; i < end; i++) {
			if (ITEM_RE.test(lines[i]) && !isTaskLine(lines[i])) items.push(i);
			else if (lines[i].trim() !== "") bare = false;
		}
		sections.push({ heading, end, items, bare });
	});
	if (sections.length === 0) return { heading: null, end: lines.length, items: [], own: [], extra: [], unit: DEFAULT_UNIT };
	const [first, ...extra] = sections;
	const items = sections.flatMap((s) => s.items);
	return { heading: first.heading, end: first.end, items, own: first.items, extra: extra.map(({ heading, end, bare }) => ({ heading, end, bare })), unit: unitOf(items.map((i) => ITEM_RE.exec(lines[i])![1])) };
}

/** The indent the list steps by: its first deeper line's step over the line above it, else a tab. */
function unitOf(indents: readonly string[]): string {
	for (let i = 1; i < indents.length; i++) {
		if (indents[i].length > indents[i - 1].length && indents[i].startsWith(indents[i - 1])) return indents[i].slice(indents[i - 1].length);
	}
	return DEFAULT_UNIT;
}

interface Building {
	readonly name: string;
	note: string | null;
	folder: boolean;
	readonly children: Building[];
}

/** The projects of a nested list, in its order; a name met again (case aside) is the first one, its subprojects joining it. */
export function readTree(lines: readonly string[]): ProjectTree {
	const span = treeSpan(lines);
	const roots: Building[] = [];
	const known = new Map<string, Building>();
	const stack: { width: number; node: Building }[] = [];
	for (const i of span.items) {
		const [, indent, body] = ITEM_RE.exec(lines[i])!;
		const width = widthOf(indent);
		while (stack.length > 0 && stack[stack.length - 1].width >= width) stack.pop();
		const read = itemOf(body);
		if (read === null) continue;
		const parent = stack[stack.length - 1]?.node ?? null;
		let node = known.get(projectKey(read.name));
		if (!node) {
			node = { name: read.name, note: read.note, folder: read.folder, children: [] };
			known.set(projectKey(read.name), node);
			(parent ? parent.children : roots).push(node);
		} else {
			node.note ??= read.note;
			node.folder ||= read.folder;
		}
		stack.push({ width, node });
	}
	return new ProjectTree(roots.map(frozen));
}

function frozen(node: Building): ProjectNode {
	return { name: node.name, note: node.note, folder: node.folder, children: node.children.map(frozen) };
}

/** A line's project: its name, the note's link after it when one is attached, and the folder's mark anywhere; null for a line of nothing. */
function itemOf(line: string): { name: string; note: string | null; folder: boolean } | null {
	const folder = FOLDER_RE.test(line);
	FOLDER_RE.lastIndex = 0;
	const body = folder ? line.replace(FOLDER_RE, "$1").replace(/\s+/g, " ").trim() : line;
	const linked = NOTE_RE.exec(body);
	const name = (linked ? linked[1] : body).trim() || (linked ? projectName(linked[2].split("|")[0]) : "");
	return name === "" ? null : { name, note: linked ? linked[2] : null, folder };
}

/** The projects, a nested list, each tree line `- Name`, the folder's mark after it, then `[[note]]` when one is attached. */
export function treeLines(tree: ProjectTree, unit: string): string[] {
	const lines: string[] = [];
	const write = (nodes: readonly ProjectNode[], depth: number) => {
		for (const node of nodes) {
			lines.push(`${unit.repeat(depth)}- ${node.name}${node.folder ? ` ${FOLDER_MARK}` : ""}${node.note === null ? "" : ` [[${node.note}]]`}`);
			write(node.children, depth + 1);
		}
	};
	write(tree.roots, 0);
	return lines;
}

/** A project of the tree with where it stands: the names from the top down to it. */
export interface PlacedProject {
	readonly node: ProjectNode;
	readonly path: readonly string[];
}

/** The tree of projects, read from and written to `## Projects`: every change gives a new tree. Names are unique, case aside. */
export class ProjectTree {
	constructor(readonly roots: readonly ProjectNode[]) {}

	static readonly EMPTY = new ProjectTree([]);

	/** Every project, each before its subprojects, with its path. */
	all(): readonly PlacedProject[] {
		const out: PlacedProject[] = [];
		const walk = (nodes: readonly ProjectNode[], path: readonly string[]) => {
			for (const node of nodes) {
				const own = [...path, node.name];
				out.push({ node, path: own });
				walk(node.children, own);
			}
		};
		walk(this.roots, []);
		return out;
	}

	/** The project of that name (case aside), with its path; null when the tree has none. */
	find(name: string): PlacedProject | null {
		const key = projectKey(name);
		return this.all().find((p) => projectKey(p.node.name) === key) ?? null;
	}

	has(name: string): boolean {
		return this.find(name) !== null;
	}

	/** The tree with each of `names` it lacks as a project of its own, last at the top level. */
	withMissing(names: readonly string[]): ProjectTree {
		let tree: ProjectTree = this;
		for (const name of names) if (!tree.has(name)) tree = tree.added(name, { parent: null, before: null });
		return tree;
	}

	/** A new project at `place`; a name the tree has, a parent or a `before` it lacks: the tree as it is. */
	added(name: string, place: TreePlace, note: string | null = null): ProjectTree {
		if (this.has(name) || !this.fits(place)) return this;
		return new ProjectTree(inserted(this.roots, { name, note, folder: false, children: [] }, place));
	}

	/** The project with its subprojects moved to `place`; never into itself or below it. */
	moved(name: string, place: TreePlace): ProjectTree {
		const found = this.find(name);
		if (!found || !this.fits(place)) return this;
		const into = place.parent === null ? null : this.find(place.parent);
		if (into && into.path.some((n) => projectKey(n) === projectKey(found.node.name))) return this;
		if (place.before !== null && projectKey(place.before) === projectKey(found.node.name)) return this;
		const without = removed(this.roots, found.node.name);
		const tree = new ProjectTree(inserted(without, found.node, place));
		return tree.same(this) ? this : tree;
	}

	/** The project renamed; a blank name, or one another project has, leaves the tree as it is. */
	renamed(from: string, to: string): ProjectTree {
		const found = this.find(from);
		const taken = this.find(to);
		if (!found || (taken && taken.node !== found.node)) return this;
		return new ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, name: to })));
	}

	/** The note attached to a project (its link), or taken off with null. */
	withNote(name: string, note: string | null): ProjectTree {
		const found = this.find(name);
		if (!found || found.node.note === note) return this;
		return new ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, note })));
	}

	/** The project made a folder, or a project again. */
	withFolder(name: string, folder: boolean): ProjectTree {
		const found = this.find(name);
		if (!found || found.node.folder === folder) return this;
		return new ProjectTree(mapped(this.roots, found.node.name, (node) => ({ ...node, folder })));
	}

	/** The project gone from the tree, its subprojects lifted a level into its place, in their order. */
	deleted(name: string): ProjectTree {
		const found = this.find(name);
		if (!found) return this;
		return new ProjectTree(lifted(this.roots, found.node.name));
	}

	same(other: ProjectTree): boolean {
		return treeLines(this, "\t").join("\n") === treeLines(other, "\t").join("\n");
	}

	/** The place names a parent the tree has and a `before` among that parent's subprojects. */
	private fits(place: TreePlace): boolean {
		const siblings = place.parent === null ? this.roots : this.find(place.parent)?.node.children;
		if (!siblings) return false;
		return place.before === null || siblings.some((n) => projectKey(n.name) === projectKey(place.before!));
	}
}

function removed(nodes: readonly ProjectNode[], name: string): ProjectNode[] {
	return nodes.filter((n) => n.name !== name).map((n) => ({ ...n, children: removed(n.children, name) }));
}

function lifted(nodes: readonly ProjectNode[], name: string): ProjectNode[] {
	return nodes.flatMap((n) => (n.name === name ? n.children : [{ ...n, children: lifted(n.children, name) }]));
}

function inserted(nodes: readonly ProjectNode[], node: ProjectNode, place: TreePlace): ProjectNode[] {
	if (place.parent === null) return into(nodes, node, place.before);
	return nodes.map((n) => (projectKey(n.name) === projectKey(place.parent!) ? { ...n, children: into(n.children, node, place.before) } : { ...n, children: inserted(n.children, node, place) }));
}

function into(siblings: readonly ProjectNode[], node: ProjectNode, before: string | null): ProjectNode[] {
	const at = before === null ? -1 : siblings.findIndex((n) => projectKey(n.name) === projectKey(before));
	return at < 0 ? [...siblings, node] : [...siblings.slice(0, at), node, ...siblings.slice(at)];
}

function mapped(nodes: readonly ProjectNode[], name: string, change: (node: ProjectNode) => ProjectNode): ProjectNode[] {
	return nodes.map((n) => (n.name === name ? change(n) : { ...n, children: mapped(n.children, name, change) }));
}
