import type { DayBoundary } from "../domain/DayBoundary";
import { namesProject, projectKey } from "../domain/Project";
import type { PlacedProject, ProjectNode, ProjectTree, TreePlace } from "../domain/ProjectTree";
import { hasOwnTasks } from "../domain/ProjectWrites";
import { isOpen, type LocalDate, type SectionKey } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import { projectName } from "../domain/Project";
import { dayOf } from "../domain/operations";
import type {
	MenuFrom,
	ProjectMenu,
	ProjectRef,
	ProjectsCard,
	ProjectsLanding,
	ProjectsListRow,
	ProjectsNewTask,
	ProjectsNodeId,
	ProjectsRow,
	ProjectsScreenState,
	ProjectsSection,
	ProjectsStage,
	ProjectStatus,
	ProjectsView,
	TaskItem,
} from "./contracts";
import { dueLabel } from "./dayLabels";
import { NO_PROJECT, refOfPlaced } from "./projects";
import { dropOf } from "./projectsLift";

/** The words of the Projects screen, the same in every frontend. */
export const PROJECTS_WORDS = {
	all: "All",
	none: NO_PROJECT,
	done: "Done",
	today: "Today",
	byProject: "By project",
	byStage: "By stage",
	noTasks: "No tasks",
	rename: "Rename",
	note: "Note",
	attach: "Attach note…",
	detach: "Detach",
	folder: "Folder",
	folderReason: "Has tasks of its own",
	deleteProject: "Delete project",
	deleteMessage: "Its tasks stay; they just lose this project.",
	deleteConfirm: "Delete",
	deleteCancel: "Cancel",
} as const;

const PROJECT_PREFIX = "project:";

/** The node of the project named `name`. */
export function projectNodeOf(name: string): ProjectsNodeId {
	return `${PROJECT_PREFIX}${name}`;
}

/** The project a node names; null for All, No project and Done. */
export function projectOfNode(node: ProjectsNodeId): string | null {
	return node.startsWith(PROJECT_PREFIX) ? node.slice(PROJECT_PREFIX.length) : null;
}

function sameNode(a: ProjectsNodeId, b: ProjectsNodeId): boolean {
	const x = projectOfNode(a);
	const y = projectOfNode(b);
	return x !== null && y !== null ? projectKey(x) === projectKey(y) : a === b;
}

/** A task of the funnel or of Done: a task of the file, not a subtask. */
function tasksOf(doc: TaskDocument): readonly TaskEntry[] {
	return doc.allTasks();
}

/** The tasks that count for a project: open ones in the funnel, closed ones wherever they lie. */
function counts(entry: TaskEntry): boolean {
	return isOpen(entry.task.status) ? entry.section !== "done" : true;
}

/**
 * Each project's state, by its key, from its tasks and its subprojects': active, its branch has an open task, in any
 * stage (Inbox, Backlog, Soon, Today); waiting (its name grey), its branch has no open task at all, yet a project
 * without a task in it (a new project, a folder of empty subprojects); done, every task of its branch is closed and
 * every subproject is done.
 */
export function projectStatuses(tree: ProjectTree, doc: TaskDocument): ReadonlyMap<string, ProjectStatus> {
	const tasks = tasksOf(doc).filter(counts);
	const statuses = new Map<string, ProjectStatus>();
	const visit = (node: ProjectNode): { status: ProjectStatus; tasks: number } => {
		const children = node.children.map(visit);
		const own = tasks.filter((entry) => namesProject(entry.task.projects, node.name));
		const total = own.length + children.reduce((sum, child) => sum + child.tasks, 0);
		const status: ProjectStatus =
			own.some((e) => isOpen(e.task.status)) || children.some((c) => c.status === "active")
				? "active"
				: total === 0 || children.some((c) => c.status !== "done")
					? "waiting"
					: "done";
		statuses.set(projectKey(node.name), status);
		return { status, tasks: total };
	};
	tree.roots.forEach(visit);
	return statuses;
}

/** What the screen is made of: the file, the device's state, and how a task becomes a card. */
export interface ProjectsInput {
	readonly doc: TaskDocument | null;
	readonly tree: ProjectTree;
	readonly today: LocalDate;
	readonly boundary: DayBoundary;
	readonly state: ProjectsScreenState;
	/** The task as a card of the screen draws it (its projects without the folder mark). */
	readonly item: (entry: TaskEntry) => TaskItem;
	/** The name a list goes by. */
	readonly listName: (list: SectionKey) => string;
	/** The node shown, by project, whatever the device chose (`projectsScreen(node)`); left out, the device's in its segment. */
	readonly node?: ProjectsNodeId;
}

