import type { GroupName, LocalDate, Slot } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import { sameRule } from "../domain/Repeat";
import { repeatDay } from "../domain/RepeatDraft";
import type { GroupedList } from "../domain/Lists";
import type { Placement, TaskDraft } from "../domain/Placement";
import { samePlacement } from "../domain/operations";
import type { CreatedTask, DraftMarks, DropColumn, DropTo, MenuProject, NewTaskPlace, ProjectRef, TaskItem, TaskKey, TaskService } from "./contracts";
import { inProject, projectKey, projectName } from "../domain/Project";
import { projectPage } from "./menus";
import { fitLevel, type GapPlace, gapOfPlace, type Header, type LevelCard, type ListCard, type ListPlace, placeOfGap, shiftLevel } from "./nesting";
import { sameLine, samePlace } from "./taskKeys";
import { fullTree } from "./fullTree";
import { plainText } from "../domain/TaskText";
import { ENTRY_LISTS, type EntryList } from "./screenPlaces";
import { type EntryPart, placementOfNewTask } from "./projectsEntry";

/** Where the field stands: a gap of a list, a slot on the calendar, or the end of a task's subtasks in the calendar menu. */
/**
 * `unfold`, on a list's spot: the task the field types a subtask of is folded away inside the card above the place (a
 * folded result's step); opening the field there unfolds it first (a job), and the field then stands last among its
 * subtasks. A host hands the spot back to `open` as it is.
 */
export type EntrySpot =
	| { readonly kind: "list"; readonly column: EntryList; readonly place: GapPlace; readonly unfold?: TaskKey }
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "stack"; readonly parent: TaskKey };

/** A text entered and not yet written, at the level it was entered at. */
/** What a list is about to draw: its cards in order, and the sections it draws, in order. */
export interface EntryDrawing {
	readonly cards: readonly ListCard[];
	/** The sections the list draws, in order (null: the part without a section). */
	readonly sections: readonly Header[];
}

/** Where a header stands among `sections`: -1 when none is it. */
function zoneIndex(sections: readonly Header[], zone: { readonly group: GroupName }): number {
	return sections.indexOf(zone.group);
}

/**
 * Where a list draws the field: before its first header (`top`); in section `section` (its index among the sections
 * drawn) before the card at `card` (an index among all the cards; the section's last card's next for its end), its No
 * tasks plate gone unless `keepsPlate`; or after everything (`end`).
 */
export type EntryAt =
	| { readonly kind: "top" }
	| { readonly kind: "in"; readonly section: number; readonly card: number; readonly keepsPlate: boolean }
	| { readonly kind: "end" };

/** The field as a list draws it: its place, the texts typed before it, whether it names a section, and where it stands. */
export interface ListEntry {
	readonly place: GapPlace;
	readonly pending: readonly PendingText[];
	readonly section: boolean;
	readonly at: EntryAt;
}

/**
 * Where the field at `place` stands among what a list draws. Without headers, at its card, or at the end. With headers, in
 * its section: at its card, or at the section's end for a place outside the section's cards (where `placeOfGap` writes
 * it); a place outside every section before the first header; a section not drawn, after everything.
 */
export function entryAt(drawing: EntryDrawing, place: GapPlace, section: boolean): EntryAt {
	const { cards, sections } = drawing;
	if (!sections.some((name) => name !== null)) return place.index <= cards.length ? { kind: "in", section: 0, card: place.index, keepsPlate: true } : { kind: "end" };
	const at = zoneIndex(sections, place);
	if (at < 0) return place.group === null ? { kind: "top" } : { kind: "end" };
	const start = cards.findIndex((card) => zoneIndex(sections, card) >= at);
	const from = start < 0 ? cards.length : start;
	let end = from;
	while (end < cards.length && cards[end].group === place.group) end++;
	const card = place.index >= from && place.index <= end ? place.index : end;
	return { kind: "in", section: at, card, keepsPlate: section };
}

/**
 * Where a task's full screen draws the field among the rows of its subtasks (`tasks.fullTree`'s `rows`): in the title
 * (the task itself renamed); in the place of row `index` (that subtask renamed); or a new subtask before row `index`
 * (`rows.length`: after them all) at `level`, the texts typed before it waiting right above it at that level.
 */
export type StackAt =
	| { readonly kind: "title" }
	| { readonly kind: "row"; readonly index: number; readonly level: number }
	| { readonly kind: "new"; readonly index: number; readonly level: number };

/** The field as a task's full screen draws it: where it stands, and the texts waiting before it (none but for a new subtask). */
export interface StackEntry {
	readonly at: StackAt;
	readonly pending: readonly PendingText[];
}

/** Where `task`'s full screen draws the field of `state`: none unless it stands in the stack of `task` or one of its subtasks. */
export function stackEntry(state: EntryState | null, task: TaskItem): StackEntry | null {
	if (!state || state.spot.kind !== "stack") return null;
	const { rows, newSubtask } = fullTree(task);
	const renaming = state.renaming;
	if (renaming) {
		if (samePlace(renaming.key, task.key)) return { at: { kind: "title" }, pending: [] };
		const index = rows.findIndex((row) => samePlace(row.item.key, renaming.key));
		return index < 0 ? null : { at: { kind: "row", index, level: rows[index].level }, pending: [] };
	}
	const parent = state.spot.parent;
	const place = samePlace(parent, task.key) ? newSubtask : rows.find((row) => samePlace(row.item.key, parent))?.newSubtask;
	if (!place) return null;
	return { at: { kind: "new", index: place.index, level: place.level }, pending: state.pending.map(({ text }) => ({ text, level: place.level })) };
}

export interface PendingText {
	readonly text: string;
	readonly level: number;
}

/** The places the bar offers a task, before the date: the lists, in this order. */
export const ENTRY_PLACES: readonly GroupedList[] = ["inbox", "backlog", "soon", "now"];

