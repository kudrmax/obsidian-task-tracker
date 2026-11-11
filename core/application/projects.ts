import { noteTags } from "../domain/NoteTags";
import { projectKey } from "../domain/Project";
import { type PlacedProject, type ProjectTree } from "../domain/ProjectTree";
import { taskProjects } from "../domain/ProjectWrites";
import type { TaskDocument } from "../domain/TaskDocument";
import type { ProjectNote, ProjectRef } from "./contracts";

/** The title of the tasks without a project. */
export const NO_PROJECT = "No project";

/** The projects the screens know: the file's tree, and each project a task names that the tree lacks, last at the top. */
export function projectTreeOf(doc: TaskDocument): ProjectTree {
	return doc.projectTree().withMissing(taskProjects(doc));
}

/** The projects of a tree as the screens name them: by name, with their path and their note. */
export class ProjectIndex {
	private readonly byKey: ReadonlyMap<string, PlacedProject>;

	constructor(readonly tree: ProjectTree) {
		this.byKey = new Map(tree.all().map((placed) => [projectKey(placed.node.name), placed]));
	}

	/** The project named `name` as a card shows it (`mark`); a name the tree lacks stands at its top; null for none. */
	refOf(name: string | null, mark = true): ProjectRef | null {
		if (name === null) return null;
		const placed = this.byKey.get(projectKey(name));
		if (!placed) return { name, path: [name], note: null, canOpenNote: false, mark };
		return refOfPlaced(placed, mark);
	}

	/** Every project of the tree, in its order. */
	known(): readonly ProjectRef[] {
		return this.tree.all().map((placed) => refOfPlaced(placed, true));
	}

	placed(): readonly PlacedProject[] {
		return this.tree.all();
	}
}

export function refOfPlaced(placed: PlacedProject, mark = true): ProjectRef {
	const { name, note } = placed.node;
	return { name, path: placed.path, note, canOpenNote: note !== null, mark };
}

/** A note's tags, as the host reads them from its properties and its body: what the one move to projects reads. */
export interface NoteTags {
	readonly name: string;
	readonly path: string;
	readonly link: string;
	readonly tags: readonly string[];
}

/** A tag as the setting and a note write it, compared: no `#`, case aside. */
function bareTag(tag: string): string {
	return tag.trim().replace(/^#/, "").toLowerCase();
}

/** A note had the project tag, exactly, in its properties or its text; a nested child tag is not it. */
export function hasProjectTag(tags: readonly string[], tag: string): boolean {
	const wanted = bareTag(tag);
	return wanted !== "" && tags.some((t) => bareTag(t) === wanted);
}

/** The notes that were projects (with the tag), by name: what the one move to projects attaches, from the notes' tags. */
export function projectNotesOf(notes: readonly NoteTags[], tag: string): readonly ProjectNote[] {
	return byName(notes.filter((note) => hasProjectTag(note.tags, tag)).map(({ name, path, link }) => ({ name, path, link })));
}

/** A note as a host without Obsidian's metadata reads it: its path in the vault, and its text or the tags read from it before. */
export interface NoteText {
	readonly path: string;
	readonly text?: string;
	readonly tags?: readonly string[];
}

/** `projectNotesOf` over notes read as texts, each linked as Obsidian writes it: by its name, by its path when two share it. */
export function projectNotesOfTexts(notes: readonly NoteText[], tag: string): readonly ProjectNote[] {
	const names = new Map<string, number>();
	for (const note of notes) names.set(projectKey(nameOfPath(note.path)), (names.get(projectKey(nameOfPath(note.path))) ?? 0) + 1);
	const read = [...notes]
		.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
		.map((note): NoteTags => {
			const name = nameOfPath(note.path);
			const link = (names.get(projectKey(name)) ?? 0) > 1 ? note.path.replace(/\.md$/i, "") : name;
			return { name, path: note.path, link, tags: note.tags ?? noteTags(note.text ?? "") };
		});
	return projectNotesOf(read, tag);
}

function nameOfPath(path: string): string {
	return (path.split("/").pop() ?? path).replace(/\.md$/i, "");
}

function byName<T extends { readonly name: string }>(list: readonly T[]): T[] {
	return [...list].sort((a, b) => {
		const x = projectKey(a.name);
		const y = projectKey(b.name);
		return x < y ? -1 : x > y ? 1 : 0;
	});
}