/** The node chosen: the device's, while it still names a node of the tree; All otherwise. */
export function selectedNode(state: ProjectsScreenState, tree: ProjectTree): ProjectsNodeId {
	return chosenNode(state, tree) ?? "all";
}

/** The node chosen, the funnel's filter: the device's, in the tree's spelling, while it still names a node of the tree; none otherwise (All included). */
export function chosenNode(state: ProjectsScreenState, tree: ProjectTree): ProjectsNodeId | null {
	return filterNode(state.selected, tree);
}

/** `node` as a filter (`nodeIn`): All is every task, no filter (Max, 2026-11-12), so null as none is. */
export function filterNode(node: ProjectsNodeId | null | undefined, tree: ProjectTree): ProjectsNodeId | null {
	return node === "all" ? null : nodeIn(node, tree);
}

/** `node` as the tree has it: a project's in its spelling, All, No project, Done; null for none and a project the tree lacks. */
export function nodeIn(node: ProjectsNodeId | null | undefined, tree: ProjectTree): ProjectsNodeId | null {
	if (node === null || node === undefined) return null;
	const name = projectOfNode(node);
	if (name === null) return node === "all" || node === "none" || node === "done" ? node : null;
	const found = tree.find(name);
	return found ? projectNodeOf(found.node.name) : null;
}

function isFolded(state: ProjectsScreenState, name: string): boolean {
	return (state.folded ?? []).some((node) => sameNode(node, projectNodeOf(name)));
}

/** The Projects screen. */
export function projectsView(input: ProjectsInput): ProjectsView {
	const { tree, state } = input;
	const statuses = input.doc ? projectStatuses(tree, input.doc) : new Map<string, ProjectStatus>();
	const statusOf = (name: string): ProjectStatus => statuses.get(projectKey(name)) ?? "waiting";
	const fixed = input.node === undefined ? null : nodeIn(input.node, tree);
	const selected = fixed ?? selectedNode(state, tree);
	const rows = treeRows(tree, state, selected, statusOf, (node) => input.doc !== null && nodeReorders(node, statusOf));
	const parts = input.doc ? sectionsOf(input, input.doc, selected, statusOf) : [];
	const name = projectOfNode(selected);
	const placed = name === null ? null : tree.find(name);
	return {
		rows,
		selected,
		title: placed ? placed.node.name : selected === "none" ? PROJECTS_WORDS.none : selected === "done" ? PROJECTS_WORDS.done : PROJECTS_WORDS.all,
		menu: placed ? projectMenu(refOfPlaced(placed, false), input.doc !== null && hasOwnTasks(input.doc, placed.node.name)) : null,
		sections: parts,
		newTask: selected === "done" || (placed !== null && (placed.node.folder || statusOf(placed.node.name) === "done")) ? null : inInbox(placed?.node.name ?? null),
		emptyLabel: PROJECTS_WORDS.noTasks,
		missing: input.doc === null,
		reorders: input.doc !== null && nodeReorders(selected, statusOf),
	};
}

/** The panel's rows: the tree with the filter's row chosen, All's without a filter (All is no filter). */
export function panelRows(tree: ProjectTree, doc: TaskDocument | null, state: ProjectsScreenState): ProjectsRow[] {
	const statuses = doc ? projectStatuses(tree, doc) : new Map<string, ProjectStatus>();
	const statusOf = (name: string): ProjectStatus => statuses.get(projectKey(name)) ?? "waiting";
	return treeRows(tree, state, selectedNode(state, tree), statusOf, (node) => doc !== null && nodeReorders(node, statusOf));
}

/** What is drawn over the tasks a node filters: its name, a project's menu, and the project a task typed there is given. */
export interface NodeHeader {
	readonly title: string;
	readonly menu: ProjectMenu | null;
	/** Null for All, No project, Done, a folder and a done project. */
	readonly project: string | null;
	/** Done or a done project: only closed tasks show. */
	readonly closed: boolean;
}