/**
 * The bar's Project button, right after the priority's flag: its page, the task menu's Project page for the field's own
 * project (its pick: `setProject`, «New project…» through `TaskService.newProject`), and whether it shows the accent, as
 * the flag does for a chosen level: a project chosen.
 */
export interface EntryProject {
	readonly page: MenuProject;
	readonly lit: boolean;
}

/** A tile of the place button's panel: a list, or Date last, which opens the month picker on the field's day if it has one. */
export type PlaceChoice = { readonly kind: GroupedList; readonly on: boolean } | { readonly kind: "date"; readonly on: boolean; readonly date: LocalDate | null };

export interface EntryState {
	readonly spot: EntrySpot;
	readonly text: string;
	/** A level's prefix chosen, or none. */
	readonly priority: string | null;
	/** The labels' names chosen. */
	readonly labels: readonly string[];
	/** The rule the task repeats by, or none. */
	readonly repeat: RepeatRule | null;
	/** Texts entered here and not yet written, in order: drawn right before the field. */
	readonly pending: readonly PendingText[];
	/**
	 * The task whose text the field edits, whose card the lists and the timeline hide while it is open; null for a new
	 * one. A step drawn on its folded result's card or block (`TaskItem.drawnOn`) is renamed in that card's place: here
	 * its `key` and `id` are that card's, so it is the result's card that hides; the write names the step.
	 */
	readonly renaming: TaskItem | null;
	/** The field shifts a level at all: one in a list writing a task; then whether it can go a level in or out now. */
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The field writes a section's name; null where it cannot (a rename, a slot, a stack, a column without sections). */
	readonly section: boolean | null;
	/** The priority and labels the task is written with, and what may still be chosen: the service's answer for the field. A section's name has no tint. */
	readonly marks: DraftMarks;
	/** The flag shows: there is a level or a label to choose, and the field writes a task, not a section's name. */
	readonly markable: boolean;
	/** Where the task goes, for the place button; null for a field with no place of its own (a subtask, a slot, a stack, a section's name). */
	readonly place: Placement | null;
	/** The tiles the place button offers, in order: the lists, then Date. */
	readonly places: readonly PlaceChoice[];
	/** The field may repeat: one in a slot may not, nor one writing a section's name. */
	readonly repeatable: boolean;
	/** The day a new rule starts from: the field's own day, else today. */
	readonly repeatDay: LocalDate;
	/** The renames entered and not yet written (`QuickEntry.renamed`). */
	readonly renamed: readonly PendingRename[];
	/**
	 * The Project button: where the field writes a task of the top level (a list's, a slot's, a rename of one); none for a
	 * subtask's field, new or renamed (its project is its parent's), nor for a section's name.
	 */
	readonly project: EntryProject | null;
}

/**
 * A rename entered and not yet written: the task (`TaskItem.id`, and its key as read at the open), and the text its card
 * shows until the write is drawn, as `TaskItem.text` and `TaskItem.title` will read.
 */
export interface PendingRename {
	readonly id: string;
	readonly key: TaskKey;
	readonly text: string;
	readonly title: string;
}

/**
 * A place chosen in the bar: the list the field now stands in (at the end of a funnel's column; the Projects list keeps it
 * where it stands), and the day the day column must open, if another. `placeShowing(column, …)` is where the screen goes.
 */
export interface PlaceMove {
	readonly column: EntryList;
	readonly day: LocalDate | null;
}

/** What the entry reads of the service, all synchronous: the marks, the places, and the project notes its Project page offers (none without them). */
export type EntryTasks = Pick<TaskService, "placementOf" | "placementOfDay" | "dayOfPlacement" | "parseTitle" | "isBlank" | "withPriority" | "draftMarks" | "newSlot"> & Partial<Pick<TaskService, "projects">>;

/**
 * What the entry reads of the screen, as it stands now: its lists' cards and sections, the day it shows, and which of
 * the lists it shows. How they are laid out is the frontend's.
 */
export interface EntryLook {
	/** The cards of `column` as it shows the file now; none while it does not show. The Projects list's: `projectsEntryLook`. */
	cards(column: EntryList): readonly ListCard[];
	/** The sections `column` draws, in order; none while it does not show. */
	sections(column: EntryList): readonly Header[];
	/** The column shows sections, so a section may be written in it. */
	sectioned(column: EntryList): boolean;
	/** The day the day column shows. */
	day(): LocalDate;
	today(): LocalDate;
	/**
	 * The lists the screen shows, in its order (`shownEntryLists`): a task is looked for in those first, then in the others
	 * (`ENTRY_LISTS`); the plus opens the field in the day's list while it shows, else in Inbox, and on the Projects screen
	 * in the part its plus writes.
	 */
	shown(): readonly EntryList[];
	/**
	 * The parts of a list that decides itself what a new task typed in it writes (the Projects list: `projectsEntryLook`'s
	 * `parts`); none for a funnel's column, whose place is its own. Left out: none anywhere.
	 */
	parts?(column: EntryList): readonly EntryPart[];
}

/** A line entered: its text, the level it was entered at, and its marks. */
export interface EntryLine extends PendingText {
	readonly priority: string | null;
	readonly labels: readonly string[];
	readonly repeat: RepeatRule | null;
	/** The field's project as it was when the line was entered (its name), null for none. */
	readonly project?: string | null;
	/** The place chosen in the bar for a line typed where the list keeps the field (`EntryField.placement`). */
	readonly placement?: Placement;
}

/**
 * A spot the entry still writes at or reads from: the field's, a renamed task's own, one whose texts are queued. Its place
 * in a list follows the cards that land while something holds it, so it keeps meaning the same gap until the file catches up.
 */
export interface EntryRun {
	spot: EntrySpot;
	readonly pending: EntryLine[];
	holds: number;
}

