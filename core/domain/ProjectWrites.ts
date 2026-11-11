import { priorityOfText } from "./Priority";
import { projectKey, uniqueNames } from "./Project";
import { type ProjectTree, type TreePlace } from "./ProjectTree";
import { flatten, type TaskDocument, type TaskEntry } from "./TaskDocument";

/** A note that was a project before projects lived in the tasks file: its name and the link Obsidian writes for it. */
export interface LegacyProjectNote {
	readonly name: string;
	readonly link: string;
}

/** The mark a result's line started with before results went. */
export const LEGACY_RESULT_MARK = "🎯";

/** Every project the tasks name, each once, in the file's order: a subtask's are its parent's, so only tasks count. */
export function taskProjects(doc: TaskDocument): readonly string[] {
	return uniqueNames(doc.allTasks().flatMap((entry) => entry.task.projects));
}

/**
 * The file with every project a task names in its tree: one the tree lacks (typed by hand) goes last at the top level. A
 * file whose tasks name none and that has no tree stays as it is.
 */
export function withTasksInTree(doc: TaskDocument): TaskDocument {
	const named = taskProjects(doc);
	if (named.length === 0) return doc;
	const tree = doc.projectTree();
	const full = tree.withMissing(named);
	return doc.hasProjectTree() && full === tree ? doc : doc.withProjectTree(full);
}

/**
 * The move to projects in the tasks file, once, on a file without `## Projects`: each project note becomes a top-level
 * project with its note attached, by name; each name a task's field gives that no note has, a project without a note;
 * every task line with a project is written anew, its field plain; every line starting with the result mark loses it.
 * Nothing of this to do (no note, no project, no mark): the file as it is.
 */
export function movedToProjects(doc: TaskDocument, notes: readonly LegacyProjectNote[], resultMark: string = LEGACY_RESULT_MARK): TaskDocument {
	if (doc.hasProjectTree()) return doc;
	const all = flatten(doc.allTasks());
	const marked = all.filter((entry) => startsWithMark(entry.task.text, resultMark));
	const fielded = all.filter((entry) => entry.task.projects.length > 0);
	if (notes.length === 0 && marked.length === 0 && fielded.length === 0) return doc;
	const byName = [...notes].sort((a, b) => (projectKey(a.name) < projectKey(b.name) ? -1 : projectKey(a.name) > projectKey(b.name) ? 1 : 0));
	let tree: ProjectTree = doc.projectTree();
	for (const note of byName) tree = tree.added(note.name, { parent: null, before: null }, note.link);
	tree = tree.withMissing(taskProjects(doc));
	const prefixes = doc.priorityPrefixes();
	const rewritten = doc.rewrittenLines([...new Set([...marked, ...fielded])], (task) => {
		if (!startsWithMark(task.text, resultMark)) return task;
		const rest = task.text.slice(resultMark.length).trimStart();
		return task.priority === null ? { ...task, ...priorityOfText(rest, prefixes) } : { ...task, text: rest };
	});
	return rewritten.withProjectTree(tree);
}

function startsWithMark(text: string, mark: string): boolean {
	return mark !== "" && text.startsWith(`${mark} `) && text.slice(mark.length).trim() !== "";
}

/** The project renamed in the tree and in every task's fields (subtask lines too); a name the tree has for another: nothing. */
export function renameProject(doc: TaskDocument, from: string, to: string): TaskDocument {
	const tree = doc.projectTree().withMissing(taskProjects(doc));
	const renamed = tree.renamed(from, to);
	if (renamed === tree) return doc;
	const key = projectKey(from);
	const named = flatten(doc.allTasks()).filter((entry) => entry.task.projects.some((p) => projectKey(p) === key));
	const rewritten = doc.replaceAll(named.map((entry) => [entry, { ...entry.task, projects: uniqueNames(entry.task.projects.map((p) => (projectKey(p) === key ? to : p))) }] as const));
	return rewritten.withProjectTree(renamed);
}

/** A new project at `place` of the tree (the tasks' own projects kept in it); a name it has: nothing. */
export function addProject(doc: TaskDocument, name: string, place: TreePlace): TaskDocument {
	const tree = doc.projectTree().withMissing(taskProjects(doc));
	const added = tree.added(name, place);
	return added === tree ? doc : doc.withProjectTree(added);
}

/** The project with its subprojects to `place`: reordered, nested or taken out to the top. */
export function moveProject(doc: TaskDocument, name: string, place: TreePlace): TaskDocument {
	const tree = doc.projectTree().withMissing(taskProjects(doc));
	const moved = tree.moved(name, place);
	return moved === tree ? doc : doc.withProjectTree(moved);
}

/** The note attached to the project by its link, or taken off with null; the note's file is never touched. */
export function setProjectNote(doc: TaskDocument, name: string, note: string | null): TaskDocument {
	const tree = doc.projectTree().withMissing(taskProjects(doc));
	const changed = tree.withNote(name, note);
	return changed === tree ? doc : doc.withProjectTree(changed);
}

/** The top-level task a project change of `entry` writes: a subtask's projects are its top task's. */
export function projectHolder(doc: TaskDocument, entry: TaskEntry): TaskEntry {
	return entry.path.length === 0 ? entry : doc.find(entry.section, entry.index, [])!;
}