/** The header of `node`, a node of the tree (`nodeIn`). */
export function nodeHeader(node: ProjectsNodeId, tree: ProjectTree, doc: TaskDocument | null): NodeHeader {
	const name = projectOfNode(node);
	const placed = name === null ? null : tree.find(name);
	if (!placed) return { title: node === "none" ? PROJECTS_WORDS.none : node === "done" ? PROJECTS_WORDS.done : PROJECTS_WORDS.all, menu: null, project: null, closed: node === "done" };
	const done = doc !== null && projectStatuses(tree, doc).get(projectKey(placed.node.name)) === "done";
	return {
		title: placed.node.name,
		menu: projectMenu(refOfPlaced(placed, false), doc !== null && hasOwnTasks(doc, placed.node.name)),
		project: placed.node.folder || done ? null : placed.node.name,
		closed: done,
	};
}

/** The cross over the filtered tasks: nothing chosen. */
export function cleared(state: ProjectsScreenState): ProjectsScreenState {
	if (state.selected === undefined) return state;
	const { selected: _gone, ...rest } = state;
	return rest;
}

/** A node's list takes drops: every node but Done and a done project, whose closed tasks stay. */
function nodeReorders(node: ProjectsNodeId, statusOf: (name: string) => ProjectStatus): boolean {
	const name = projectOfNode(node);
	return node !== "done" && !(name !== null && statusOf(name) === "done");
}

/** The project menu; `ownTasks`: the project has tasks of its own, so it can't be made a folder. */
function projectMenu(project: ProjectRef, ownTasks: boolean): ProjectMenu {
	const locked = !project.folder && ownTasks;
	return {
		project,
		renameLabel: PROJECTS_WORDS.rename,
		noteLabel: PROJECTS_WORDS.note,
		note: project.note === null ? null : { link: project.note, name: projectName(project.note.split("|")[0].split("#")[0]) },
		attachLabel: PROJECTS_WORDS.attach,
		detachLabel: PROJECTS_WORDS.detach,
		folder: { label: PROJECTS_WORDS.folder, on: project.folder, disabled: locked, reason: locked ? PROJECTS_WORDS.folderReason : null },
		delete: {
			label: PROJECTS_WORDS.deleteProject,
			title: `Delete “${project.name}”?`,
			message: PROJECTS_WORDS.deleteMessage,
			confirm: PROJECTS_WORDS.deleteConfirm,
			cancel: PROJECTS_WORDS.deleteCancel,
			destructive: true,
		},
	};
}

function inInbox(project: string | null): ProjectsNewTask {
	return { place: { kind: "list", list: "inbox", group: null, before: null }, project };
}

/**
 * The rows of the tree: All, the live projects (a folded branch left out), No project, Done and, open, the done projects.
 * `reorders` says whether a node's list takes drops: a row opens under a held card when it takes the card, its list takes
 * drops and it is not chosen.
 */
function treeRows(tree: ProjectTree, state: ProjectsScreenState, selected: ProjectsNodeId, statusOf: (name: string) => ProjectStatus, reorders: (node: ProjectsNodeId) => boolean): ProjectsRow[] {
	const row = (fields: Omit<ProjectsRow, "opensOnHover">): ProjectsRow => ({ ...fields, opensOnHover: fields.acceptsTask && !fields.selected && reorders(fields.node) });
	const rows: ProjectsRow[] = [row(fixedRow("all", PROJECTS_WORDS.all, selected, false, false))];
	const walk = (nodes: readonly ProjectNode[], path: readonly string[], depth: number, done: boolean) => {
		for (const node of nodes) {
			if ((statusOf(node.name) === "done") !== done) continue;
			const branch = node.children.filter((child) => (statusOf(child.name) === "done") === done);
			const folded = branch.length > 0 && isFolded(state, node.name);
			const own = [...path, node.name];
			const status = statusOf(node.name);
			rows.push(row({
				node: projectNodeOf(node.name),
				kind: "project",
				title: node.name,
				depth,
				tile: depth === 0,
				waiting: status === "waiting",
				muted: status !== "active",
				status,
				selected: sameNode(selected, projectNodeOf(node.name)),
				hasBranch: branch.length > 0,
				folded,
				project: refOfPlaced({ node, path: own }, false),
				acceptsTask: !node.folder,
				canLift: !done,
				unfoldsOnHover: folded,
			}));
			if (!folded) walk(node.children, own, depth + 1, done);
		}
	};
	walk(tree.roots, [], 0, false);
	rows.push(row(fixedRow("none", PROJECTS_WORDS.none, selected, false, true)));
	const doneTops = doneRoots(tree, statusOf);
	const open = state.doneOpen === true;
	rows.push(row({ ...fixedRow("done", PROJECTS_WORDS.done, selected, doneTops.length > 0, false), folded: doneTops.length > 0 && !open }));
	if (open) for (const top of doneTops) walkDone(top, rows, state, selected, statusOf, 1, row);
	return rows;
}

