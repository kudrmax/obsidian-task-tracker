import type { GroupName, LocalDate, Slot } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import { sameRule } from "../domain/Repeat";
import type { GroupedList } from "../domain/Lists";
import type { Placement, TaskDraft } from "../domain/Placement";
import { samePlacement } from "../domain/operations";
import type { DraftMarks, DropColumn, DropTo, NewTaskPlace, RightMode, TaskItem, TaskKey, TaskService } from "./contracts";
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
	/** The field shifts a level at all: one in a list; then whether it can go a level in or out now. */
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The field writes a section's name; null where it cannot (a rename, a slot, a stack, a column without sections). */
	readonly section: boolean | null;
	/** The priority and labels the task is written with, and what may still be chosen: the service's answer for the field. */
	readonly marks: DraftMarks;
	/** Where the task goes, for the place button; null for a field with no place of its own (a subtask, a slot, a stack). */
	readonly place: Placement | null;
	/** The lists the place button offers, before the date. */
	readonly places: readonly GroupedList[];
	/** The field may repeat: one in a slot may not. */
	readonly repeatable: boolean;
	/** The day a new rule starts from: the field's own day, else today. */
	readonly repeatDay: LocalDate;
}

/** What the session reads from the service: the marks, the places and the writes. */
export type QuickEntryTasks = Pick<TaskService, "createInPlace" | "createSection" | "edit" | "placementOf" | "placementOfDay" | "dayOfPlacement" | "parseTitle" | "isBlank" | "withPriority" | "draftMarks">;

/** What the session reads from the screen, and tells it. */
export interface QuickEntryView {
	/** The cards of `column` as it shows the file now; none while it does not show. */
	cards(column: DropColumn): readonly ListCard[];
	/** The sections `column` draws, in order; none while it does not show. */
	sections(column: DropColumn): readonly GroupName[];
	/** The column shows sections, so a section may be written in it. */
	sectioned(column: DropColumn): boolean;
	/** The day the day column shows. */
	day(): LocalDate;
	today(): LocalDate;
	/** Which pair of columns the window shows: a task is looked for in those first. */
	mode(): RightMode;
	/**
	 * Resolves once the lists show the file as of the last write; `beforeShow` runs right before they draw it, given the
	 * cards each column is about to draw.
	 */
	fresh(beforeShow?: (coming: (column: DropColumn) => readonly ListCard[]) => void): Promise<void>;
	/**
	 * After every change of the state; null once the field closed. `drawnNext`: the lists are about to draw the data this
	 * change belongs to, so it needs no drawing of its own.
	 */
	onChange(state: EntryState | null, drawnNext?: boolean): void;
}

/** The writes, one at a time in the order pushed; a failing one is reported by the queue and the next one still runs. */
export interface WriteLine {
	push(job: () => Promise<void>): void;
	/** Resolves once every job pushed so far, and every one they pushed, has run. */
	idle(): Promise<void>;
}

/** A place chosen in the bar: the column the field now stands at the end of, and the day the day column must open, if another. */
export interface PlaceMove {
	readonly column: DropColumn;
	readonly day: LocalDate | null;
}

/** The columns to look for a task in: those the window shows first. */
const LOOK_IN: Readonly<Record<RightMode, readonly DropColumn[]>> = {
	calendar: ["day", "soon", "inbox", "backlog"],
	soon: ["soon", "day", "inbox", "backlog"],
	inbox: ["inbox", "backlog", "soon", "day"],
};

interface Line extends PendingText {
	readonly priority: string | null;
	readonly labels: readonly string[];
	readonly repeat: RepeatRule | null;
}

/**
 * A spot the entry still writes at or reads from: the field's, a renamed task's own, one whose texts are queued. Its
 * place in a list follows the cards that land, so it keeps meaning the same gap until the file catches up with it.
 */
class Run {
	readonly pending: Line[] = [];

	constructor(public spot: EntrySpot) {}

