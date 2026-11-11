import type { DayBoundary } from "../domain/DayBoundary";
import { namesProject, projectKey } from "../domain/Project";
import type { PlacedProject, ProjectNode, ProjectTree, TreePlace } from "../domain/ProjectTree";
import { isOpen, type LocalDate, type SectionKey } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import { projectName } from "../domain/Project";
import { dayOf } from "../domain/operations";
import type {
	MenuFrom,
	NewTaskPlace,
	ProjectMenu,
	ProjectRef,
	ProjectsCard,
	ProjectsLanding,
	ProjectsMode,
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

/** An open task that moves: in Now or Soon, or with a date or a time. */
function moving(entry: TaskEntry): boolean {
	return isOpen(entry.task.status) && (entry.section === "now" || entry.section === "soon" || entry.task.dueDate !== null || entry.task.slot !== null);
}

/** The tasks that count for a project: open ones in the funnel, closed ones wherever they lie. */
function counts(entry: TaskEntry): boolean {
	return isOpen(entry.task.status) ? entry.section !== "done" : true;
}

/**
 * Each project's state, by its key, from its tasks and its subprojects': active, an open task of its branch moves (Now,
 * Soon, a date or a time); waiting, its branch's open tasks wait in Inbox and Backlog, or its branch has a project
 * without a task yet; done, every task of its branch is closed and every subproject is done.
 */
export function projectStatuses(tree: ProjectTree, doc: TaskDocument): ReadonlyMap<string, ProjectStatus> {
	const tasks = tasksOf(doc).filter(counts);
	const statuses = new Map<string, ProjectStatus>();
	const visit = (node: ProjectNode): { status: ProjectStatus; tasks: number } => {
		const children = node.children.map(visit);
		const own = tasks.filter((entry) => namesProject(entry.task.projects, node.name));
		const total = own.length + children.reduce((sum, child) => sum + child.tasks, 0);
		const status: ProjectStatus =
			own.some(moving) || children.some((c) => c.status === "active")
				? "active"
				: total === 0 || own.some((e) => isOpen(e.task.status)) || children.some((c) => c.status !== "done")
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
}

/** The node chosen: the device's, while it still names a node of the tree; All otherwise. */
export function selectedNode(state: ProjectsScreenState, tree: ProjectTree): ProjectsNodeId {
	const node = state.selected ?? "all";
	const name = projectOfNode(node);
	if (name === null) return node === "none" || node === "done" ? node : "all";
	const found = tree.find(name);
	return found ? projectNodeOf(found.node.name) : "all";
}

function isFolded(state: ProjectsScreenState, name: string): boolean {
	return (state.folded ?? []).some((node) => sameNode(node, projectNodeOf(name)));
}

/** The Projects screen. */
export function projectsView(input: ProjectsInput): ProjectsView {
	const { tree, state } = input;
	const statuses = input.doc ? projectStatuses(tree, input.doc) : new Map<string, ProjectStatus>();
	const statusOf = (name: string): ProjectStatus => statuses.get(projectKey(name)) ?? "waiting";
	const selected = selectedNode(state, tree);
	const mode: ProjectsMode = state.mode ?? "byProject";
	const rows = treeRows(tree, state, selected, statusOf);
	const parts = input.doc ? sectionsOf(input, input.doc, selected, mode, statusOf) : [];
	const name = projectOfNode(selected);
	const placed = name === null ? null : tree.find(name);
	return {
		rows,
		selected,
		mode,
		modes: [
			{ mode: "byProject", label: PROJECTS_WORDS.byProject },
			{ mode: "byStage", label: PROJECTS_WORDS.byStage },
		],
		title: placed ? placed.node.name : selected === "none" ? PROJECTS_WORDS.none : selected === "done" ? PROJECTS_WORDS.done : PROJECTS_WORDS.all,
		menu: placed ? projectMenu(refOfPlaced(placed, false)) : null,
		sections: parts,
		newTask: selected === "done" || (placed !== null && statusOf(placed.node.name) === "done") ? null : inInbox(placed?.node.name ?? null),
		emptyLabel: PROJECTS_WORDS.noTasks,
		missing: input.doc === null,
	};
}

function projectMenu(project: ProjectRef): ProjectMenu {
	return {
		project,
		renameLabel: PROJECTS_WORDS.rename,
		noteLabel: PROJECTS_WORDS.note,
		note: project.note === null ? null : { link: project.note, name: projectName(project.note.split("|")[0].split("#")[0]) },
		attachLabel: PROJECTS_WORDS.attach,
		detachLabel: PROJECTS_WORDS.detach,
	};
}

function inInbox(project: string | null): ProjectsNewTask {
	return { place: { kind: "list", list: "inbox", group: null, before: null }, project };
}

/** The rows of the tree: All, the live projects (a folded branch left out), No project, Done and, open, the done projects. */
function treeRows(tree: ProjectTree, state: ProjectsScreenState, selected: ProjectsNodeId, statusOf: (name: string) => ProjectStatus): ProjectsRow[] {
	const rows: ProjectsRow[] = [fixedRow("all", PROJECTS_WORDS.all, selected, false, false)];
	const walk = (nodes: readonly ProjectNode[], path: readonly string[], depth: number, done: boolean) => {
		for (const node of nodes) {
			if ((statusOf(node.name) === "done") !== done) continue;
			const branch = node.children.filter((child) => (statusOf(child.name) === "done") === done);
			const folded = branch.length > 0 && isFolded(state, node.name);
			const own = [...path, node.name];
			const status = statusOf(node.name);
			rows.push({
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
				acceptsTask: true,
				canLift: !done,
				unfoldsOnHover: folded,
			});
			if (!folded) walk(node.children, own, depth + 1, done);
		}
	};
	walk(tree.roots, [], 0, false);
	rows.push(fixedRow("none", PROJECTS_WORDS.none, selected, false, true));
	const doneTops = doneRoots(tree, statusOf);
	const open = state.doneOpen === true;
	rows.push({ ...fixedRow("done", PROJECTS_WORDS.done, selected, doneTops.length > 0, false), folded: doneTops.length > 0 && !open });
	if (open) for (const top of doneTops) walkDone(top, rows, state, selected, statusOf, 1);
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

function walkDone(placed: PlacedProject, rows: ProjectsRow[], state: ProjectsScreenState, selected: ProjectsNodeId, statusOf: (name: string) => ProjectStatus, depth: number): void {
	const { node, path } = placed;
	const folded = node.children.length > 0 && isFolded(state, node.name);
	rows.push({
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
		acceptsTask: true,
		canLift: false,
		unfoldsOnHover: folded,
	});
	if (!folded) for (const child of node.children) walkDone({ node: child, path: [...path, child.name] }, rows, state, selected, statusOf, depth + 1);
}

function fixedRow(node: "all" | "none" | "done", title: string, selected: ProjectsNodeId, hasBranch: boolean, acceptsTask: boolean): ProjectsRow {
	return { node, kind: node, title, depth: 0, tile: true, waiting: false, muted: node !== "all", status: null, selected: selected === node, hasBranch, folded: false, project: null, acceptsTask, canLift: false, unfoldsOnHover: false };
}

/** The stage a task stands at: its list, Now as Today; Done for a closed one. */
type Stage = "today" | "soon" | "inbox" | "backlog" | "done";
const STAGES: readonly Exclude<Stage, "done">[] = ["today", "soon", "inbox", "backlog"];

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

/** Funnel order: Today, Soon, Inbox, Backlog, Done; the file's order within each. */
function byStage(entries: readonly TaskEntry[]): TaskEntry[] {
	const rank = (entry: TaskEntry) => ["today", "soon", "inbox", "backlog", "done"].indexOf(stageOf(entry));
	return entries.map((entry, i) => ({ entry, i })).sort((a, b) => rank(a.entry) - rank(b.entry) || a.i - b.i).map(({ entry }) => entry);
}

function cardOf(input: ProjectsInput, entry: TaskEntry, mode: ProjectsMode, from: string | null, over: string | null): ProjectsCard {
	return {
		item: input.item(entry),
		stage: mode === "byProject" ? stageMark(entry, input.today, input.boundary) : null,
		over: mode === "byStage" ? over : null,
		from,
		menuFrom: menuFromOf(entry),
		canDrop: true,
	};
}

/** The chosen node's tasks in parts, empty parts left out. */
function sectionsOf(input: ProjectsInput, doc: TaskDocument, selected: ProjectsNodeId, mode: ProjectsMode, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const name = projectOfNode(selected);
	const placed = name === null ? null : input.tree.find(name);
	if (placed) return projectSections(input, doc, placed, mode, statusOf);
	if (selected === "done") return doneSections(input, doc, mode, statusOf);
	if (selected === "none") {
		const loose = tasksOf(doc).filter((entry) => entry.task.projects.length === 0 && stageOf(entry) !== "done");
		return mode === "byProject" ? filled([part("none", null, [], 0, byStage(loose).map((e) => cardOf(input, e, mode, null, null)), inInbox(null))]) : stageSections(input, loose.map((entry) => ({ entry, from: null, over: null })), null);
	}
	const live = input.tree.all().filter((p) => statusOf(p.node.name) !== "done");
	if (mode === "byProject") return filled(live.map((p) => part(`project:${p.node.name}`, p.node.name, p.path, p.path.length, byStage(tasksNaming(doc, p.node.name, false)).map((e) => cardOf(input, e, mode, p.node.name, null)), inInbox(p.node.name))));
	const shown = tasksOf(doc).filter((entry) => entry.task.projects.length > 0 && stageOf(entry) !== "done");
	return stageSections(
		input,
		shown.map((entry) => {
			const first = input.tree.find(entry.task.projects[0])?.node.name ?? entry.task.projects[0];
			return { entry, from: first, over: first };
		}),
		null,
	);
}

/** A project's own tasks first, untitled, then each subproject's at any depth, in the tree's order; By stage, the whole branch's by stage. */
function projectSections(input: ProjectsInput, doc: TaskDocument, placed: PlacedProject, mode: ProjectsMode, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const closed = statusOf(placed.node.name) === "done";
	const top = placed.path.length;
	const branch = input.tree.all().filter((p) => p.path.length > top && p.path.slice(0, top).every((n, i) => projectKey(n) === projectKey(placed.path[i])) && (closed || statusOf(p.node.name) !== "done"));
	const write = (project: string) => (closed ? null : inInbox(project));
	if (mode === "byProject") {
		const own = part("own", null, [], 0, byStage(tasksNaming(doc, placed.node.name, closed)).map((e) => cardOf(input, e, mode, placed.node.name, null)), write(placed.node.name));
		const subs = branch.map((p) => part(`project:${p.node.name}`, p.node.name, p.path.slice(top), p.path.length - top, byStage(tasksNaming(doc, p.node.name, closed)).map((e) => cardOf(input, e, mode, p.node.name, null)), write(p.node.name)));
		return filled([own, ...subs]);
	}
	const seen = new Set<string>();
	const shown: { entry: TaskEntry; from: string; over: string | null }[] = [];
	for (const p of [placed, ...branch]) {
		for (const entry of tasksNaming(doc, p.node.name, closed)) {
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			const own = namesProject(entry.task.projects, placed.node.name);
			shown.push({ entry, from: own ? placed.node.name : p.node.name, over: own ? null : p.node.name });
		}
	}
	return stageSections(input, shown, closed ? null : placed.node.name);
}

/** Done: each done project's closed tasks, By project; By stage, one part of them all. */
function doneSections(input: ProjectsInput, doc: TaskDocument, mode: ProjectsMode, statusOf: (name: string) => ProjectStatus): ProjectsSection[] {
	const done = input.tree.all().filter((p) => statusOf(p.node.name) === "done");
	if (mode === "byProject") return filled(done.map((p) => part(`project:${p.node.name}`, p.node.name, p.path, p.path.length, tasksNaming(doc, p.node.name, true).map((e) => cardOf(input, e, mode, p.node.name, null)), null)));
	const seen = new Set<string>();
	const shown = done.flatMap((p) => tasksNaming(doc, p.node.name, true).filter((e) => !seen.has(e.id) && (seen.add(e.id), true)).map((entry) => ({ entry, from: p.node.name, over: p.node.name })));
	return stageSections(input, shown, null);
}

/** By stage: Today, Soon, Inbox, Backlog (Done for closed tasks), each in the file's order; the plus there writes into that list with `project`. */
function stageSections(input: ProjectsInput, shown: readonly { entry: TaskEntry; from: string | null; over: string | null }[], project: string | null): ProjectsSection[] {
	const stages: readonly Stage[] = [...STAGES, "done"];
	return filled(
		stages.map((stage) => {
			const here = shown.filter((s) => stageOf(s.entry) === stage);
			const title = stage === "today" ? PROJECTS_WORDS.today : stage === "done" ? PROJECTS_WORDS.done : input.listName(stage);
			const place: NewTaskPlace | null = stage === "done" ? null : { kind: "list", list: stage === "today" ? "now" : stage, group: null, before: null };
			return part(stage, title, [], 0, here.map((s) => cardOf(input, s.entry, "byStage", s.from, s.over)), place && { place, project });
		}),
	);
}

function part(key: string, title: string | null, path: readonly string[], depth: number, cards: readonly ProjectsCard[], newTask: ProjectsNewTask | null): ProjectsSection {
	return { key, title, path, depth, cards, newTask };
}

function filled(sections: readonly ProjectsSection[]): ProjectsSection[] {
	return sections.filter((s) => s.cards.length > 0);
}

/** A tap on a row: the node chosen; the chosen one's branch folded or unfolded. */
export function tapped(state: ProjectsScreenState, tree: ProjectTree, node: ProjectsNodeId): ProjectsScreenState {
	const selected = selectedNode(state, tree);
	if (!sameNode(selected, node)) return { ...state, selected: node };
	if (node === "done") return { ...state, doneOpen: !(state.doneOpen ?? false) };
	const name = projectOfNode(node);
	if (name === null || !tree.find(name)?.node.children.length) return state;
	return withFold(state, name, !isFolded(state, name));
}

/** A node's branch opened without choosing it: a project's fold taken off, Done's done projects shown. */
export function unfolded(state: ProjectsScreenState, node: ProjectsNodeId): ProjectsScreenState {
	if (node === "done") return state.doneOpen ? state : { ...state, doneOpen: true };
	const name = projectOfNode(node);
	return name === null || !isFolded(state, name) ? state : withFold(state, name, false);
}

/** The node chosen with every branch above it open, so its row shows. */
export function selected(state: ProjectsScreenState, tree: ProjectTree, doc: TaskDocument | null, node: ProjectsNodeId): ProjectsScreenState {
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