/** The done projects at the top of their done branches: a done project whose parent is not done, or at the top. */
function doneRoots(tree: ProjectTree, statusOf: (name: string) => ProjectStatus): PlacedProject[] {
	return tree.all().filter((placed) => {
		if (statusOf(placed.node.name) !== "done") return false;
		const parent = placed.path.length > 1 ? placed.path[placed.path.length - 2] : null;
		return parent === null || statusOf(parent) !== "done";
	});
}

function walkDone(placed: PlacedProject, rows: ProjectsRow[], state: ProjectsScreenState, selected: ProjectsNodeId, statusOf: (name: string) => ProjectStatus, depth: number, row: (fields: Omit<ProjectsRow, "opensOnHover">) => ProjectsRow): void {
	const { node, path } = placed;
	const folded = node.children.length > 0 && isFolded(state, node.name);
	rows.push(row({
		node: projectNodeOf(node.name),
		kind: "project",
		title: node.name,
		depth,
		tile: false,
		waiting: false,
		muted: true,
		status: statusOf(node.name),
		selected: sameNode(selected, projectNodeOf(node.name)),
		hasBranch: node.children.length > 0,
		folded,
		project: refOfPlaced(placed, false),
		acceptsTask: !node.folder,
		canLift: false,
		unfoldsOnHover: folded,
	}));
	if (!folded) for (const child of node.children) walkDone({ node: child, path: [...path, child.name] }, rows, state, selected, statusOf, depth + 1, row);
}

function fixedRow(node: "all" | "none" | "done", title: string, selected: ProjectsNodeId, hasBranch: boolean, acceptsTask: boolean): Omit<ProjectsRow, "opensOnHover"> {
	return { node, kind: node, title, depth: 0, tile: true, waiting: false, muted: node !== "all", status: null, selected: selected === node, hasBranch, folded: false, project: null, acceptsTask, canLift: false, unfoldsOnHover: false };
}

/** The stage a task stands at: its list, Now as Today; Done for a closed one. */
type Stage = "today" | "soon" | "inbox" | "backlog" | "done";
/** The funnel's order: Inbox, Backlog, Soon, Today, then Done for closed tasks. */
const STAGE_ORDER: readonly Stage[] = ["inbox", "backlog", "soon", "today", "done"];

function stageOf(entry: TaskEntry): Stage {
	if (!isOpen(entry.task.status) || entry.section === "done") return "done";
	return entry.section === "now" ? "today" : entry.section;
}

function stageMark(entry: TaskEntry, today: LocalDate, boundary: DayBoundary): ProjectsStage {
	const stage = stageOf(entry);
	const day = dayOf(entry.task, boundary);
	if (stage === "soon" && day !== null && day !== today) return { kind: "date", date: day, label: dueLabel(day) };
	return { kind: stage };
}

function menuFromOf(entry: TaskEntry): MenuFrom {
	if (entry.section === "now") return "day";
	return entry.section;
}

/** A project's tasks: open ones in the funnel, or, for a done project, its closed ones. */
function tasksNaming(doc: TaskDocument, name: string, closed: boolean): TaskEntry[] {
	return tasksOf(doc).filter((entry) => namesProject(entry.task.projects, name) && (closed ? stageOf(entry) === "done" : stageOf(entry) !== "done"));
}

/** Funnel order: Inbox, Backlog, Soon, Today, Done; the file's order within each. */
function byStage(entries: readonly TaskEntry[]): TaskEntry[] {
	const rank = (entry: TaskEntry) => STAGE_ORDER.indexOf(stageOf(entry));
	return entries.map((entry, i) => ({ entry, i })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.i - b.i).map(({ entry }) => entry);
}

/** A card before its part names it (`part` gives it its id). */
type PartCard = Omit<ProjectsCard, "id">;

function cardOf(input: ProjectsInput, entry: TaskEntry, from: string | null): PartCard {
	const item = input.item(entry);
	return {
		item,
		stage: stageMark(entry, input.today, input.boundary),
		from,
		drop: dropOf(item, from),
		menuFrom: menuFromOf(entry),
		canDrop: item.open,
	};
}

