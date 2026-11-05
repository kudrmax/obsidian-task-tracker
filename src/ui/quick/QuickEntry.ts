import { fitLevel, type GapPlace, type LevelCard, type ListCard, type ListPlace, type NewTaskPlace, placeOfGap, shiftLevel, type Placement, type RepeatRule, sameLine, samePlace, sameRule, type TaskDraft, type TaskItem, type TaskKey, type TaskService } from "../../application/contracts";
import type { ListColumn } from "../drag/DropTarget";
import type { Slot } from "../types";
import { WriteQueue } from "./WriteQueue";

/** Where the field stands: a gap of a list, a slot on the calendar, or the end of a task's subtasks in the calendar menu. */
export type EntrySpot =
	| { readonly kind: "list"; readonly column: ListColumn; readonly place: GapPlace }
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "stack"; readonly parent: TaskKey };

/** A text entered and not yet written, at the level it was entered at. */
export interface PendingText {
	readonly text: string;
	readonly level: number;
}

export interface EntryState {
	readonly spot: EntrySpot;
	readonly text: string;
	/** A level's prefix, or none. */
	readonly priority: string | null;
	/** The rule the task repeats by, or none. */
	readonly repeat: RepeatRule | null;
	/** Texts entered here and not yet written, in order: drawn right before the field. */
	readonly pending: readonly PendingText[];
	/** The task whose text the field edits; null for a new one. */
	readonly renaming: TaskItem | null;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The field writes a section's name; null where it cannot (a rename, a slot, a stack, a column without sections). */
	readonly section: boolean | null;
}

export interface QuickEntryDeps {
	/** The cards of `column` as it shows the file now. */
	cards(column: ListColumn): readonly ListCard[];
	placeOf(column: ListColumn, result: ListPlace): NewTaskPlace;
	/**
	 * Resolves once the lists show the file as of the last write; `beforeShow` runs right before they draw it, given
	 * the cards each column is about to draw.
	 */
	fresh(beforeShow?: (coming: (column: ListColumn) => readonly ListCard[]) => void): Promise<void>;
	createInPlace: TaskService["createInPlace"];
	createSection: TaskService["createSection"];
	/** The column shows sections, so a section may be written in it. */
	sectioned(column: ListColumn): boolean;
	edit: TaskService["edit"];
	/** The placement a rename at `spot` gives the task. */
	placement(spot: EntrySpot): Placement;
	/** Nothing to write: no text, or a level's prefix alone. */
	isBlank: TaskService["isBlank"];
	/**
	 * After every change of the state; null once the field closed. `drawnNext`: the lists are about to draw the data this
	 * change belongs to, so it needs no drawing of its own.
	 */
	onChange(state: EntryState | null, drawnNext?: boolean): void;
	/** A write that failed; the ones after it still go. */
	onError(error: unknown): void;
}

interface Line extends PendingText {
	readonly priority: string | null;
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
	landed(column: ListColumn, index: number): void {
		if (this.spot.kind !== "list" || this.spot.column !== column || this.spot.place.index < index) return;
		const { place } = this.spot;
		this.spot = { ...this.spot, place: { ...place, index: place.index + 1 } };
	}

	/** The place a level deeper or shallower, bound by `cards` with the texts entered here standing in before it. */
	shifted(cards: readonly ListCard[], delta: 1 | -1): GapPlace | null {
		if (this.spot.kind !== "list") return null;
		const { place } = this.spot;
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

	landed(column: ListColumn, index: number): void {
		for (const run of this.holds.keys()) run.landed(column, index);
	}
}

/** A rename: the task, and its own place, which stays its even when the field moves to another spot. */
interface Rename {
	readonly item: TaskItem;
	readonly home: Run;
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
	readonly repeat: RepeatRule | null;
	readonly rename: Rename | null;
	/** The field writes a section's name (empty sections spec §4). */
	readonly section: boolean;
}

/**
 * Typing tasks in place (quick-add spec §4.3–4.9): Enter writes the task where the field stands and opens the next one
 * under it at once, while the writes go to the file one at a time; Tab moves the field a level within what the cards
 * around allow; a rename edits the task, then goes on as a new line under it.
 */
export class QuickEntry {
	private readonly queue: WriteQueue;
	private readonly runs = new Runs();
	private field: Field | null = null;
	/** Kept while the field only changes its text or level, which do not change where it may go. */
	private shifts: Shifts | null = null;

	constructor(private readonly deps: QuickEntryDeps) {
		this.queue = new WriteQueue((error) => deps.onError(error));
	}