/** A rename: the task, and its own spot (a run), which stays its even when the field moves to another spot. */
export interface EntryRename {
	readonly item: TaskItem;
	/** The card the field stands in place of when the task has none of its own: its folded result's. */
	readonly face?: TaskKey;
	readonly home: string;
	/** A place was chosen in the bar: the task goes where the field now stands, not where it was. */
	readonly moved: boolean;
}

export interface EntryField {
	readonly run: string;
	readonly text: string;
	readonly priority: string | null;
	readonly labels: readonly string[];
	readonly repeat: RepeatRule | null;
	readonly rename: EntryRename | null;
	/**
	 * The field's own project (`ProjectRef.link`), null for none, like its labels: what it was opened in (a project's
	 * group or view; a renamed task's own) until Max picks another. Place moves the field and keeps it.
	 */
	readonly project?: string | null;
	/** The field writes a section's name (empty sections spec §4). */
	readonly section: boolean;
	/**
	 * A place chosen in the bar where the field stays where it stands (the Projects list shows every stage at once): the
	 * task is written there instead of where its part writes. Left out: none chosen.
	 */
	readonly placement?: Placement;
}

/**
 * A write the entry waits to make, in the order queued: once the lists show the writes before it, `QuickEntry.call` says
 * which call of the task service it is. `landing`, of a task written in a list: the column its card lands in.
 */
export type EntryJob =
	| { readonly id: string; readonly kind: "create"; readonly run: string; readonly line: EntryLine; landing?: EntryList | null; shown?: boolean }
	| { readonly id: string; readonly kind: "rename"; readonly home: string; readonly item: TaskItem; readonly draft: TaskDraft }
	| { readonly id: string; readonly kind: "section"; readonly run: string; readonly name: string; readonly column: EntryList; readonly place: GapPlace }
	/** The tasks `key` is folded away under show their subtasks, so the field typing its subtask stands in the list. */
	| { readonly id: string; readonly kind: "unfold"; readonly run: string; readonly key: TaskKey };

/** The entry's whole state, plain data: what a frontend without a long-lived entry keeps between calls. */
export interface EntrySession {
	field: EntryField | null;
	readonly runs: Record<string, EntryRun>;
	readonly jobs: EntryJob[];
	next: number;
}

/** The service call a job is, read once the lists show the writes before it. */
export type EntryCall =
	| { readonly method: "createInPlace"; readonly args: readonly [string, string | null, NewTaskPlace, RepeatRule | null, readonly string[], (string | null)?] }
	| { readonly method: "edit"; readonly args: readonly [TaskKey, TaskDraft] }
	| { readonly method: "createSection"; readonly args: readonly [string, Extract<NewTaskPlace, { readonly kind: "list" | "day" }>] }
	| { readonly method: "unfoldAbove"; readonly args: readonly [TaskKey] };

export function emptySession(): EntrySession {
	return { field: null, runs: {}, jobs: [], next: 0 };
}

type ListSpot = Extract<EntrySpot, { kind: "list" }>;

function listSpot(spot: EntrySpot): ListSpot | null {
	return spot.kind === "list" ? spot : null;
}

/** The list keeps the field where it stands when a place is chosen in the bar: it shows every stage at once. */
function keepsField(column: EntryList): boolean {
	return column === "projects";
}

/**
 * Typing tasks in place (quick-add spec §4.2–4.9), every rule of it, synchronous over plain state: where a field opens,
 * what Enter, a tap elsewhere and Escape mean, how far it shifts, what its bar offers, where each line is written. Enter
 * queues the task where the field stands and opens the next one under it at once; the writes are jobs a host runs one at
 * a time, each once the lists show the ones before it (`call`, then `shown`, `unshown`, `done`). QuickEntrySession is the
 * plugin's host; the phone's door hands the state back and forth.
 */
export class QuickEntry {
	/** What the field may do, kept while it only changes its text or marks, which do not change where it may go. Not state: worked out again. */
	private shifts: { readonly cards: readonly ListCard[]; readonly spot: EntrySpot; readonly indent: boolean; readonly outdent: boolean } | null = null;

	constructor(
		private readonly tasks: EntryTasks,
		private readonly look: EntryLook,
		readonly session: EntrySession = emptySession(),
		/** After every change of the state; `drawnNext`: the lists are about to draw the data it belongs to. */
		private readonly emit: (state: EntryState | null, drawnNext?: boolean) => void = () => undefined,
		/** A job queued. */
		private readonly queued: (job: EntryJob) => void = () => undefined,
	) {}

	get state(): EntryState | null {
		const field = this.session.field;
		if (!field) return null;
		const task = !field.section;
		const typed = this.tasks.draftMarks(field.text, field.priority, field.labels);
		const marks = task ? typed : { ...typed, tint: null };
		const place = task ? this.shownPlace(field) : null;
		const run = this.run(field.run);
		return {
			spot: run.spot,
			text: field.text,
			priority: field.priority,
			labels: field.labels,
			repeat: field.repeat,
			pending: run.pending.map(({ text, level }) => ({ text, level })),
			renaming: field.rename ? faced(field.rename) : null,
			indents: task && listSpot(run.spot) !== null,
			...this.mayShift(field),
			section: this.maySection(field) ? field.section : null,
			marks,
			markable: task && marks.tiles.levels.length + marks.tiles.labels.length > 0,
			place,
			places: placeChoices(place),
			repeatable: task && run.spot.kind !== "slot",
			repeatDay: repeatDay(place && this.tasks.dayOfPlacement(place), this.look.today()),
			renamed: this.renamed,
			project: task && this.topLevel(field) ? this.projectButton(field.project ?? null) : null,
		};
	}

	/** The field writes a task of the top level: in a list at its first level, in a slot, or a rename of one. */
	private topLevel(field: EntryField): boolean {
		const { spot } = this.run(field.run);
		if (field.rename) return !field.rename.item.isSubtask;
		if (spot.kind === "stack") return false;
		return spot.kind === "slot" || spot.place.level === 0;
	}

