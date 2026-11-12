import type { GroupedList } from "../domain/Lists";
import { namesProject, projectKey } from "../domain/Project";
import type { ProjectTree } from "../domain/ProjectTree";
import type { GroupName } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import type { ProjectsNodeId, TaskKey } from "./contracts";
import { projectNodeOf, projectOfNode, projectStatuses } from "./projectsScreen";
import { keyOf } from "./taskKeys";

/** Which tasks a node of the tree lets through. */
export type TaskTest = (entry: TaskEntry) => boolean;

/**
 * The tasks a node lets through, a subtask going with its task: a project its branch's (its own and every subproject's
 * at any depth; with `subprojects` off its own alone), All every task (no filter), No project every task without one,
 * Done every task of a done project.
 */
export function filterTest(node: ProjectsNodeId, tree: ProjectTree, doc: TaskDocument, subprojects: boolean): TaskTest {
	if (node === "all") return () => true;
	if (node === "none") return (entry) => entry.task.projects.length === 0;
	const names = node === "done" ? doneNames(tree, doc) : shownNames(node, tree, doc, subprojects);
	return (entry) => names.some((name) => namesProject(entry.task.projects, name));
}

/**
 * Whether the Subprojects setting means anything under `node`: a project with subprojects as the panel draws its branch,
 * a live project's that aren't done, a done project's all (`doc` null: the statuses unknown, every one). A folder has no
 * tasks of its own, so it always shows its branch.
 */
export function hasSubprojects(node: ProjectsNodeId | null | undefined, tree: ProjectTree, doc: TaskDocument | null): boolean {
	const name = node === null || node === undefined ? null : projectOfNode(node);
	const found = name === null ? null : tree.find(name);
	if (found === null || found.node.folder || found.node.children.length === 0) return false;
	if (doc === null) return true;
	const statuses = projectStatuses(tree, doc);
	const done = (project: string) => statuses.get(projectKey(project)) === "done";
	return done(found.node.name) || found.node.children.some((child) => !done(child.name));
}

/** The projects a project's node shows: its branch, or with `subprojects` off (a folder aside) itself alone. */
function shownNames(node: ProjectsNodeId, tree: ProjectTree, doc: TaskDocument, subprojects: boolean): readonly string[] {
	if (subprojects || !hasSubprojects(node, tree, doc)) return branchNames(node, tree);
	const found = tree.find(projectOfNode(node) ?? "");
	return found ? [found.node.name] : [];
}

function branchNames(node: ProjectsNodeId, tree: ProjectTree): readonly string[] {
	const found = tree.find(projectOfNode(node) ?? "");
	if (!found) return [];
	return tree.all().filter((p) => p.path.length >= found.path.length && p.path.slice(0, found.path.length).every((n, i) => projectKey(n) === projectKey(found.path[i]))).map((p) => p.node.name);
}

function doneNames(tree: ProjectTree, doc: TaskDocument): readonly string[] {
	const statuses = projectStatuses(tree, doc);
	return tree.all().filter((p) => statuses.get(projectKey(p.node.name)) === "done").map((p) => p.node.name);
}

/**
 * Where a task let go or typed at the end of a section of a filtered list goes: right after the last task of that section
 * the filter shows (the carried ones aside), before the task that follows it in the file; null (the section's end) when the
 * filter shows none there or the last shown one ends the section. So the task stands among its project's, not after
 * tasks the screen hides.
 */
export function afterShown(doc: TaskDocument, list: GroupedList, group: GroupName, shows: TaskTest, carried: ReadonlySet<string> = new Set()): TaskKey | null {
	const tasks = doc.tasks(list).filter((entry) => entry.group === group);
	let last = -1;
	tasks.forEach((entry, i) => {
		if (!carried.has(entry.id) && shows(entry)) last = i;
	});
	const next = last < 0 ? undefined : tasks.slice(last + 1).find((entry) => !carried.has(entry.id));
	return next ? keyOf(next) : null;
}

/**
 * The project a card of the filtered funnel is shown under, what a drop of it on the tree gives way (`ProjectsDrop.from`):
 * under a project, the first of the task's projects it shows (its branch, or itself with `subprojects` off); else, as
 * under All, its first project; none without one.
 */
export function shownUnder(entry: TaskEntry, node: ProjectsNodeId | null, tree: ProjectTree, doc: TaskDocument, subprojects: boolean): string | null {
	const projects = entry.task.projects;
	const name = node === null ? null : projectOfNode(node);
	const branch = name === null ? [] : shownNames(projectNodeOf(name), tree, doc, subprojects);
	const own = branch.length > 0 ? projects.find((p) => namesProject(branch, p)) : undefined;
	const first = own ?? projects[0];
	return first === undefined ? null : (tree.find(first)?.node.name ?? first);
}

/**
 * The project whose attached note is at `path` (from the vault's folder, `.md` and all): its link, without an alias or a
 * heading, names the file by its path without `.md` or by its end (Obsidian's shortest link), case aside. Null: no project.
 */
export function noteProject(path: string, tree: ProjectTree): string | null {
	const file = path.replace(/\.md$/i, "").toLowerCase();
	const found = tree.all().find(({ node }) => {
		if (node.note === null) return false;
		const link = node.note.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "").toLowerCase();
		return link !== "" && (file === link || file.endsWith(`/${link}`));
	});
	return found ? found.node.name : null;
}