	get state(): EntryState | null {
		const field = this.field;
		if (!field) return null;
		return {
			spot: field.run.spot,
			text: field.text,
			priority: field.priority,
			repeat: field.repeat,
			pending: field.run.pending.map(({ text, level }) => ({ text, level })),
			renaming: field.rename?.item ?? null,
			...this.mayShift(field),
			section: this.maySection(field) ? field.section : null,
		};
	}

	private maySection(field: Field): boolean {
		const { spot } = field.run;
		return !field.rename && spot.kind === "list" && this.deps.sectioned(spot.column);
	}

	/**
	 * The field switches between a task and a section's name. A section stands between tasks of the top level: the field
	 * goes there, past the subtasks of the task above it.
	 */
	toggleSection(): void {
		const field = this.field;
		if (!field || !this.maySection(field) || field.run.spot.kind !== "list") return;
		const section = !field.section;
		const { spot } = field.run;
		const run = section && spot.place.level > 0 ? new Run({ ...spot, place: this.topLevelAfter(spot.column, spot.place) }) : field.run;
		this.reset({ ...field, run, section });
	}

	/** The gap of the top level at or after `place` in its section: past the subtasks it stands among. */
	private topLevelAfter(column: ListColumn, place: GapPlace): GapPlace {
		const cards = this.deps.cards(column);
		let index = place.index;
		while (index < cards.length && cards[index].group === place.group && cards[index].level > 0) index++;
		return { ...place, index, level: 0 };
	}