/**
 * The chosen node's tasks in parts, by project. Where cards can be dropped, every part a drop can go to shows, empty too:
 * each live subproject, the node's own part; under Done and a done project an empty part is left out.
 */
function sectionsOf(input: ProjectsInput, doc: TaskDocument, selected: ProjectsNodeId, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const name = projectOfNode(selected);
	const placed = name === null ? null : input.tree.find(name);
	if (placed) return projectSections(input, doc, placed, statusOf);
	if (selected === "done") return doneSections(input, doc, statusOf);
	if (selected === "none") {
		const loose = tasksOf(doc).filter((entry) => entry.task.projects.length === 0 && stageOf(entry) !== "done");
		return shown([part("none", null, [], 0, byStage(loose).map((e) => cardOf(input, e, null)), inInbox(null))], true);
	}
	return allSections(input, doc, statusOf);
}

/**
 * All, which is no filter (Max, 2026-11-12): every open task by its top project, a task in each top project whose branch
 * names it, shown by the first of its projects there; then No project's part, last.
 */
function allSections(input: ProjectsInput, doc: TaskDocument, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const open = tasksOf(doc).filter((entry) => stageOf(entry) !== "done");
	const tops = input.tree.roots.filter((node) => statusOf(node.name) !== "done").map((node) => input.tree.find(node.name)!);
	const parts = tops.map((top) => {
		const branch = input.tree.all().filter((p) => p.path.length >= 1 && projectKey(p.path[0]) === projectKey(top.node.name) && statusOf(p.node.name) !== "done").map((p) => p.node.name);
		const cards = byStage(open.filter((entry) => branch.some((name) => namesProject(entry.task.projects, name)))).map((entry) => {
			const by = entry.task.projects.find((p) => namesProject(branch, p));
			return cardOf(input, entry, by === undefined ? top.node.name : (input.tree.find(by)?.node.name ?? by));
		});
		return projectPart(`project:${top.node.name}`, top, top.path, 0, cards, inInbox(top.node.name));
	});
	const loose = byStage(open.filter((entry) => entry.task.projects.length === 0)).map((e) => cardOf(input, e, null));
	return shown([...parts, part("none", PROJECTS_WORDS.none, [], 0, loose, inInbox(null))], true);
}

/** A project's own tasks first, untitled, then each subproject's at any depth, in the tree's order. */
function projectSections(input: ProjectsInput, doc: TaskDocument, placed: PlacedProject, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const closed = statusOf(placed.node.name) === "done";
	const top = placed.path.length;
	const branch = input.tree.all().filter((p) => p.path.length > top && p.path.slice(0, top).every((n, i) => projectKey(n) === projectKey(placed.path[i])) && (closed || statusOf(p.node.name) !== "done"));
	const write = (project: string) => (closed ? null : inInbox(project));
	const own = projectPart(OWN, { ...placed, title: null }, [], 0, byStage(tasksNaming(doc, placed.node.name, closed)).map((e) => cardOf(input, e, placed.node.name)), write(placed.node.name));
	const subs = branch.map((p) => projectPart(`project:${p.node.name}`, p, p.path.slice(top), p.path.length - top, byStage(tasksNaming(doc, p.node.name, closed)).map((e) => cardOf(input, e, p.node.name)), write(p.node.name)));
	return shown([own, ...subs], !closed);
}

/** Done: each done project's closed tasks. */
function doneSections(input: ProjectsInput, doc: TaskDocument, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const done = input.tree.all().filter((p) => statusOf(p.node.name) === "done");
	return shown(done.map((p) => part(`project:${p.node.name}`, p.node.name, p.path, p.path.length, tasksNaming(doc, p.node.name, true).map((e) => cardOf(input, e, p.node.name)), null)), false);
}

/** The key of a project's own part, By project. */
const OWN = "own";

function part(key: string, title: string | null, path: readonly string[], depth: number, cards: readonly PartCard[], newTask: ProjectsNewTask | null, takes = true): ProjectsSection {
	const drawn = cards.map((card) => ({ id: `${key}/${card.item.id}`, ...card }));
	const rows = drawn.flatMap((card): ProjectsListRow[] => [{ id: card.id, item: card.item, level: 0, card, drop: card.drop }, ...subtaskRows(key, card.item, 1, card.from)]);
	const header = title !== null;
	return { key, group: header ? key : null, title, header, opens: header, takes, empty: drawn.length === 0, plate: false, path, depth, cards: drawn, rows, newTask };
}

