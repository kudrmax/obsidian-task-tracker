import type { GroupName, LocalDate, Slot } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import { sameRule } from "../domain/Repeat";
import { repeatDay } from "../domain/RepeatDraft";
import type { GroupedList } from "../domain/Lists";
import type { Placement, TaskDraft } from "../domain/Placement";
import { samePlacement } from "../domain/operations";
import type { DraftMarks, DropColumn, DropTo, NewTaskPlace, TaskItem, TaskKey, TaskService } from "./contracts";
import { fitLevel, type GapPlace, gapOfPlace, type LevelCard, type ListCard, type ListPlace, placeOfGap, shiftLevel } from "./nesting";
import { sameLine, samePlace } from "./taskKeys";

/** Where the field stands: a gap of a list, a slot on the calendar, or the end of a task's subtasks in the calendar menu. */
export type EntrySpot =
	| { readonly kind: "list"; readonly column: DropColumn; readonly place: GapPlace }
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "stack"; readonly parent: TaskKey };

/** A text entered and not yet written, at the level it was entered at. */
export interface PendingText {
	readonly text: string;
	readonly level: number;
}

/** The places the bar offers a task, before the date: the lists, in this order. */
export const ENTRY_PLACES: readonly GroupedList[] = ["inbox", "backlog", "soon", "now"];

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
	/** The task whose text the field edits; null for a new one. */
	readonly renaming: TaskItem | null;
	/** The field shifts a level at all: one in a list writing a task; then whether it can go a level in or out now. */
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The field writes a section's name; null where it cannot (a rename, a slot, a stack, a column without sections). */
	readonly section: boolean | null;
	/** The priority and labels the task is written with, and what may still be chosen: the service's answer for the field. */
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
}

/** A place chosen in the bar: the column the field now stands at the end of, and the day the day column must open, if another. */
export interface PlaceMove {
	readonly column: DropColumn;
	readonly day: LocalDate | null;
}

/** What the entry reads of the service, all synchronous: the marks and the places. */
export type EntryTasks = Pick<TaskService, "placementOf" | "placementOfDay" | "dayOfPlacement" | "parseTitle" | "isBlank" | "withPriority" | "draftMarks" | "newSlot">;

/**
 * What the entry reads of the screen, as it stands now: its lists' cards and sections, the day it shows, and which of
 * the lists it shows. How they are laid out is the frontend's.
 */
export interface EntryLook {
	/** The cards of `column` as it shows the file now; none while it does not show. */
	cards(column: DropColumn): readonly ListCard[];
	/** The sections `column` draws, in order; none while it does not show. */
	sections(column: DropColumn): readonly GroupName[];
	/** The column shows sections, so a section may be written in it. */
	sectioned(column: DropColumn): boolean;
	/** The day the day column shows. */
	day(): LocalDate;
	today(): LocalDate;
	/**
	 * The lists the screen shows, in its order: a task is looked for in those first, then in the others (the day's, Soon,
	 * Inbox, Backlog); the plus opens the field in the day's list while it shows, else in Inbox.
	 */
	shown(): readonly DropColumn[];
}

/** A line entered: its text, the level it was entered at, and its marks. */
export interface EntryLine extends PendingText {
	readonly priority: string | null;
	readonly labels: readonly string[];
	readonly repeat: RepeatRule | null;
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
	/** The field writes a section's name (empty sections spec §4). */
	readonly section: boolean;
}

/**
 * A write the entry waits to make, in the order queued: once the lists show the writes before it, `QuickEntry.call` says
 * which call of the task service it is. `landing`, of a task written in a list: the column its card lands in.
 */
export type EntryJob =
	| { readonly id: string; readonly kind: "create"; readonly run: string; readonly line: EntryLine; landing?: DropColumn | null; shown?: boolean }
	| { readonly id: string; readonly kind: "rename"; readonly home: string; readonly item: TaskItem; readonly draft: TaskDraft }
	| { readonly id: string; readonly kind: "section"; readonly run: string; readonly name: string; readonly column: DropColumn; readonly place: GapPlace };

/** The entry's whole state, plain data: what a frontend without a long-lived entry keeps between calls. */
export interface EntrySession {
	field: EntryField | null;
	readonly runs: Record<string, EntryRun>;
	readonly jobs: EntryJob[];
	next: number;
}

/** The service call a job is, read once the lists show the writes before it. */
export type EntryCall =
	| { readonly method: "createInPlace"; readonly args: readonly [string, string | null, NewTaskPlace, RepeatRule | null, readonly string[]] }
	| { readonly method: "edit"; readonly args: readonly [TaskKey, TaskDraft] }
	| { readonly method: "createSection"; readonly args: readonly [string, Extract<NewTaskPlace, { readonly kind: "list" | "day" }>] };

export function emptySession(): EntrySession {
	return { field: null, runs: {}, jobs: [], next: 0 };
}

type ListSpot = Extract<EntrySpot, { kind: "list" }>;

function listSpot(spot: EntrySpot): ListSpot | null {
	return spot.kind === "list" ? spot : null;
}

