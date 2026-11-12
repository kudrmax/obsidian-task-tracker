import { dayColumn } from "../domain/Days";
import type { GroupedList } from "../domain/Lists";
import type { Placement } from "../domain/Placement";
import { projectKey } from "../domain/Project";
import type { LocalDate } from "../domain/Task";
import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import type { GroupName, NewTaskPlace, ProjectsNewTask, ProjectsPlace, ProjectsSection, ProjectsStage, ProjectsView, TaskItem, TaskKey } from "./contracts";
import { sameNewPlace } from "./newTaskPlaces";
import { StaleTaskError } from "./contracts";
import type { Header, ListCard } from "./nesting";
import { keyOf, samePlace } from "./taskKeys";

/** A part of a list that decides itself what a new task typed in it writes: its section, and that write; `plus`, the part a tap on the plus types in. */
export interface EntryPart {
	readonly group: GroupName;
	readonly newTask: ProjectsNewTask | null;
	readonly plus: boolean;
	/**
	 * Where a field opened at the part's end stands, so the card it writes lands under it: before this card, the part's first
	 * of a later stage than the one its new task goes to (the part shows its cards by stage); null: the part's end.
	 */
	readonly end: TaskKey | null;
}

/** What the quick entry reads of a list: its cards and sections as `EntryLook` gives them, and its parts' own writes. */
export interface EntryListLook {
	readonly cards: readonly ListCard[];
	readonly sections: readonly Header[];
	readonly parts: readonly EntryPart[];
}

/**
 * The Projects screen's list as the quick entry reads it (`EntryLook` for list `projects`): its rows as cards, each in its
 * part's section, the parts in order, and what each part's new task writes. The plus types in the part that writes the
 * screen's own new task (`ProjectsView.newTask`), else in the first part that writes one (All By project); none when the
 * screen writes no task of its own (a folder, Done). None while the screen has no view.
 */
export function projectsEntryLook(view: ProjectsView | null): EntryListLook {
	if (!view) return { cards: [], sections: [], parts: [] };
	const cards = view.sections.flatMap((section) => section.rows.map((row): ListCard => ({ key: row.item.key, id: row.item.id, level: row.level, group: section.group })));
	const own = view.newTask;
	const first = own === null ? -1 : Math.max(0, view.sections.findIndex((s) => s.newTask !== null && sameNewTask(s.newTask, own)));
	const plusPart = first < 0 ? -1 : view.sections.findIndex((s, i) => i >= first && s.newTask !== null);
	return {
		cards,
		sections: view.sections.map((section) => section.group),
		parts: view.sections.map((section, i) => ({ group: section.group, newTask: section.newTask, plus: i === plusPart, end: endOf(section) })),
	};
}

function sameNewTask(a: ProjectsNewTask, b: ProjectsNewTask): boolean {
	const project = a.project === null || b.project === null ? a.project === b.project : projectKey(a.project) === projectKey(b.project);
	return project && sameNewPlace(a.place, b.place);
}

/** The order the Projects list shows a part's cards in: Inbox, Backlog, Soon (a dated one too), Today, Done. */
const STAGE_RANK: Readonly<Record<ProjectsStage["kind"], number>> = { inbox: 0, backlog: 1, soon: 2, date: 2, today: 3, done: 4 };
const LIST_RANK: Readonly<Record<GroupedList, number>> = { inbox: 0, backlog: 1, soon: 2, now: 3 };

/** The part's first card of a stage after the one its new task goes to: a field at the part's end, or anywhere in it, stands before it. */
export function endOf(section: ProjectsSection): TaskKey | null {
	const place = section.newTask?.place;
	if (!place || place.kind !== "list") return null;
	const rank = place.date !== undefined ? STAGE_RANK.soon : LIST_RANK[place.list];
	return section.cards.find((card) => card.stage !== null && STAGE_RANK[card.stage.kind] > rank)?.item.key ?? null;
}

/** The place a part's new task is written in as the entry's bar shows it: the part's list (Today: Now), a date for a dated one. */
export function placementOfNewTask(newTask: ProjectsNewTask | null): Placement | null {
	const place = newTask?.place;
	if (!place || place.kind !== "list") return null;
	return place.date ? { kind: "date", date: place.date } : { kind: place.list };
}

/** The list a new task goes into and its day, from a place chosen in the bar or the part's own write. */
function targetOf(section: ProjectsSection, placement: Placement | undefined, today: LocalDate): { readonly list: GroupedList; readonly date: LocalDate | null } {
	if (placement) {
		if (placement.kind !== "date") return { list: placement.kind, date: null };
		const { list, date } = dayColumn(placement.date, today);
		return { list, date };
	}
	const place = section.newTask?.place;
	if (!place || place.kind !== "list") throw new StaleTaskError();
	return { list: place.list, date: place.date ?? null };
}

function listOf(item: TaskItem): GroupedList | null {
	return item.list === "done" ? null : item.list;
}

/**
 * Where a task typed at `place` of the Projects list `view` (the screen as read from `doc`) is written: the list its part
 * writes into (or the one chosen in the bar), right after the nearest card of that list above the place in the part
 * (before the next task of that card's section in the file), else right before the nearest one below it, else at the
 * list's end. Rejects with StaleTaskError for a part the screen lacks or one that writes no task (Done).
 */
export function projectsNewPlace(view: ProjectsView, doc: TaskDocument, entryOf: (key: TaskKey) => TaskEntry, place: ProjectsPlace, today: LocalDate): NewTaskPlace {
	const section = view.sections.find((s) => s.group === place.group);
	if (!section || (!section.newTask && !place.placement)) throw new StaleTaskError();
	const { list, date } = targetOf(section, place.placement, today);
	const at = place.before === null ? section.cards.length : section.cards.findIndex((card) => samePlace(card.item.key, place.before!));
	if (at < 0) throw new StaleTaskError();
	const dated = date === null ? {} : { date };
	const above = section.cards.slice(0, at).filter((card) => listOf(card.item) === list).pop();
	if (above) {
		const entry = entryOf(above.item.key);
		const next = doc.tasks(list).find((other) => other.index > entry.index && other.group === entry.group);
		return { kind: "list", list, group: entry.group, before: next ? keyOf(next) : null, ...dated };
	}
	const below = section.cards.slice(at).find((card) => listOf(card.item) === list);
	if (below) {
		const entry = entryOf(below.item.key);
		return { kind: "list", list, group: entry.group, before: keyOf(entry), ...dated };
	}
	return { kind: "list", list, group: null, before: null, ...dated };
}
