import type { GroupedList } from "../domain/Lists";
import { noteTags } from "../domain/NoteTags";
import { projectKey, projectName, type ProjectZone } from "../domain/Project";
import type { GroupName } from "../domain/Task";
import type { GroupingState, ListGrouping, ListSection, ProjectGroup, ProjectNote, ProjectRef, TaskItem } from "./contracts";
import type { ListPlace } from "./nesting";
import { groupKeyOf, type ListGroup, listView, projectSection, withEmptySections } from "./sections";

/** The title of the group of tasks without a project. */
export const NO_PROJECT = "No project";

/** The lists that may group their tasks by project, and whether they do until a device says otherwise. */
const GROUPING_DEFAULTS: Readonly<Record<GroupedList, boolean | null>> = { backlog: true, soon: false, inbox: null, now: null };

/** A note's tags, as the host reads them from its properties and its body. */
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

/** A note is a project when it has exactly the setting's tag, in its properties or its text; a nested child tag is not it. */
export function hasProjectTag(tags: readonly string[], tag: string): boolean {
	const wanted = bareTag(tag);
	return wanted !== "" && tags.some((t) => bareTag(t) === wanted);
}

/** The notes with the project tag, by name: what a host's `Projects` port gives, from its notes' tags. */
export function projectNotesOf(notes: readonly NoteTags[], tag: string): readonly ProjectNote[] {
	return byName(notes.filter((note) => hasProjectTag(note.tags, tag)).map(({ name, path, link }) => ({ name, path, link })));
}

/** A note as a host without Obsidian's metadata reads it: its path in the vault, and its text or the tags read from it before. */
export interface NoteText {
	readonly path: string;
	readonly text?: string;
	readonly tags?: readonly string[];
}

/**
 * The project notes of a vault read as texts: the notes with the tag (`noteTags` of each text, or its tags kept), by
 * name, each linked as Obsidian writes it: by its name, by its path without `.md` when another note of `notes` has that name.
 */
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

/** The projects the core knows: the notes with the project tag, and how a task's link reads against them. */
export class ProjectIndex {
	private readonly notes: ReadonlyMap<string, ProjectNote>;

	constructor(notes: readonly ProjectNote[]) {
		const byKey = new Map<string, ProjectNote>();
		for (const note of notes) if (!byKey.has(projectKey(note.name))) byKey.set(projectKey(note.name), note);
		this.notes = byKey;
	}

	/** The project of link text `link` as a card shows it (`mark`): the note of that name, else the name alone; null for none. */
	refOf(link: string | null, mark = true): ProjectRef | null {
		if (link === null) return null;
		const note = this.notes.get(projectKey(projectName(link)));
		if (!note) return { name: projectName(link), link, note: null, canOpenNote: false, mark };
		return { name: note.name, link: note.link, note: note.path, canOpenNote: true, mark };
	}

	/** Every project note, by name. */
	known(): readonly ProjectRef[] {
		return byName([...this.notes.values()]).map((note) => this.refOf(note.link)!);
	}
}

/** Whether `list` groups by project on this device: its own choice, else the default. */
export function groupingOn(state: GroupingState, list: GroupedList): boolean {
	const fallback = GROUPING_DEFAULTS[list];
	if (fallback === null) return false;
	return state.on?.[list] ?? fallback;
}

export function canGroup(list: GroupedList): boolean {
	return GROUPING_DEFAULTS[list] !== null;
}

/** The state with `list` switched; a list that never groups stays as it is. */
export function withGrouping(state: GroupingState, list: GroupedList, on: boolean): GroupingState {
	if (!canGroup(list)) return state;
	return { ...state, on: { ...state.on, [list]: on } };
}

export function isFolded(state: GroupingState, list: GroupedList, key: string): boolean {
	return state.folded?.[list]?.includes(key) ?? false;
}

/** The state with group `key` of `list` folded, or unfolded when it was. */
export function withFoldToggled(state: GroupingState, list: GroupedList, key: string): GroupingState {
	return withFolded(state, list, key, !isFolded(state, list, key));
}

export function withFolded(state: GroupingState, list: GroupedList, key: string, folded: boolean): GroupingState {
	const keys = (state.folded?.[list] ?? []).filter((k) => k !== key);
	return { ...state, folded: { ...state.folded, [list]: folded ? [...keys, key] : keys } };
}

/** What the screen needs to group one list. */
export interface GroupingInput {
	readonly list: GroupedList;
	/** The list's tasks as its column shows them, in file order. */
	readonly items: readonly TaskItem[];
	/** The list's sections in file order, empty ones too. */
	readonly sections: readonly ListSection[];
	readonly projects: ProjectIndex;
	readonly state: GroupingState;
}