	/** Whether the field may go a level deeper or shallower: worked out again only for other cards or another spot. */
	private mayShift(field: Field): { readonly canIndent: boolean; readonly canOutdent: boolean } {
		const { spot } = field.run;
		if (field.rename || field.section || spot.kind !== "list") return { canIndent: false, canOutdent: false };
		const cards = this.deps.cards(spot.column);
		const kept = this.shifts;
		if (kept?.cards === cards && kept.spot === spot) return { canIndent: kept.indent, canOutdent: kept.outdent };
		const shifts = { cards, spot, indent: field.run.shifted(cards, 1) !== null, outdent: field.run.shifted(cards, -1) !== null };
		this.shifts = shifts;
		return { canIndent: shifts.indent, canOutdent: shifts.outdent };
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(spot: EntrySpot, renaming?: TaskItem): void {
		if (this.field) this.save(this.field);
		const rename = renaming ? { item: renaming, home: new Run(spot) } : null;
		this.reset({ run: new Run(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, repeat: renaming?.repeat ?? null, rename, section: false });
	}

	type(text: string): void {
		if (this.field) this.reset({ ...this.field, text }, true);
	}

	setPriority(prefix: string | null): void {
		if (this.field) this.reset({ ...this.field, priority: prefix }, true);
	}

	setRepeat(rule: RepeatRule | null): void {
		if (this.field) this.reset({ ...this.field, repeat: rule }, true);
	}

	indent(delta: 1 | -1): void {
		const place = this.shifted(delta);
		const run = this.field?.run;
		if (!place || run?.spot.kind !== "list") return;
		run.spot = { ...run.spot, place };
		this.shifts = null;
		this.changed();
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

	/** The field, its text and priority, at another spot; what was entered at the old one is still written there. */
	moveTo(spot: EntrySpot): void {
		if (this.field) this.reset({ ...this.field, run: new Run(spot) });
	}

	/** Resolves once every write sent so far is done. */
	idle(): Promise<void> {
		return this.queue.idle();
	}

	/** Saved, then a new line under the task; a blank text cancels the rename. */
	private enterRename(field: Field, rename: Rename): void {
		const { spot } = field.run;
		if (this.blank(field.text)) this.reset(null);
		else {
			this.saveRename(field, rename);
			this.reset(spot.kind === "list" ? { run: new Run(this.under(spot, rename.item)), text: "", priority: null, repeat: null, rename: null, section: false } : null);
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

	/** The task goes to the queue; the next field opens at once, without a priority or a repeat. A slot takes one task only. */
	private enterTask(field: Field): void {
		this.create(field);
		this.reset(field.run.spot.kind === "slot" ? null : { ...field, text: "", priority: null, repeat: null });
	}

	/**
	 * The field becomes `field` (none: closed); the runs it stands on are held while it does. `sameShifts`: only its text
	 * or level changed, so what it may do stands.
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
	 * stale. The task's own rule, the same in the bar, is left as the file has it.
	 */
	private saveRename(field: Field, { item, home }: Rename): void {
		const draft: TaskDraft = { text: field.text, placement: this.deps.placement(field.run.spot), priority: field.priority, ...(!sameRule(field.repeat, item.repeat) && { repeat: field.repeat }) };
		this.queued(home, async () => {
			await this.deps.fresh();
			await this.deps.edit(this.keyAt(home, item), draft);
		});
	}

	/** `### name` written where the field stands, once the lists show the writes before it. */
	private createSection(field: Field): void {
		const { run } = field;
		const name = field.text.trim();
		if (name === "" || run.spot.kind !== "list") return;
		const { column, place } = run.spot;
		this.queued(run, async () => {
			await this.deps.fresh();
			const at = this.deps.placeOf(column, placeOfGap(this.deps.cards(column), { ...place, level: 0 }));
			if (at.kind === "list" || at.kind === "day") await this.deps.createSection(name, at);
			await this.deps.fresh();
		});
	}

	/** The renamed task's key as the lists show it now: the card at its place while that is still it. */
	private keyAt(home: Run, item: TaskItem): TaskKey {
		if (home.spot.kind !== "list") return item.key;
		const card = this.deps.cards(home.spot.column)[home.spot.place.index];
		return card && sameLine(card.key, item.key) ? card.key : item.key;
	}

	/** The field's text, written at its run once the lists show the writes before it: at the level it was entered at, as far as the cards then allow. */
	private create(field: Field): void {
		const { run } = field;
		const line = { text: field.text, priority: field.priority, repeat: field.repeat, level: run.spot.kind === "list" ? run.spot.place.level : 0 };
		run.pending.push(line);
		this.queued(run, async () => {
			let shown = false;
			try {
				await this.deps.fresh();
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
	 */
	private async write(run: Run, line: Line, onShown: () => void): Promise<void> {
		const shown = (landed?: { readonly column: ListColumn; readonly key: TaskKey | null }) => (coming: (column: ListColumn) => readonly ListCard[]) => {
			const held = this.field?.run;
			const was = held?.spot;
			if (landed?.key) this.landed(landed.column, landed.key, coming(landed.column));
			run.pending.shift();
			onShown();
			this.shifts = null;
			if (held && (held === run || held.spot !== was)) this.deps.onChange(this.state, true);
		};
		const { spot } = run;
		switch (spot.kind) {
			case "slot":
				await this.deps.createInPlace(line.text, line.priority, { kind: "slot", slot: spot.slot });
				return this.deps.fresh(shown());
			case "stack":
				await this.deps.createInPlace(line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null });
				return this.deps.fresh(shown());
			case "list": {
				const cards = this.deps.cards(spot.column);
				const place = fitLevel(cards, { ...spot.place, level: line.level });
				const key = await this.deps.createInPlace(line.text, line.priority, this.deps.placeOf(spot.column, placeOfGap(cards, place)), line.repeat);
				return this.deps.fresh(shown({ column: spot.column, key }));
			}
		}
	}

	/**
	 * The places at or past the created task's card move down, when `column` is to show it among `cards`. A key gone
	 * stale because another write or a sync landed between the create and this read finds no card: the field then
	 * stays where it is, as for a task put elsewhere.
	 */
	private landed(column: ListColumn, created: TaskKey, cards: readonly ListCard[]): void {
		const index = cards.findIndex((card) => samePlace(card.key, created) && sameLine(card.key, created));
		if (index >= 0) this.runs.landed(column, index);
	}

	/** A write for `run`, which keeps following the cards that land until the write is done. */
	private queued(run: Run, job: () => Promise<void>): void {
		this.runs.hold(run);
		this.queue.push(async () => {
			try {
				await job();
			} finally {
				this.runs.release(run);
			}
		});
	}

	/** Right under a renamed task at its level, or its first subtask when it has some: nothing may stand between a task and them. */
	private under(spot: Extract<EntrySpot, { kind: "list" }>, item: TaskItem): EntrySpot {
		const { place } = spot;
		return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (item.subtasks.length > 0 ? 1 : 0) } };
	}

	/** The field's place a level deeper or shallower; null when the cards around forbid it, or the field does not move (a rename, a slot, a stack). */
	private shifted(delta: 1 | -1): GapPlace | null {
		const field = this.field;
		if (!field || field.rename || field.run.spot.kind !== "list") return null;
		return field.run.shifted(this.deps.cards(field.run.spot.column), delta);
	}

	private blank(text: string): boolean {
		return this.deps.isBlank(text);
	}

	private changed(): void {
		this.deps.onChange(this.state);
	}
}

function runsOf(field: Field | null): Run[] {
	if (!field) return [];
	return field.rename ? [field.run, field.rename.home] : [field.run];
}