	/** A card landed in `column` at `index`: a place at or past it is a card further down now. */
	landed(column: DropColumn, index: number): void {
		const list = listSpot(this.spot);
		if (!list || list.column !== column || list.place.index < index) return;
		this.spot = { ...list, place: { ...list.place, index: list.place.index + 1 } };
	}

	/** The place a level deeper or shallower, bound by `cards` with the texts entered here standing in before it. */
	shifted(cards: readonly ListCard[], delta: 1 | -1): GapPlace | null {
		const list = listSpot(this.spot);
		if (!list) return null;
		const { place } = list;
		const unwritten = this.pending.map((line): LevelCard => ({ level: line.level, group: place.group }));
		const shown: LevelCard[] = [...cards.slice(0, place.index), ...unwritten, ...cards.slice(place.index)];
		const shifted = shiftLevel(shown, { ...place, index: place.index + unwritten.length }, delta);
		return shifted && { ...place, level: shifted.level };
	}
}

/** The runs held by the field or by a queued write: those whose places follow the cards that land. */
class Runs {
	private readonly holds = new Map<Run, number>();

	hold(run: Run): void {
		this.holds.set(run, (this.holds.get(run) ?? 0) + 1);
	}

	release(run: Run): void {
		const holds = (this.holds.get(run) ?? 0) - 1;
		if (holds > 0) this.holds.set(run, holds);
		else this.holds.delete(run);
	}

	landed(column: DropColumn, index: number): void {
		for (const run of this.holds.keys()) run.landed(column, index);
	}
}

/** A rename: the task, and its own place, which stays its even when the field moves to another spot. */
interface Rename {
	readonly item: TaskItem;
	readonly home: Run;
	/** A place was chosen in the bar: the task goes where the field now stands, not where it was. */
	readonly moved: boolean;
}

/** What the field may do, worked out for these cards and this spot of its run. */
interface Shifts {
	readonly cards: readonly ListCard[];
	readonly spot: EntrySpot;
	readonly indent: boolean;
	readonly outdent: boolean;
}

interface Field {
	readonly run: Run;
	readonly text: string;
	readonly priority: string | null;
	readonly labels: readonly string[];
	readonly repeat: RepeatRule | null;
	readonly rename: Rename | null;
	/** The field writes a section's name (empty sections spec §4). */
	readonly section: boolean;
}

/**
 * Typing tasks in place (quick-add spec §4.2–4.9), every rule of it: where a field opens, what Enter, a tap elsewhere and
 * Escape mean, how far it shifts, what its bar offers, where each line is written. Enter writes the task where the field
 * stands and opens the next one under it at once, while the writes go to the file one at a time; a line entered waits
 * under the cards until the lists show it written. A rename edits the task, then goes on as a new line under it. The
 * frontend draws the state and turns gestures into calls.
 */
export class QuickEntrySession {
	private readonly runs = new Runs();
	private field: Field | null = null;
	/** Kept while the field only changes its text or level, which do not change where it may go. */
	private shifts: Shifts | null = null;

	constructor(private readonly tasks: QuickEntryTasks, private readonly view: QuickEntryView, private readonly writes: WriteLine) {}

	get state(): EntryState | null {
		const field = this.field;
		if (!field) return null;
		const marks = this.tasks.draftMarks(field.text, field.priority, field.labels);
		const place = this.shownPlace(field);
		return {
			spot: field.run.spot,
			text: field.text,
			priority: field.priority,
			labels: field.labels,
			repeat: field.repeat,
			pending: field.run.pending.map(({ text, level }) => ({ text, level })),
			renaming: field.rename?.item ?? null,
			indents: listSpot(field.run.spot) !== null,
			...this.mayShift(field),
			section: this.maySection(field) ? field.section : null,
			marks,
			place,
			places: ENTRY_PLACES,
			repeatable: field.run.spot.kind !== "slot",
			repeatDay: (place && this.tasks.dayOfPlacement(place)) ?? this.view.today(),
		};
	}