/**
 * A list's grouping: off, none; on, a group for each project with tasks there (in Backlog for every project note too,
 * empty ones drawing «No tasks»), by name, then No project (outside Backlog only with a task or an empty section). Inside a group its tasks without a section, then its sections
 * in file order; the list's empty sections only in No project.
 */
export function listGrouping({ list, items, sections, projects, state }: GroupingInput): ListGrouping {
	const on = groupingOn(state, list);
	if (!on) return { canGroup: canGroup(list), on, groups: [] };
	const refs = new Map<string, ProjectRef>();
	if (list === "backlog") for (const ref of projects.known()) refs.set(projectKey(ref.name), ref);
	for (const item of items) if (item.project && !refs.has(projectKey(item.project.name))) refs.set(projectKey(item.project.name), item.project);
	const named = byName([...refs.values()]).map((ref) => groupOf(list, projectKey(ref.name), ref, items.filter((item) => item.project !== null && projectKey(item.project.name) === projectKey(ref.name)), sections, state, false));
	const loose = items.filter((item) => item.project === null);
	const none = groupOf(list, "", null, loose, sections, state, true);
	const showsNone = list === "backlog" || loose.length > 0 || sections.some((s) => s.name !== null && s.empty);
	return { canGroup: true, on, groups: showsNone ? [...named, none] : named };
}

function groupOf(list: GroupedList, key: string, project: ProjectRef | null, items: readonly TaskItem[], sections: readonly ListSection[], state: GroupingState, withEmpty: boolean): ProjectGroup {
	const zone: ProjectZone = project?.link ?? null;
	const order = sections.map((s) => s.name);
	const names: GroupName[] = [null, ...order.filter((name) => name !== null)];
	const filled = names.flatMap((name) => {
		const own = items.filter((item) => item.group === name);
		return own.length > 0 ? [projectSection(name, own, zone)] : [];
	});
	const drawn: readonly ListGroup[] = withEmpty ? withEmptySections(filled, sections).map((g) => (g.items.length === 0 ? projectSection(g.name, [], zone) : g)) : filled;
	return projectGroup(key, project, items, zone, drawn, isFolded(state, list, key), true);
}

/** The part of an empty group: no header, «No tasks», the place its plate writes and a drop lands. */
function emptyPart(zone: ProjectZone): ListGroup {
	return { ...projectSection(null, [], zone), empty: true };
}

function projectGroup(key: string, project: ProjectRef | null, items: readonly TaskItem[], zone: ProjectZone, drawn: readonly ListGroup[], folded: boolean, titled: boolean): ProjectGroup {
	const sections = drawn.length > 0 ? drawn : [emptyPart(zone)];
	const end: ListPlace = { kind: "task", group: sections[sections.length - 1].name, before: null, project: zone };
	return {
		key,
		project,
		title: project?.name ?? NO_PROJECT,
		folded,
		count: items.filter((item) => item.open).length,
		canOpenNote: project?.canOpenNote ?? false,
		zone,
		titled,
		sections,
		end,
		head: { group: folded ? end.group : null, project: zone },
	};
}

/**
 * A list of a project's own view: one untitled group of the project, its sections as the main screen draws them (`shows`:
 * the column shows sections), each with the project's zone on its menu and none lifted.
 */
export function viewGrouping(project: ProjectRef, items: readonly TaskItem[], shows: boolean, sections: readonly ListSection[]): ListGrouping {
	const zone = project.link;
	const view = items.length === 0 ? [] : listView(items, shows, sections).groups;
	const drawn = view.map((g): ListGroup => ({ ...g, menu: g.menu && { ...g.menu, project: zone }, reorder: false }));
	return { canGroup: false, on: true, groups: [projectGroup(projectKey(project.name), project, items, zone, drawn, false, false)] };
}

/** The sections a group offers a task's menu: those it shows, in order. */
export function groupSectionNames(grouping: ListGrouping): Readonly<Record<string, readonly GroupName[]>> {
	return Object.fromEntries(grouping.groups.map((g) => [g.key, g.sections.map((s) => s.name)]));
}

/** A found task shown: the group it stands in unfolds, in either list that groups. */
export function revealedGrouping(state: GroupingState, item: TaskItem): GroupingState {
	const list = item.list;
	if (list !== "backlog" && list !== "soon") return state;
	const key = groupKeyOf(item);
	return isFolded(state, list, key) ? withFolded(state, list, key, false) : state;
}