/**
 * A project's part, By project, titled with its name unless `title` is null (the node's own): a folder's takes no card
 * and has no plus, and is left out with no card, as it holds only tasks given the folder by hand.
 */
function projectPart(key: string, placed: PlacedProject & { readonly title?: null }, path: readonly string[], depth: number, cards: readonly PartCard[], newTask: ProjectsNewTask | null): ProjectsSection | null {
	const { folder, name } = placed.node;
	if (folder && cards.length === 0) return null;
	return part(key, placed.title === null ? null : name, path, depth, cards, folder ? null : newTask, !folder);
}

/** A task's open subtasks as rows a level deeper, each before its own, unless they are folded away. */
function subtaskRows(key: string, item: TaskItem, level: number, from: string | null): ProjectsListRow[] {
	if (item.collapsed) return [];
	return item.subtasks.flatMap((sub) => [{ id: `${key}/${sub.id}`, item: sub, level, card: null, drop: dropOf(sub, from) }, ...subtaskRows(key, sub, level + 1, from)]);
}

/**
 * The parts shown: all of them where a drop may go (`open`), else those with a card (a folder's left out already); the
 * plate under an empty one with a header, or the only one; a header opens its part unless an untitled part that takes
 * cards stands above it (a folder's own part takes none, so the gap under it is the first subproject's).
 */
function shown(sections: readonly (ProjectsSection | null)[], open: boolean): ProjectsSection[] {
	const parts = sections.filter((s): s is ProjectsSection => s !== null);
	const kept = open ? parts : parts.filter((s) => !s.empty);
	const untitledAbove = (i: number) => kept.slice(0, i).some((s) => !s.header && s.takes);
	return kept.map((s, i) => ({ ...s, plate: s.empty && (s.header || kept.length === 1), opens: s.header && !untitledAbove(i) }));
}

/** A tap on a row: the node chosen; the chosen one's branch folded or unfolded. */
export function tapped(state: ProjectsScreenState, tree: ProjectTree, node: ProjectsNodeId): ProjectsScreenState {
	if (node === "all") return cleared(state);
	const selected = chosenNode(state, tree);
	if (selected === null || !sameNode(selected, node)) return { ...state, selected: node };
	if (node === "done") return { ...state, doneOpen: !(state.doneOpen ?? false) };
	const name = projectOfNode(node);
	if (name === null || !tree.find(name)?.node.children.length) return state;
	return withFold(state, name, !isFolded(state, name));
}

/** A tap on a row of the panel (`tapped`): on a narrow screen a tap that chose a node closes the panel, which lies over the lists. */
export function picked(state: ProjectsScreenState, tree: ProjectTree, node: ProjectsNodeId, wide: boolean): ProjectsScreenState {
	const next = tapped(state, tree, node);
	const chose = next.selected !== state.selected || node === "all";
	return !wide && chose && next.panelOpen ? { ...next, panelOpen: false } : next;
}

/** A node's branch opened without choosing it: a project's fold taken off, Done's done projects shown. */
export function unfolded(state: ProjectsScreenState, node: ProjectsNodeId): ProjectsScreenState {
	if (node === "done") return state.doneOpen ? state : { ...state, doneOpen: true };
	const name = projectOfNode(node);
	return name === null || !isFolded(state, name) ? state : withFold(state, name, false);
}

/**
 * A card held over `node`'s row of `rows`, the tree as drawn: its branch unfolded when it unfolds on hover, and it chosen
 * when it opens on hover, so the rule is the one the row was drawn with. A node without a row stays as it is.
 */
export function hovered(state: ProjectsScreenState, tree: ProjectTree, doc: TaskDocument | null, rows: readonly ProjectsRow[], node: ProjectsNodeId): ProjectsScreenState {
	const row = rows.find((r) => sameNode(r.node, node));
	if (!row) return state;
	const open = row.unfoldsOnHover ? unfolded(state, row.node) : state;
	return row.opensOnHover ? selected(open, tree, doc, row.node) : open;
}

/** The node chosen with every branch above it open, so its row shows. */
export function selected(state: ProjectsScreenState, tree: ProjectTree, doc: TaskDocument | null, node: ProjectsNodeId): ProjectsScreenState {
	if (node === "all") return cleared(state);
	const name = projectOfNode(node);
	const found = name === null ? null : tree.find(name);
	if (name !== null && !found) return state;
	let next: ProjectsScreenState = { ...state, selected: found ? projectNodeOf(found.node.name) : node };
	if (!found) return next;
	for (const above of found.path.slice(0, -1)) next = withFold(next, above, false);
	if (doc && projectStatuses(tree, doc).get(projectKey(found.node.name)) === "done") next = { ...next, doneOpen: true };
	return next;
}

