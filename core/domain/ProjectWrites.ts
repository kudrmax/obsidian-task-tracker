import { priorityOfText } from "./Priority";
import { projectKey, projectName, uniqueNames } from "./Project";
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
 * The notes a file that has its tree already still takes: those an old field being moved names, none whose link a tree
 * line holds already (a project renamed since keeps its note, and no duplicate comes back).
 */
function notesOfOldFields(doc: TaskDocument, notes: readonly LegacyProjectNote[], resultMark: string): readonly LegacyProjectNote[] {
	const named = new Set(oldLines(doc, resultMark).flatMap((entry) => [...entry.raw.matchAll(OLD_LINK_RE)].map((m) => projectKey(projectName(m[1])))));
	const linked = new Set(doc.projectTree().all().flatMap((p) => (p.node.note === null ? [] : [projectKey(projectName(p.node.note.split("|")[0].split("#")[0]))])));
	return notes.filter((note) => named.has(projectKey(note.name)) && !linked.has(projectKey(projectName(note.link))));
}

/**
 * The tree holds a note already: the move attached the notes once, so only the notes old fields name since come. A tree
 * without any (none yet, or one a write made before the host's notes were complete) takes them all.
 */
function attachedAny(doc: TaskDocument): boolean {
	return doc.hasProjectTree() && doc.projectTree().all().some((p) => p.node.note !== null);
}

/** An old field's link on a line. */
const OLD_LINK_RE = /(?:^|\s)\u{1F5C2}\u{FE0F}?\s+\[\[([^[\]|#]+)/gu;

/** A task line still in the old format: a `🗂️ [[Note]]` field. */
const OLD_FIELD_RE = /(?:^|\s)\u{1F5C2}\u{FE0F}?\s+\[\[/u;

/** The lines the move rewrites: an old `🗂️ [[…]]` field, or the result mark first. */
function oldLines(doc: TaskDocument, resultMark: string): TaskEntry[] {
	return flatten(doc.allTasks()).filter((entry) => OLD_FIELD_RE.test(entry.raw) || startsWithMark(entry.task.text, resultMark));
}

/**
 * The file still waits for the move to projects: it has an old `🗂️ [[…]]` field or a line starting with the result
 * mark, wherever `## Projects` stands (one written by hand stops nothing); or it has no `## Projects` while there is a
 * note that was a project, or a task with a project, to put in it.
 */
export function awaitsMove(doc: TaskDocument, notes: readonly LegacyProjectNote[], resultMark: string = LEGACY_RESULT_MARK): boolean {
	if (oldLines(doc, resultMark).length > 0) return true;
	return !doc.hasProjectTree() && (notes.length > 0 || taskProjects(doc).length > 0);
}

/**
 * The move to projects: each note that was a project becomes a top-level project with its note attached (a project of
 * that name already in the tree gets the note when it has none), by name; each name a task gives that the tree lacks, a
 * project without a note; every line with an old field is written anew, its fields plain; every line starting with the
 * result mark loses it. Run on a file that `awaitsMove` (looked at before the write that brings it), whatever else that
 * write did: a project it made in the tree stops nothing. Lines already plain are left as they are.
 */
export function movedToProjects(doc: TaskDocument, given: readonly LegacyProjectNote[], resultMark: string = LEGACY_RESULT_MARK): TaskDocument {
	const notes = attachedAny(doc) ? notesOfOldFields(doc, given, resultMark) : given;
	const byName = [...notes].sort((a, b) => (projectKey(a.name) < projectKey(b.name) ? -1 : projectKey(a.name) > projectKey(b.name) ? 1 : 0));
	let tree: ProjectTree = doc.projectTree();
	for (const note of byName) {
		const found = tree.find(note.name);
		tree = found ? (found.node.note === null ? tree.withNote(found.node.name, note.link) : tree) : tree.added(note.name, { parent: null, before: null }, note.link);
	}
	tree = tree.withMissing(taskProjects(doc));
	const prefixes = doc.priorityPrefixes();
	const rewritten = doc.rewrittenLines(oldLines(doc, resultMark), (task) => {
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

/**
 * The project gone: its line out of the tree, its subprojects lifted into its place, and its field off every task line
 * that has it (subtask lines too). No task is removed, closed or moved; the note's file is never touched. A name the tree
 * lacks: nothing.
 */
export function deleteProject(doc: TaskDocument, name: string): TaskDocument {
	const tree = doc.projectTree().withMissing(taskProjects(doc));
	const deleted = tree.deleted(name);
	if (deleted === tree) return doc;
	const key = projectKey(name);
	const named = flatten(doc.allTasks()).filter((entry) => entry.task.projects.some((p) => projectKey(p) === key));
	const rewritten = doc.replaceAll(named.map((entry) => [entry, { ...entry.task, projects: entry.task.projects.filter((p) => projectKey(p) !== key) }] as const));
	return rewritten.withProjectTree(deleted);
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

/**
 * A task's projects with `from` giving way to `to` in `from`'s place in their order (`to` there already: `from` only
 * taken off; null `to`: `from` taken off; null `from`, or one the task lacks: `to` added last), the others kept, so the
 * task's first project changes only when `from` was first.
 */
export function swappedProjects(projects: readonly string[], from: string | null, to: string | null): readonly string[] {
	const at = from === null ? -1 : projects.findIndex((p) => projectKey(p) === projectKey(from));
	const has = to !== null && projects.some((p) => projectKey(p) === projectKey(to));
	if (at < 0) return uniqueNames(to === null || has ? projects : [...projects, to]);
	const swapped = projects.flatMap((p, i) => (i !== at ? [p] : to === null || has ? [] : [to]));
	return uniqueNames(swapped);
}

/** The top-level task a project change of `entry` writes: a subtask's projects are its top task's. */
export function projectHolder(doc: TaskDocument, entry: TaskEntry): TaskEntry {
	return entry.path.length === 0 ? entry : doc.find(entry.section, entry.index, [])!;
}