	private projectButton(link: string | null): EntryProject {
		return entryProject(link, this.tasks.projects?.() ?? []);
	}

	/** Every rename entered and not yet written, in the order entered, whether the field is still open or not. */
	get renamed(): readonly PendingRename[] {
		return this.session.jobs.flatMap((job) => (job.kind === "rename" ? [{ id: job.item.id, key: job.item.key, text: job.draft.text, title: plainText(job.draft.text) }] : []));
	}

	/** The renamed task, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
	get renaming(): TaskKey | null {
		const rename = this.session.field?.rename;
		return rename ? (rename.face ?? rename.item.key) : null;
	}

	/** What `column`'s list draws for the field: its gap, the texts waiting before it, and whether it is a section's name; null when it stands elsewhere. */
	/**
	 * What `column`'s list draws for the field: none when it stands elsewhere. `drawn` is what the list is about to draw
	 * (the look's cards and sections when left out); `at` is where among them the field stands.
	 */
	listEntry(column: EntryList, drawn?: EntryDrawing): ListEntry | null {
		const drawing = drawn ?? { cards: this.look.cards(column), sections: this.look.sections(column) };
		const state = this.state;
		const list = state && listSpot(state.spot);
		if (!state || !list || list.column !== column) return null;
		const section = state.section === true;
		return { place: list.place, pending: state.pending, section, at: entryAt(drawing, list.place, section) };
	}

	/** Where `task`'s full screen draws the field: none unless it stands in the stack of `task` or one of its subtasks. */
	stackEntry(task: TaskItem): StackEntry | null {
		return stackEntry(this.state, task);
	}

	/** Where a task's full screen types under `parent` or renames it: the stack of its subtasks there, whatever list shows it. */
	stackSpot(parent: TaskKey): EntrySpot {
		return { kind: "stack", parent };
	}

	/** A double click on a list's free room: the field after the last card, in the last section, at the top level. */
	openAtEnd(column: EntryList): void {
		this.open(this.endOf(column));
	}

	/** The plus tapped: the end of the part a shown list's plus types in (the Projects list's), else of the day column while it shows, else of Inbox. */
	openFromPlus(): void {
		const shown = this.look.shown();
		for (const column of shown) {
			const part = this.parts(column).find((p) => p.plus);
			if (part) return this.openIn(column, part.group);
		}
		this.openAtEnd(shown.includes("day") ? "day" : "inbox");
	}

	/** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
	openIn(column: EntryList, group: GroupName): void {
		this.openAt(column, { kind: "task", group, before: null });
	}

	/** The plus let go at `place` of list `column` (the Projects list's `projectsPlace` drop): the field of a new task there. */
	openAt(column: EntryList, place: ListPlace): void {
		const gap = gapOfPlace(this.look.cards(column), place);
		this.open({ kind: "list", column, place: place.kind === "task" ? { ...gap, level: 0 } : gap });
	}

	/** A long tap on the timeline's free room let go: the field of a new task in that slot. */
	openSlot(slot: Slot): void {
		this.open({ kind: "slot", slot });
	}

	/** The plus came to rest on `column` (null: off the lists) with `result`: the field opens where the drop showed; false where it opens nowhere. */
	openAtDrop(column: EntryList | null, result: DropTo | null): boolean {
		const place = result && column ? placeOfDrop(result) : null;
		if (column && place) this.open({ kind: "list", column, place: gapOfPlace(this.look.cards(column), place) });
		else if (result?.kind === "time") this.openSlot(this.tasks.newSlot(this.look.day(), result.start));
		else return false;
		return true;
	}

	/** Where a new subtask of `parent` is typed: last among its subtasks in the list that shows it, else last in its menu's stack. */
	subtaskSpot(parent: TaskKey): EntrySpot {
		const found = this.find(parent);
		const holder = found ? null : this.holder(parent);
		if (holder) {
			const card = this.look.cards(holder.column)[holder.index];
			return { kind: "list", column: holder.column, place: gapOfPlace(this.look.cards(holder.column), { kind: "subtask", parent: card.key, before: null }), unfold: parent };
		}
		if (!found) return { kind: "stack", parent };
		return { kind: "list", column: found.column, place: gapOfPlace(this.look.cards(found.column), { kind: "subtask", parent, before: null }) };
	}