	/** The renamed task, whose card every list hides while the rename is open, wherever the field stands (§4.8). */
	get renaming(): TaskKey | null {
		return this.field?.rename?.item.key ?? null;
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

	/** The plus tapped: the end of the day column while it shows, of Inbox when the window shows Inbox and Soon. */
	openFromPlus(): void {
		this.openAtEnd(this.view.mode() === "inbox" ? "inbox" : "day");
	}

	/** The No tasks plate of empty section `group` tapped: the field of a new task in it. */
	openIn(column: DropColumn, group: GroupName): void {
		const cards = this.view.cards(column);
		this.open({ kind: "list", column, place: { kind: "gap", index: gapOfPlace(cards, { kind: "task", group, before: null }).index, level: 0, group } });
	}

	/** A long tap on the timeline's free room let go: the field of a new task in that slot. */
	openSlot(slot: Slot): void {
		this.open({ kind: "slot", slot });
	}

	/** The plus came to rest on `column` (null: off the lists) with `result`: the field opens where the drop showed; false where it opens nowhere. */
	openAtDrop(column: DropColumn | null, result: DropTo | null): boolean {
		const place = result && column ? placeOfDrop(result) : null;
		if (column && place) this.open({ kind: "list", column, place: gapOfPlace(this.view.cards(column), place) });
		else if (result?.kind === "slot") this.openSlot(result.slot);
		else return false;
		return true;
	}

	/** Where a new subtask of `parent` is typed: last among its subtasks in the list that shows it, else last in its menu's stack. */
	subtaskSpot(parent: TaskKey): EntrySpot {
		const found = this.find(parent);
		if (!found) return { kind: "stack", parent };
		return { kind: "list", column: found.column, place: gapOfPlace(this.view.cards(found.column), { kind: "subtask", parent, before: null }) };
	}

	/**
	 * Where `item` is renamed: right before its card in the list that shows it; else, opened from a menu's stack, there; else
	 * over its card on the timeline; null when it shows nowhere the field can stand.
	 */
	renameSpot(item: TaskItem, inStack: boolean): EntrySpot | null {
		const found = this.find(item.key);
		if (found) {
			const card = this.view.cards(found.column)[found.index];
			return { kind: "list", column: found.column, place: { kind: "gap", index: found.index, level: card.level, group: card.group } };
		}
		if (inStack) return { kind: "stack", parent: item.key };
		return item.slot ? { kind: "slot", slot: item.slot } : null;
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(spot: EntrySpot, renaming?: TaskItem): void {
		if (this.field) this.save(this.field);
		const rename = renaming ? { item: renaming, home: new Run(spot), moved: false } : null;
		this.reset({ run: new Run(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, labels: renaming?.labels.map((l) => l.name) ?? [], repeat: renaming?.repeat ?? null, rename, section: false });
	}

	type(text: string): void {
		if (this.field) this.reset({ ...this.field, text }, true);
	}

	/** A level chosen takes the place of a prefix typed: the text keeps no prefix, so the file gets one. Null takes the level off. */
	setPriority(prefix: string | null): void {
		const field = this.field;
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
		if (this.field) this.reset({ ...this.field, labels }, true);
	}

	/** A label's tile tapped: on when the task is not written with it, else off. */
	toggleLabel(name: string): void {
		const state = this.state;
		if (!state) return;
		const chosen = state.marks.labels.map((l) => l.name);
		this.setLabels(chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name]);
	}

	setRepeat(rule: RepeatRule | null): void {
		if (this.field) this.reset({ ...this.field, repeat: rule }, true);
	}

	indent(delta: 1 | -1): void {
		const place = this.shifted(delta);
		const run = this.field?.run;
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
		const field = this.field;
		const list = field && listSpot(field.run.spot);
		if (!field || !list || !this.maySection(field)) return;
		const section = !field.section;
		const run = section && list.place.level > 0 ? new Run({ ...list, place: this.topLevelAfter(list.column, list.place) }) : field.run;
		this.reset({ ...field, run, section });
	}

	enter(): void {
		const field = this.field;
		if (!field) return;
		if (field.rename) this.enterRename(field, field.rename);
		else if (field.section) this.enterSection(field);
		else if (this.blank(field.text)) this.enterBlank();
		else this.enterTask(field);
	}

	/** A tap elsewhere: the text is kept as by Enter, and the field closes. */
	blur(): void {
		if (!this.field) return;
		this.save(this.field);
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
		const field = this.field;
		if (!field) return null;
		const shown = this.shownPlace(field);
		if (shown && samePlacement(shown, placement)) return null;
		const column: DropColumn = placement.kind === "now" || placement.kind === "date" ? "day" : placement.kind;
		const rename = field.rename && { ...field.rename, moved: true };
		this.reset({ ...field, rename, run: new Run(this.endOf(column)) });
		const day = this.tasks.dayOfPlacement(placement);
		return { column, day: day === null || day === this.view.day() ? null : day };
	}

	/** The field, its text and marks, at the end of `column`; what was entered at the old spot is still written there. */
	moveToEnd(column: DropColumn): void {
		if (this.field) this.reset({ ...this.field, run: new Run(this.endOf(column)) });
	}

	/** Resolves once every write sent so far is done. */
	idle(): Promise<void> {
		return this.writes.idle();
	}

	/** Where a task written in `column` goes: a list's place, or the day column's on the day it shows. */
	placeOf(column: DropColumn, result: ListPlace): NewTaskPlace {
		if (result.kind === "subtask") return { kind: "subtask", parent: result.parent, before: result.before };
		const { group, before } = result;
		if (column !== "day") return { kind: "list", list: column, group, before };
		return { kind: "day", date: this.view.day(), group, before };
	}

	private maySection(field: Field): boolean {
		const list = listSpot(field.run.spot);
		return !field.rename && list !== null && this.view.sectioned(list.column);
	}

	/** The gap of the top level at or after `place` in its section: past the subtasks it stands among. */
	private topLevelAfter(column: DropColumn, place: GapPlace): GapPlace {
		const cards = this.view.cards(column);
		let index = place.index;
		while (index < cards.length && cards[index].group === place.group && cards[index].level > 0) index++;
		return { ...place, index, level: 0 };
	}

	/** Whether the field may go a level deeper or shallower: worked out again only for other cards or another spot. */
	private mayShift(field: Field): { readonly canIndent: boolean; readonly canOutdent: boolean } {
		const { spot } = field.run;
		const list = listSpot(spot);
		if (field.rename || field.section || !list) return { canIndent: false, canOutdent: false };
		const cards = this.view.cards(list.column);
		const kept = this.shifts;
		if (kept?.cards === cards && kept.spot === spot) return { canIndent: kept.indent, canOutdent: kept.outdent };
		const shifts = { cards, spot, indent: field.run.shifted(cards, 1) !== null, outdent: field.run.shifted(cards, -1) !== null };
		this.shifts = shifts;
		return { canIndent: shifts.indent, canOutdent: shifts.outdent };
	}

	/** The place button: a subtask's field, new or renamed, has none, nor does one off the lists. */
	private shownPlace(field: Field): Placement | null {
		const list = listSpot(field.run.spot);
		if (!list) return null;
		if (field.rename) return field.rename.item.isSubtask ? null : this.placement(field);
		return list.place.level > 0 ? null : this.columnPlacement(list.column);
	}

	/** Where a renamed task goes: where it was, until a place is chosen in the bar. */
	private placement(field: Field): Placement {
		const item = field.rename?.item ?? null;
		const list = listSpot(field.run.spot);
		if (list && (field.rename?.moved || !item)) return this.columnPlacement(list.column);
		return item ? this.tasks.placementOf(item) : this.columnPlacement("day");
	}

	private columnPlacement(column: DropColumn): Placement {
		return column === "day" ? this.tasks.placementOfDay(this.view.day()) : { kind: column };
	}

	/** After the last card, in the last section, at the top level. */
	private endOf(column: DropColumn): EntrySpot {
		const sections = this.view.sections(column);
		return { kind: "list", column, place: { kind: "gap", index: this.view.cards(column).length, level: 0, group: sections[sections.length - 1] ?? null } };
	}

	private find(key: TaskKey): { readonly column: DropColumn; readonly index: number } | null {
		for (const column of LOOK_IN[this.view.mode()]) {
			const index = this.view.cards(column).findIndex((card) => samePlace(card.key, key));
			if (index >= 0) return { column, index };
		}
		return null;
	}

	/** Saved, then a new line under the task; a blank text cancels the rename. */
	private enterRename(field: Field, rename: Rename): void {
		const list = listSpot(field.run.spot);
		if (this.blank(field.text)) this.reset(null);
		else {
			this.saveRename(field, rename);
			this.reset(list ? { run: new Run(this.under(list, rename.item)), text: "", priority: null, labels: [], repeat: null, rename: null, section: false } : null);
		}
	}

	/** The section goes to the queue and the field closes; a blank name writes nothing. */
	private enterSection(field: Field): void {
		this.createSection(field);
		this.reset(null);
	}

	/** As in Obsidian: a level shallower, and the end of the entry where it can go no shallower. */
	private enterBlank(): void {
		if (this.shifted(-1)) this.indent(-1);
		else this.reset(null);
	}

	/** The task goes to the queue; the next field opens at once, without a priority, labels or a repeat. A slot takes one task only. */
	private enterTask(field: Field): void {
		this.create(field);
		this.reset(field.run.spot.kind === "slot" ? null : { ...field, text: "", priority: null, labels: [], repeat: null });
	}

	/**
	 * The field becomes `field` (none: closed); the runs it stands on are held while it does. `sameShifts`: only its text
	 * or marks changed, so what it may do stands.
	 */
	private reset(field: Field | null, sameShifts = false): void {
		const old = this.field;
		for (const run of runsOf(field)) this.runs.hold(run);
		for (const run of runsOf(old)) this.runs.release(run);
		this.field = field;
		if (!sameShifts) this.shifts = null;
		this.changed();
	}

	private save(field: Field): void {
		if (field.section) return this.createSection(field);
		if (this.blank(field.text)) return;
		if (field.rename) this.saveRename(field, field.rename);
		else this.create(field);
	}

	/**
	 * Edits once the writes before it show, by the key the lists give the task then: the one read at the open may have gone
	 * stale. The task's own rule and labels, the same in the field, are left as the file has them.
	 */
	private saveRename(field: Field, { item, home }: Rename): void {
		const draft: TaskDraft = { text: field.text, placement: this.placement(field), priority: field.priority, ...(!sameNames(field.labels, item.labels.map((l) => l.name)) && { labels: field.labels }), ...(!sameRule(field.repeat, item.repeat) && { repeat: field.repeat }) };
		this.queued(home, async () => {
			await this.view.fresh();
			await this.tasks.edit(this.keyAt(home, item), draft);
		});
	}

	/** `### name` written where the field stands, once the lists show the writes before it; always at the top level. */
	private createSection(field: Field): void {
		const { run } = field;
		const name = field.text.trim();
		const list = listSpot(run.spot);
		if (name === "" || !list) return;
		const { column, place } = list;
		this.queued(run, async () => {
			await this.view.fresh();
			const at = this.placeOf(column, placeOfGap(this.view.cards(column), { ...place, level: 0 }));
			if (at.kind === "list" || at.kind === "day") await this.tasks.createSection(name, at);
			await this.view.fresh();
		});
	}

	/** The renamed task's key as the lists show it now: the card at its place while that is still it. */
	private keyAt(home: Run, item: TaskItem): TaskKey {
		const list = listSpot(home.spot);
		if (!list) return item.key;
		const card = this.view.cards(list.column)[list.place.index];
		return card && sameLine(card.key, item.key) ? card.key : item.key;
	}

	/** The field's text, written at its run once the lists show the writes before it: at the level it was entered at, as far as the cards then allow. */
	private create(field: Field): void {
		const { run } = field;
		const line = { text: field.text, priority: field.priority, labels: field.labels, repeat: field.repeat, level: listSpot(run.spot)?.place.level ?? 0 };
		run.pending.push(line);
		this.queued(run, async () => {
			let shown = false;
			try {
				await this.view.fresh();
				await this.write(run, line, () => (shown = true));
			} finally {
				if (!shown) {
					run.pending.shift();
					this.shifts = null;
					if (run === this.field?.run) this.changed();
				}
			}
		});
	}

	/**
	 * The line written, and shown by the lists before it stops waiting under them: it never leaves the screen for a
	 * moment. It leaves the queue, and the places at or past its card move down, in the very drawing that shows its
	 * card: where the lists are about to draw the task the file holds, which its rules may have put in another column.
	 * A slot takes no rule.
	 */
	private async write(run: Run, line: Line, onShown: () => void): Promise<void> {
		const shown = (landed?: { readonly column: DropColumn; readonly key: TaskKey | null }) => (coming: (column: DropColumn) => readonly ListCard[]) => {
			const held = this.field?.run;
			const was = held?.spot;
			if (landed?.key) this.landed(landed.column, landed.key, coming(landed.column));
			run.pending.shift();
			onShown();
			this.shifts = null;
			if (held && (held === run || held.spot !== was)) this.view.onChange(this.state, true);
		};
		const { spot } = run;
		switch (spot.kind) {
			case "slot":
				await this.tasks.createInPlace(line.text, line.priority, { kind: "slot", slot: spot.slot }, undefined, line.labels);
				return this.view.fresh(shown());
			case "stack":
				await this.tasks.createInPlace(line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null }, line.repeat, line.labels);
				return this.view.fresh(shown());
			case "list": {
				const cards = this.view.cards(spot.column);
				const place = fitLevel(cards, { ...spot.place, level: line.level });
				const key = await this.tasks.createInPlace(line.text, line.priority, this.placeOf(spot.column, placeOfGap(cards, place)), line.repeat, line.labels);
				return this.view.fresh(shown({ column: spot.column, key }));
			}
		}
	}

	/**
	 * The places at or past the created task's card move down, when `column` is to show it among `cards`. A key gone
	 * stale because another write or a sync landed between the create and this read finds no card: the field then
	 * stays where it is, as for a task put elsewhere.
	 */
	private landed(column: DropColumn, created: TaskKey, cards: readonly ListCard[]): void {
		const index = cards.findIndex((card) => samePlace(card.key, created) && sameLine(card.key, created));
		if (index >= 0) this.runs.landed(column, index);
	}

	/** A write for `run`, which keeps following the cards that land until the write is done. */
	private queued(run: Run, job: () => Promise<void>): void {
		this.runs.hold(run);
		this.writes.push(async () => {
			try {
				await job();
			} finally {
				this.runs.release(run);
			}
		});
	}

	/** Right under a renamed task at its level, or its first subtask when it shows some: nothing may stand between a task and them. */
	private under(spot: ListSpot, item: TaskItem): EntrySpot {
		const { place } = spot;
		const shown = item.subtasks.length > 0 && !item.collapsed;
		return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (shown ? 1 : 0) } };
	}

	/** The field's place a level deeper or shallower; null when the cards around forbid it, or the field does not move (a rename, a slot, a stack). */
	private shifted(delta: 1 | -1): GapPlace | null {
		const field = this.field;
		const list = field && listSpot(field.run.spot);
		if (!field || field.rename || !list) return null;
		return field.run.shifted(this.view.cards(list.column), delta);
	}

	private blank(text: string): boolean {
		return this.tasks.isBlank(text);
	}

	private changed(): void {
		this.view.onChange(this.state);
	}
}

type ListSpot = Extract<EntrySpot, { kind: "list" }>;

function listSpot(spot: EntrySpot): ListSpot | null {
	return spot.kind === "list" ? spot : null;
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

function runsOf(field: Field | null): Run[] {
	if (!field) return [];
	return field.rename ? [field.run, field.rename.home] : [field.run];
}

function sameNames(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((name, i) => name === b[i]);
}