/** The columns, after the shown ones, a task is looked for in. */
const ALL_COLUMNS: readonly DropColumn[] = ["day", "soon", "inbox", "backlog"];

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
		const marks = this.tasks.draftMarks(field.text, field.priority, field.labels);
		const task = !field.section;
		const place = task ? this.shownPlace(field) : null;
		const run = this.run(field.run);
		return {
			spot: run.spot,
			text: field.text,
			priority: field.priority,
			labels: field.labels,
			repeat: field.repeat,
			pending: run.pending.map(({ text, level }) => ({ text, level })),
			renaming: field.rename?.item ?? null,
			indents: task && listSpot(run.spot) !== null,
			...this.mayShift(field),
			section: this.maySection(field) ? field.section : null,
			marks,
			markable: task && marks.tiles.levels.length + marks.tiles.labels.length > 0,
			place,
			places: placeChoices(place),
			repeatable: task && run.spot.kind !== "slot",
			repeatDay: repeatDay(place && this.tasks.dayOfPlacement(place), this.look.today()),
		};
	}

	/** The renamed task, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
	get renaming(): TaskKey | null {
		return this.session.field?.rename?.item.key ?? null;
	}

	/** What `column`'s list draws for the field: its gap, the texts waiting before it, and whether it is a section's name; null when it stands elsewhere. */
	listEntry(column: DropColumn): { readonly place: GapPlace; readonly pending: readonly PendingText[]; readonly section: boolean } | null {
		const state = this.state;
		const list = state && listSpot(state.spot);
		if (!state || !list || list.column !== column) return null;
		return { place: list.place, pending: state.pending, section: state.section === true };
	}

	/** A double click on a list's free room: the field after the last card, in the last section, at the top level. */
	openAtEnd(column: DropColumn): void {
		this.open(this.endOf(column));
	}

	/** The plus tapped: the end of the day column while it shows, else of Inbox. */
	openFromPlus(): void {
		this.openAtEnd(this.look.shown().includes("day") ? "day" : "inbox");
	}

	/** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
	openIn(column: DropColumn, group: GroupName): void {
		const cards = this.look.cards(column);
		this.open({ kind: "list", column, place: { kind: "gap", index: gapOfPlace(cards, { kind: "task", group, before: null }).index, level: 0, group } });
	}

	/** A long tap on the timeline's free room let go: the field of a new task in that slot. */
	openSlot(slot: Slot): void {
		this.open({ kind: "slot", slot });
	}

	/** The plus came to rest on `column` (null: off the lists) with `result`: the field opens where the drop showed; false where it opens nowhere. */
	openAtDrop(column: DropColumn | null, result: DropTo | null): boolean {
		const place = result && column ? placeOfDrop(result) : null;
		if (column && place) this.open({ kind: "list", column, place: gapOfPlace(this.look.cards(column), place) });
		else if (result?.kind === "time") this.openSlot(this.tasks.newSlot(this.look.day(), result.start));
		else return false;
		return true;
	}

	/** Where a new subtask of `parent` is typed: last among its subtasks in the list that shows it, else last in its menu's stack. */
	subtaskSpot(parent: TaskKey): EntrySpot {
		const found = this.find(parent);
		if (!found) return { kind: "stack", parent };
		return { kind: "list", column: found.column, place: gapOfPlace(this.look.cards(found.column), { kind: "subtask", parent, before: null }) };
	}

	/**
	 * Where `item` is renamed: right before its card in the list that shows it; else, opened from a menu's stack, there; else
	 * over its card on the timeline; null when it shows nowhere the field can stand.
	 */
	renameSpot(item: TaskItem, inStack: boolean): EntrySpot | null {
		const found = this.find(item.key);
		if (found) {
			const card = this.look.cards(found.column)[found.index];
			return { kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } };
		}
		if (inStack) return { kind: "stack", parent: item.key };
		return item.slot ? { kind: "slot", slot: item.slot } : null;
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(spot: EntrySpot, renaming?: TaskItem): void {
		if (this.session.field) this.save(this.session.field);
		const rename = renaming ? { item: renaming, home: this.newRun(spot), moved: false } : null;
		this.reset({ run: this.newRun(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, labels: renaming?.labels.map((l) => l.name) ?? [], repeat: renaming?.repeat ?? null, rename, section: false });
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
		const column: DropColumn = placement.kind === "now" || placement.kind === "date" ? "day" : placement.kind;
		const rename = field.rename && { ...field.rename, moved: true };
		this.reset({ ...field, rename, run: this.newRun(this.endOf(column)) });
		const day = this.tasks.dayOfPlacement(placement);
		return { column, day: day === null || day === this.look.day() ? null : day };
	}

	/** The field, its text and marks, at the end of `column`; what was entered at the old spot is still written there. */
	moveToEnd(column: DropColumn): void {
		const field = this.session.field;
		if (field) this.reset({ ...field, run: this.newRun(this.endOf(column)) });
	}

	/** Where a task written in `column` goes: a list's place, or the day column's on the day it shows. */
	placeOf(column: DropColumn, result: ListPlace): NewTaskPlace {
		if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
		const { group, before } = result;
		if (column !== "day") return { kind: "list", list: column, group, before };
		return { kind: "day", date: this.look.day(), group, before };
	}

	job(id: string): EntryJob {
		const job = this.session.jobs.find((j) => j.id === id);
		if (!job) throw new Error(`Task Calendar: no entry job ${id}`);
		return job;
	}

	/**
	 * The service call job `id` is, read when the lists show every write before it: a task at the level it was entered at,
	 * as far as the cards then allow; a rename by the key the lists give the task then; a section at the top level where the
	 * field stood. Null when it is nothing to write. A slot takes no rule.
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
						return { method: "createInPlace", args: [line.text, line.priority, { kind: "slot", slot: spot.slot }, null, line.labels] };
					case "stack":
						return { method: "createInPlace", args: [line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null }, line.repeat, line.labels] };
					case "list": {
						const cards = this.look.cards(spot.column);
						const place = fitLevel(cards, { ...spot.place, level: line.level });
						job.landing = spot.column;
						return { method: "createInPlace", args: [line.text, line.priority, this.placeOf(spot.column, placeOfGap(cards, place)), line.repeat, line.labels] };
					}
				}
				break;
			}
			case "rename":
				return { method: "edit", args: [this.keyAt(job.home, job.item), job.draft] };
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
	shown(id: string, created: TaskKey | null, coming: (column: DropColumn) => readonly ListCard[]): void {
		const job = this.job(id);
		if (job.kind !== "create") return;
		const held = this.session.field?.run ?? null;
		const was = held === null ? null : this.run(held).spot;
		if (job.landing && created) this.landed(job.landing, created, coming(job.landing));
		this.run(job.run).pending.shift();
		job.shown = true;
		this.shifts = null;
		if (held !== null && (held === job.run || this.run(held).spot !== was)) this.emit(this.state, true);
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
		this.release(job.kind === "rename" ? job.home : job.run);
		this.session.jobs.splice(this.session.jobs.indexOf(job), 1);
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
	private topLevelAfter(column: DropColumn, place: GapPlace): GapPlace {
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
		return list.place.level > 0 ? null : this.columnPlacement(list.column);
	}

	/** Where a renamed task goes: where it was, until a place is chosen in the bar. */
	private placement(field: EntryField): Placement {
		const item = field.rename?.item ?? null;
		const list = listSpot(this.run(field.run).spot);
		if (list && (field.rename?.moved || !item)) return this.columnPlacement(list.column);
		return item ? this.tasks.placementOf(item) : this.columnPlacement("day");
	}

	private columnPlacement(column: DropColumn): Placement {
		return column === "day" ? this.tasks.placementOfDay(this.look.day()) : { kind: column };
	}

	/** After the last card, in the last section, at the top level. */
	private endOf(column: DropColumn): EntrySpot {
		const sections = this.look.sections(column);
		return { kind: "list", column, place: { kind: "gap", index: this.look.cards(column).length, level: 0, group: sections[sections.length - 1] ?? null } };
	}

	private find(key: TaskKey): { readonly column: DropColumn; readonly index: number } | null {
		const shown = this.look.shown();
		for (const column of [...shown, ...ALL_COLUMNS.filter((c) => !shown.includes(c))]) {
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
			this.reset(list ? { run: this.newRun(this.under(list, rename.item)), text: "", priority: null, labels: [], repeat: null, rename: null, section: false } : null);
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
		this.reset(this.run(field.run).spot.kind === "slot" ? null : { ...field, text: "", priority: null, labels: [], repeat: null });
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
		const draft: TaskDraft = { text: field.text, placement: this.placement(field), priority: field.priority, ...(!sameNames(field.labels, item.labels.map((l) => l.name)) && { labels: field.labels }), ...(!sameRule(field.repeat, item.repeat) && { repeat: field.repeat }) };
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
		const line: EntryLine = { text: field.text, priority: field.priority, labels: field.labels, repeat: field.repeat, level: listSpot(run.spot)?.place.level ?? 0 };
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
	private landed(column: DropColumn, created: TaskKey, cards: readonly ListCard[]): void {
		const index = cards.findIndex((card) => samePlace(card.key, created) && sameLine(card.key, created));
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
		default:
			return null;
	}
}

/** The place button's tiles for a task going to `place`: the lists, then Date, the one it goes to on. */
function placeChoices(place: Placement | null): readonly PlaceChoice[] {
	const lists = ENTRY_PLACES.map((kind): PlaceChoice => ({ kind, on: place?.kind === kind }));
	return [...lists, { kind: "date", on: place?.kind === "date", date: place?.kind === "date" ? place.date : null }];
}

function runsOf(field: EntryField | null): string[] {
	if (!field) return [];
	return field.rename ? [field.run, field.rename.home] : [field.run];
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((name, i) => name === b[i]);
}