	/**
	 * Where `item` is renamed: right before its card in the list that shows it, in its card's section of its project's part
	 * where the list is grouped by project; else, opened from a menu's stack, there; else
	 * over its card on the timeline; null when it shows nowhere the field can stand.
	 */
	renameSpot(item: TaskItem, inStack: boolean): EntrySpot | null {
		const found = this.find(item.key) ?? (inStack ? null : this.holder(item.key));
		if (found) {
			const card = this.look.cards(found.column)[found.index];
			return { kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } };
		}
		if (inStack) return { kind: "stack", parent: item.key };
		const slot = item.slot ?? item.drawnOn?.slot ?? null;
		return slot ? { kind: "slot", slot } : null;
	}

	/**
	 * The card a list shows a task folded away in, when it has none of its own: the deepest card of a task it sits under
	 * (a folded result's, whose card shows its step).
	 */
	private holder(key: TaskKey): { readonly column: EntryList; readonly index: number } | null {
		let best: { column: EntryList; index: number; depth: number } | null = null;
		for (const column of this.lookOrder()) {
			this.look.cards(column).forEach((card, index) => {
				const k = card.key;
				const holds = k.section === key.section && k.index === key.index && k.path.length < key.path.length && k.path.every((i, n) => key.path[n] === i);
				if (holds && (best === null || k.path.length > best.depth)) best = { column, index, depth: k.path.length };
			});
			if (best) return best;
		}
		return best;
	}

	/** The card the field renaming `item` at `spot` stands in place of when the task has no card of its own there. */
	private faceOf(item: TaskItem, spot: EntrySpot): TaskKey | undefined {
		if (spot.kind === "list") {
			if (this.find(item.key)) return undefined;
			const card = this.look.cards(spot.column)[spot.place.index];
			return card ? { ...card.key, ...((card.id ?? card.key.id) !== undefined && { id: card.id ?? card.key.id }) } : undefined;
		}
		return spot.kind === "slot" && item.slot === null && item.drawnOn ? item.drawnOn.key : undefined;
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(given: EntrySpot, renaming?: TaskItem): void {
		if (this.session.field) this.save(this.session.field);
		const unfold = given.kind === "list" && !renaming ? given.unfold : undefined;
		const spot: EntrySpot = given.kind === "list" ? { kind: "list", column: given.column, place: given.place } : given;
		const face = renaming ? this.faceOf(renaming, spot) : undefined;
		const rename = renaming ? { item: renaming, home: this.newRun(spot), moved: false, ...(face && { face }) } : null;
		const project = renaming ? (renaming.project?.name ?? null) : this.partProject(spot);
		const run = this.newRun(spot);
		this.reset({ run, text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, labels: renaming?.labels.map((l) => l.name) ?? [], repeat: renaming?.repeat ?? null, rename, section: false, project });
		if (unfold) this.queue(run, { id: this.jobId(), kind: "unfold", run, key: unfold });
	}

	/** A project picked on the Project button (its name; null: No project); the field stays where it is. */
	setProject(name: string | null): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, project: name }, true);
	}

	type(text: string): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, text }, true);
	}

	/** A level chosen takes the place of a prefix typed: the text keeps no prefix, so the file gets one. Null takes the level off. */
	setPriority(prefix: string | null): void {
		const field = this.session.field;
		if (!field) return;
		const text = this.tasks.parseTitle(field.text).priority ? this.tasks.withPriority(field.text, null) : field.text;
		this.reset({ ...field, text, priority: prefix }, true);
	}

	/** A level's tile tapped: the level, or none when the task is already written with it. */
	togglePriority(prefix: string): void {
		const state = this.state;
		if (state) this.setPriority(state.marks.priority?.prefix === prefix ? null : prefix);
	}

	setLabels(labels: readonly string[]): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, labels }, true);
	}

	/** A label's tile tapped: on when the task is not written with it, else off. */
	toggleLabel(name: string): void {
		const state = this.state;
		if (!state) return;
		const chosen = state.marks.labels.map((l) => l.name);
		this.setLabels(chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name]);
	}

	setRepeat(rule: RepeatRule | null): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, repeat: rule }, true);
	}

	indent(delta: 1 | -1): void {
		const place = this.shifted(delta);
		const field = this.session.field;
		const run = field && this.run(field.run);
		const list = run && listSpot(run.spot);
		if (!place || !run || !list) return;
		run.spot = { ...list, place };
		this.shifts = null;
		this.changed();
	}

	/**
	 * The field switches between a task and a section's name. A section stands between tasks of the top level: the field
	 * goes there, past the subtasks of the task above it.
	 */
	toggleSection(): void {
		const field = this.session.field;
		const list = field && listSpot(this.run(field.run).spot);
		if (!field || !list || !this.maySection(field)) return;
		const section = !field.section;
		const run = section && list.place.level > 0 ? this.newRun({ ...list, place: this.topLevelAfter(list.column, list.place) }) : field.run;
		this.reset({ ...field, run, section });
	}

	enter(): void {
		const field = this.session.field;
		if (!field) return;
		if (field.rename) this.enterRename(field, field.rename);
		else if (field.section) this.enterSection(field);
		else if (this.blank(field.text)) this.enterBlank();
		else this.enterTask(field);
	}

	/** A tap elsewhere: the text is kept as by Enter, and the field closes. */
	blur(): void {
		const field = this.session.field;
		if (!field) return;
		this.save(field);
		this.reset(null);
	}

	/** The field's own text goes; what Enter already sent is still written. */
	escape(): void {
		this.reset(null);
	}

	/**
	 * A place chosen in the bar: the field goes to the end of that place's column at once, a renamed task with it. What it
	 * answers: the column, and the day the day column must open when the place is another day than it shows; null when
	 * the place is the one the field already has, which changes nothing.
	 */
	choosePlace(placement: Placement): PlaceMove | null {
		const field = this.session.field;
		if (!field) return null;
		const shown = this.shownPlace(field);
		if (shown && samePlacement(shown, placement)) return null;
		const rename = field.rename && { ...field.rename, moved: true };
		const list = listSpot(this.run(field.run).spot);
		if (list && keepsField(list.column)) {
			this.reset({ ...field, rename, placement });
			return { column: list.column, day: null };
		}
		const column: DropColumn = placement.kind === "now" || placement.kind === "date" ? "day" : placement.kind;
		this.reset({ ...field, rename, run: this.newRun(this.endOf(column)) });
		const day = this.tasks.dayOfPlacement(placement);
		return { column, day: day === null || day === this.look.day() ? null : day };
	}

	/** The field, its text and marks, at the end of `column`; what was entered at the old spot is still written there. */
	moveToEnd(column: EntryList): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, run: this.newRun(this.endOf(column)) });
	}

	/**
	 * Where a task written in `column` goes: a list's place, the day column's on the day it shows, or a place of the
	 * Projects list, which the service reads off the screen when it writes (`placement`: the one chosen in the bar there).
	 */
	placeOf(column: EntryList, result: ListPlace, placement?: Placement): NewTaskPlace {
		if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
		const { group, before } = result;
		switch (column) {
			case "projects":
				return { kind: "projects", group, before, ...(placement && { placement }) };
			case "day":
				return { kind: "day", date: this.look.day(), group, before };
			default:
				return { kind: "list", list: column, group, before };
		}
	}

	/** A slot of the field. */
	private slotPlace(slot: Slot): NewTaskPlace {
		return { kind: "slot", slot };
	}

	job(id: string): EntryJob {
		const job = this.session.jobs.find((j) => j.id === id);
		if (!job) throw new Error(`Task Calendar: no entry job ${id}`);
		return job;
	}

	/**
	 * The service call job `id` is, read when the lists show every write before it: a task at the level it was entered at,
	 * as far as the cards then allow, with the field's project (a subtask's is its parent's: none); a rename by the key the
	 * lists give the task then; a section at the top level where the field stood. Null when it is nothing to write. A slot
	 * takes no rule.
	 */
	call(id: string): EntryCall | null {
		const job = this.job(id);
		switch (job.kind) {
			case "create": {
				const { line } = job;
				const { spot } = this.run(job.run);
				job.landing = null;
				switch (spot.kind) {
					case "slot":
						return { method: "createInPlace", args: [line.text, line.priority, this.slotPlace(spot.slot), null, line.labels, line.project ?? null] };
					case "stack":
						return { method: "createInPlace", args: [line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null }, line.repeat, line.labels] };
					case "list": {
						const cards = this.look.cards(spot.column);
						const place = fitLevel(cards, { ...spot.place, level: line.level });
						job.landing = spot.column;
						const at = this.placeOf(spot.column, placeOfGap(cards, place), line.placement);
							return { method: "createInPlace", args: at.kind === "subtask" ? [line.text, line.priority, at, line.repeat, line.labels] : [line.text, line.priority, at, line.repeat, line.labels, line.project ?? null] };
					}
				}
				break;
			}
			case "rename":
				return { method: "edit", args: [this.keyAt(job.home, job.item), job.draft] };
			case "unfold":
				return { method: "unfoldAbove", args: [job.key] };
			case "section": {
				const at = this.placeOf(job.column, placeOfGap(this.look.cards(job.column), { ...job.place, level: 0 }));
				return at.kind === "list" || at.kind === "day" ? { method: "createSection", args: [job.name, at] } : null;
			}
		}
	}

	/**
	 * A task job's line is written and the lists are about to draw it (`coming`: the cards each column draws then). It
	 * leaves the queue, and the places at or past its card move down, in the very drawing that shows its card: where the
	 * lists draw the task the file holds (`created`, the key the write gave), which its rules may have put elsewhere.
	 */
	/** `created`: the task the write made, its key, or with its id (`createWithId`), which finds its card whatever wrote since. */
	shown(id: string, created: TaskKey | CreatedTask | null, coming: (column: EntryList) => readonly ListCard[]): void {
		const job = this.job(id);
		if (job.kind !== "create") return;
		const held = this.session.field?.run ?? null;
		const was = held === null ? null : this.run(held).spot;
		if (job.landing && created) this.landed(job.landing, created, coming(job.landing));
		this.run(job.run).pending.shift();
		job.shown = true;
		this.shifts = null;
		const now = this.session.field?.run ?? null;
		if (held !== null && (held === job.run || now !== held || this.run(held)?.spot !== was)) this.emit(this.state, true);
	}

	/** A task job ended without its line shown (its write failed): the line stops waiting under the cards. */
	unshown(id: string): void {
		const job = this.job(id);
		if (job.kind !== "create" || job.shown) return;
		this.run(job.run).pending.shift();
		this.shifts = null;
		if (job.run === this.session.field?.run) this.changed();
	}

	/** Job `id` ended, written or not: its spot no longer follows the cards for it. */
	done(id: string): void {
		const job = this.job(id);
		if (job.kind === "unfold") this.unfolded(job);
		this.release(job.kind === "rename" ? job.home : job.run);
		this.session.jobs.splice(this.session.jobs.indexOf(job), 1);
	}

	/**
	 * The lists show the task unfolded: the field typing its subtask goes last among its subtasks there. Still folded away
	 * (the write failed), the field closes rather than type a subtask of the card it stood under.
	 */
	private unfolded(job: Extract<EntryJob, { kind: "unfold" }>): void {
		const run = this.run(job.run);
		if (!run || this.session.field?.run !== job.run) return;
		const at = this.find(job.key);
		if (!at) return this.reset(null);
		run.spot = { kind: "list", column: at.column, place: gapOfPlace(this.look.cards(at.column), { kind: "subtask", parent: job.key, before: null }) };
		this.shifts = null;
		this.changed();
	}

	private run(id: string): EntryRun {
		return this.session.runs[id];
	}

	private newRun(spot: EntrySpot): string {
		const id = `r${this.session.next++}`;
		this.session.runs[id] = { spot, pending: [], holds: 0 };
		return id;
	}

	private hold(id: string): void {
		this.run(id).holds++;
	}

	private release(id: string): void {
		const run = this.run(id);
		if (!run) return;
		run.holds--;
		if (run.holds <= 0) delete this.session.runs[id];
	}

	private maySection(field: EntryField): boolean {
		const list = listSpot(this.run(field.run).spot);
		return !field.rename && list !== null && this.look.sectioned(list.column);
	}

	/** The gap of the top level at or after `place` in its section: past the subtasks it stands among. */
	private topLevelAfter(column: EntryList, place: GapPlace): GapPlace {
		const cards = this.look.cards(column);
		let index = place.index;
		while (index < cards.length && cards[index].group === place.group && cards[index].level > 0) index++;
		return { ...place, index, level: 0 };
	}

	private mayShift(field: EntryField): { readonly canIndent: boolean; readonly canOutdent: boolean } {
		const list = listSpot(this.run(field.run).spot);
		if (field.rename || field.section || !list) return { canIndent: false, canOutdent: false };
		const cards = this.look.cards(list.column);
		const { spot } = this.run(field.run);
		const kept = this.shifts;
		if (kept?.cards === cards && kept.spot === spot) return { canIndent: kept.indent, canOutdent: kept.outdent };
		const shifts = { cards, spot, indent: this.shiftedRun(field.run, cards, 1) !== null, outdent: this.shiftedRun(field.run, cards, -1) !== null };
		this.shifts = shifts;
		return { canIndent: shifts.indent, canOutdent: shifts.outdent };
	}

	/** The place button: a subtask's field, new or renamed, has none, nor does one off the lists. */
	private shownPlace(field: EntryField): Placement | null {
		const list = listSpot(this.run(field.run).spot);
		if (!list) return null;
		if (field.rename) return field.rename.item.isSubtask ? null : this.placement(field);
		if (list.place.level > 0) return null;
		return field.placement ?? this.listPlacement(list);
	}

	/** Where a renamed task goes: where it was, until a place is chosen in the bar. */
	private placement(field: EntryField): Placement {
		if (field.placement) return field.placement;
		const item = field.rename?.item ?? null;
		const list = listSpot(this.run(field.run).spot);
		if (list && (field.rename?.moved || !item)) return this.listPlacement(list);
		return item ? this.tasks.placementOf(item) : this.columnPlacement("day");
	}

	/** Where a new task at `spot` goes: its column's place, or what its part writes where the list decides that itself. */
	private listPlacement(spot: ListSpot): Placement {
		if (spot.column !== "projects") return this.columnPlacement(spot.column);
		return placementOfNewTask(this.partAt(spot)?.newTask ?? null) ?? { kind: "inbox" };
	}

	private columnPlacement(column: DropColumn): Placement {
		return column === "day" ? this.tasks.placementOfDay(this.look.day()) : { kind: column };
	}

	private parts(column: EntryList): readonly EntryPart[] {
		return this.look.parts?.(column) ?? [];
	}

	/** The part a list spot stands in, where its list decides what a new task writes. */
	private partAt(spot: ListSpot): EntryPart | null {
		return this.parts(spot.column).find((part) => part.group === spot.place.group) ?? null;
	}

	/** The project a new task's field opened at `spot` starts with: its part's, where the list has parts; none elsewhere. */
	private partProject(spot: EntrySpot): string | null {
		const list = listSpot(spot);
		return (list && this.partAt(list)?.newTask?.project) ?? null;
	}

	/** The lists a task is looked for in: the shown ones first, then every other the entry knows. */
	private lookOrder(): readonly EntryList[] {
		const shown = this.look.shown();
		return [...shown, ...ENTRY_LISTS.filter((c) => !shown.includes(c))];
	}

	/** After the last card, in the last section, at the top level; with `project`, of that project's part where the list draws one. */
	private endOf(column: EntryList): EntrySpot {
		const sections = this.look.sections(column);
		const group = sections.length > 0 ? sections[sections.length - 1] : null;
		return { kind: "list", column, place: { kind: "gap", index: this.look.cards(column).length, level: 0, group } };
	}

	private find(key: TaskKey): { readonly column: EntryList; readonly index: number } | null {
		for (const column of this.lookOrder()) {
			const index = this.look.cards(column).findIndex((card) => samePlace(card.key, key));
			if (index >= 0) return { column, index };
		}
		return null;
	}

	/** Saved, then a new line under the task; a blank text cancels the rename. */
	private enterRename(field: EntryField, rename: EntryRename): void {
		const list = listSpot(this.run(field.run).spot);
		if (this.blank(field.text)) this.reset(null);
		else {
			this.saveRename(field, rename);
			const under = list && !rename.face && this.under(list, rename.item);
			this.reset(under ? { run: this.newRun(under), text: "", priority: null, labels: [], repeat: null, rename: null, section: false, project: this.partProject(under) } : null);
		}
	}

	/** The section goes to the queue and the field closes; a blank name writes nothing. */
	private enterSection(field: EntryField): void {
		this.createSection(field);
		this.reset(null);
	}

	/** As in Obsidian: a level shallower, and the end of the entry where it can go no shallower. */
	private enterBlank(): void {
		if (this.shifted(-1)) this.indent(-1);
		else this.reset(null);
	}

	/** The task goes to the queue; the next field opens at once, without a priority, labels or a repeat. A slot takes one task only. */
	private enterTask(field: EntryField): void {
		this.create(field);
		const ends = this.run(field.run).spot.kind === "slot";
		this.reset(ends ? null : { ...field, text: "", priority: null, labels: [], repeat: null });
	}

	/** The field becomes `field` (none: closed); the runs it stands on are held while it does. `sameShifts`: only its text or marks changed. */
	private reset(field: EntryField | null, sameShifts = false): void {
		const old = this.session.field;
		for (const run of runsOf(field)) this.hold(run);
		for (const run of runsOf(old)) this.release(run);
		this.session.field = field;
		if (!sameShifts) this.shifts = null;
		this.changed();
	}

	private save(field: EntryField): void {
		if (field.section) return this.createSection(field);
		if (this.blank(field.text)) return;
		if (field.rename) this.saveRename(field, field.rename);
		else this.create(field);
	}

	/** Edits by the key the lists give the task when the job runs: the one read at the open may have gone stale. The task's own rule and labels, the same in the field, are left as the file has them. */
	private saveRename(field: EntryField, { item, home }: EntryRename): void {
		const project = field.project === undefined || inProject(item.project?.name ?? null, field.project) ? {} : { project: field.project };
		const draft: TaskDraft = { text: field.text, placement: this.placement(field), priority: field.priority, ...(!sameNames(field.labels, item.labels.map((l) => l.name)) && { labels: field.labels }), ...(!sameRule(field.repeat, item.repeat) && { repeat: field.repeat }), ...project };
		this.queue(home, { id: this.jobId(), kind: "rename", home, item, draft });
	}

	/** `### name` queued where the field stands; always at the top level. */
	private createSection(field: EntryField): void {
		const name = field.text.trim();
		const list = listSpot(this.run(field.run).spot);
		if (name === "" || !list) return;
		this.queue(field.run, { id: this.jobId(), kind: "section", run: field.run, name, column: list.column, place: list.place });
	}

	/** The renamed task's key as the lists show it now: the card at its place while that is still it. */
	private keyAt(home: string, item: TaskItem): TaskKey {
		const run = this.run(home);
		const list = run && listSpot(run.spot);
		if (!list) return item.key;
		const card = this.look.cards(list.column)[list.place.index];
		return card && sameLine(card.key, item.key) ? card.key : item.key;
	}

	/** The field's text queued at its run, waiting under the cards until the lists show it written. */
	private create(field: EntryField): void {
		const run = this.run(field.run);
		const line: EntryLine = { text: field.text, priority: field.priority, labels: field.labels, repeat: field.repeat, level: listSpot(run.spot)?.place.level ?? 0, project: field.project ?? null, ...(field.placement && { placement: field.placement }) };
		run.pending.push(line);
		this.queue(field.run, { id: this.jobId(), kind: "create", run: field.run, line });
	}

	/** A job for `run`, which keeps following the cards that land until the job is done. */
	private queue(run: string, job: EntryJob): void {
		this.hold(run);
		this.session.jobs.push(job);
		this.queued(job);
	}

	private jobId(): string {
		return `j${this.session.next++}`;
	}

	/**
	 * The places at or past the created task's card move down, when `column` is to show it among `cards`. A key gone stale
	 * because another write or a sync landed between the create and this read finds no card: the field then stays where it
	 * is, as for a task put elsewhere.
	 */
	private landed(column: EntryList, created: TaskKey | CreatedTask, cards: readonly ListCard[]): void {
		const key = "key" in created ? created.key : created;
		const id = "key" in created ? created.id : created.id;
		const index = cards.findIndex((card) => {
			const own = card.id ?? card.key.id;
			return id !== undefined && own !== undefined ? own === id : samePlace(card.key, key) && sameLine(card.key, key);
		});
		if (index < 0) return;
		for (const run of Object.values(this.session.runs)) {
			const list = listSpot(run.spot);
			if (!list || list.column !== column || list.place.index < index) continue;
			run.spot = { ...list, place: { ...list.place, index: list.place.index + 1 } };
		}
	}

	/** Right under a renamed task at its level, or its first subtask when it shows some: nothing may stand between a task and them. */
	private under(spot: ListSpot, item: TaskItem): EntrySpot {
		const { place } = spot;
		const shown = item.subtasks.length > 0 && !item.collapsed;
		return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (shown ? 1 : 0) } };
	}

	/** The field's place a level deeper or shallower; null when the cards around forbid it, or the field does not move (a rename, a slot, a stack). */
	private shifted(delta: 1 | -1): GapPlace | null {
		const field = this.session.field;
		const list = field && listSpot(this.run(field.run).spot);
		if (!field || field.rename || !list) return null;
		return this.shiftedRun(field.run, this.look.cards(list.column), delta);
	}

	/** The run's place a level deeper or shallower, bound by `cards` with the texts entered there standing in before it. */
	private shiftedRun(id: string, cards: readonly ListCard[], delta: 1 | -1): GapPlace | null {
		const run = this.run(id);
		const list = listSpot(run.spot);
		if (!list) return null;
		const { place } = list;
		const unwritten = run.pending.map((line): LevelCard => ({ level: line.level, group: place.group }));
		const shown: LevelCard[] = [...cards.slice(0, place.index), ...unwritten, ...cards.slice(place.index)];
		const shifted = shiftLevel(shown, { ...place, index: place.index + unwritten.length }, delta);
		return shifted && { ...place, level: shifted.level };
	}

	private blank(text: string): boolean {
		return this.tasks.isBlank(text);
	}

	private changed(): void {
		this.emit(this.state);
	}
}