export function withFold(state: ProjectsScreenState, name: string, folded: boolean): ProjectsScreenState {
	const others = (state.folded ?? []).filter((node) => !sameNode(node, projectNodeOf(name)));
	return { ...state, folded: folded ? [...others, projectNodeOf(name)] : others };
}

/** The state once a project was renamed: its node and its fold carried over to the new name. */
export function renamedIn(state: ProjectsScreenState, from: string, to: string): ProjectsScreenState {
	const carry = (node: ProjectsNodeId) => (sameNode(node, projectNodeOf(from)) ? projectNodeOf(to) : node);
	return { ...state, ...(state.selected !== undefined && { selected: carry(state.selected) }), ...(state.folded && { folded: state.folded.map(carry) }) };
}

/** The live projects' rows a gap is among, without the lifted one and its branch. */
function liveRows(rows: readonly ProjectsRow[], lifted?: ProjectsNodeId | null): { rows: ProjectsRow[]; at: (gap: number) => number } {
	const none = rows.findIndex((row) => row.kind === "none");
	const end = none < 0 ? rows.length : none;
	const kept: { row: ProjectsRow; index: number }[] = [];
	let skipping: number | null = null;
	for (let i = 0; i < end; i++) {
		const row = rows[i];
		if (row.kind !== "project") continue;
		if (skipping !== null && row.depth > skipping) continue;
		skipping = null;
		if (lifted && sameNode(row.node, lifted)) {
			skipping = row.depth;
			continue;
		}
		kept.push({ row, index: i });
	}
	return { rows: kept.map((k) => k.row), at: (gap) => kept.filter((k) => k.index < Math.min(gap, end)).length };
}

/** The depths a gap of the tree may take: from the row below's to one deeper than the row above's. */
export function projectsLevels(rows: readonly ProjectsRow[], gap: number, lifted?: ProjectsNodeId | null): { readonly min: number; readonly max: number } {
	const live = liveRows(rows, lifted);
	const i = live.at(gap);
	const above = live.rows[i - 1];
	const below = live.rows[i];
	return { min: below ? below.depth : 0, max: above ? above.depth + 1 : 0 };
}

/** Where a project let go at `gap`, at `depth`, goes: its parent and the project it goes before; the depth kept within the gap's. */
export function projectsGap(rows: readonly ProjectsRow[], gap: number, depth: number, lifted?: ProjectsNodeId | null): ProjectsLanding {
	const live = liveRows(rows, lifted);
	const i = live.at(gap);
	const { min, max } = projectsLevels(rows, gap, lifted);
	const level = Math.max(min, Math.min(max, Math.round(depth)));
	let parent: string | null = null;
	for (let k = i - 1; k >= 0 && level > 0; k--) {
		if (live.rows[k].depth === level - 1) {
			parent = live.rows[k].title;
			break;
		}
	}
	const below = live.rows[i];
	const place: TreePlace = { parent, before: below && below.depth === level ? below.title : null };
	return { place, depth: level };
}

/** How long a held card waits over a row before it unfolds or opens (`hovered`), ms. */
export const PROJECTS_HOVER_MS = 600;

/** The indent of one step of the tree, px (pt): a finger's sideways way of one step changes a lifted row's depth by one. */
export const PROJECTS_INDENT = 12;

/**
 * Where a project lifted in the tree (`lifted`), or the plus, lands at `gap`: its depth its own (the plus: the row above
 * the gap's, 0 at the top) shifted a step per `PROJECTS_INDENT` of the finger's sideways way `shift` since the lift,
 * rounded, kept within the gap's depths.
 */
export function projectsDrop(rows: readonly ProjectsRow[], gap: number, shift: number, lifted?: ProjectsNodeId | null): ProjectsLanding {
	const own = lifted ? rows.find((row) => sameNode(row.node, lifted))?.depth : undefined;
	const live = liveRows(rows, lifted);
	const above = live.rows[live.at(gap) - 1];
	const base = own ?? above?.depth ?? 0;
	return projectsGap(rows, gap, base + Math.round(shift / PROJECTS_INDENT), lifted);
}