/** What a drop of the plus on a list means for the file; null for a drop elsewhere. */
function placeOfDrop(result: DropTo): ListPlace | null {
	switch (result.kind) {
		case "list":
			return { kind: "task", group: null, before: result.before };
		case "group":
			return { kind: "task", group: result.group, before: result.before };
		case "nest":
			return { kind: "subtask", parent: result.parent, before: result.before };
		case "place":
			return result.place ?? { kind: "task", group: null, before: null };
		default:
			return null;
	}
}

/** The place button's tiles for a task going to `place`: the lists, then Date, the one it goes to on. */
function placeChoices(place: Placement | null): readonly PlaceChoice[] {
	const lists = ENTRY_PLACES.map((kind): PlaceChoice => ({ kind, on: place?.kind === kind }));
	return [...lists, { kind: "date", on: place?.kind === "date", date: place?.kind === "date" ? place.date : null }];
}

/** The Project button for a field (or the New Task sheet) whose project is `link`, null for none, among the `known` project notes. */
export function entryProject(link: string | null, known: readonly ProjectRef[]): EntryProject {
	const ref = refOf(link, known);
	return { page: projectPage([ref ? [ref] : []], known.map((project) => ({ project, depth: project.path.length - 1 }))), lit: link !== null };
}

/** The project of link `link` as the Project page shows it: the project note of that name, else the name alone. */
function refOf(link: string | null, known: readonly ProjectRef[]): ProjectRef | null {
	if (link === null) return null;
	const name = projectName(link);
	return known.find((ref) => projectKey(ref.name) === projectKey(name)) ?? { name, path: [name], note: null, canOpenNote: false, mark: true };
}

/** The renamed task as its field stands: in the place of its result's card, that card's key and id. */
function faced(rename: EntryRename): TaskItem {
	const { item, face } = rename;
	return face ? { ...item, key: face, id: face.id ?? item.id } : item;
}

function runsOf(field: EntryField | null): string[] {
	if (!field) return [];
	return field.rename ? [field.run, field.rename.home] : [field.run];
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((name, i) => name === b[i]);
}
