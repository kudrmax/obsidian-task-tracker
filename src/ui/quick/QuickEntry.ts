import type { NewTaskPlace, Placement, TaskItem, TaskKey, TaskService } from "../../application/contracts";
import type { ListColumn } from "../drag/DropTarget";
import { type GapPlace, type PlaceResult, type PlacedCard, fitLevel, resultOf, shiftLevel } from "../drag/listPlace";
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
	/** Texts entered here and not yet written, in order: drawn right before the field. */
	readonly pending: readonly PendingText[];
	/** The task whose text the field edits; null for a new one. */
	readonly renaming: TaskItem | null;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
}

export interface QuickEntryDeps {
	/** The cards of `column` as it shows the file now. */
	cards(column: ListColumn): readonly PlacedCard[];
	placeOf(column: ListColumn, result: PlaceResult): NewTaskPlace;
	/** Resolves once the lists show the file as of the last write. */
	fresh(): Promise<void>;
	createInPlace: TaskService["createInPlace"];
	edit: TaskService["edit"];
	/** The placement a rename at `spot` gives the task. */
	placement(spot: EntrySpot): Placement;
	/** After every change of the state; null once the field closed. */
	onChange(state: EntryState | null): void;
	/** A write that failed; the ones after it still go. */
	onError(error: unknown): void;
}

interface Line extends PendingText {
	readonly priority: string | null;
}

/** The key of a card that stands for a text not yet written: only its level counts. */
const UNWRITTEN: TaskKey = { section: "now", index: -1, path: [], raw: "" };

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
	shifted(cards: readonly PlacedCard[], delta: 1 | -1): GapPlace | null {
		if (this.spot.kind !== "list") return null;
		const { place } = this.spot;
		const unwritten = this.pending.map((line): PlacedCard => ({ key: UNWRITTEN, level: line.level, top: 0, height: 0, group: place.group }));
		const shown = [...cards.slice(0, place.index), ...unwritten, ...cards.slice(place.index)];
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

interface Field {
	readonly run: Run;
	readonly text: string;
	readonly priority: string | null;
	readonly rename: Rename | null;
}

function blank(text: string): boolean {
	return text.trim() === "";
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
			pending: field.run.pending.map(({ text, level }) => ({ text, level })),
			renaming: field.rename?.item ?? null,
			canIndent: this.shifted(1) !== null,
			canOutdent: this.shifted(-1) !== null,
		};
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(spot: EntrySpot, renaming?: TaskItem): void {
		if (this.field) this.save(this.field);
		const rename = renaming ? { item: renaming, home: new Run(spot) } : null;
		this.reset({ run: new Run(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, rename });
	}

	type(text: string): void {
		if (this.field) this.reset({ ...this.field, text });
	}

	setPriority(prefix: string | null): void {
		if (this.field) this.reset({ ...this.field, priority: prefix });
	}

	indent(delta: 1 | -1): void {
		const place = this.shifted(delta);
		const run = this.field?.run;
		if (!place || run?.spot.kind !== "list") return;
		run.spot = { ...run.spot, place };
		this.changed();
	}

	enter(): void {
		const field = this.field;
		if (!field) return;
		if (field.rename) this.enterRename(field, field.rename);
		else if (blank(field.text)) this.enterBlank();
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
		if (blank(field.text)) this.reset(null);
		else {
			this.saveRename(field, rename);
			this.reset(spot.kind === "list" ? { run: new Run(this.under(spot, rename.item)), text: "", priority: null, rename: null } : null);
		}
	}

	/** As in Obsidian: a level shallower, and the end of the entry where it can go no shallower. */
	private enterBlank(): void {
		if (this.shifted(-1)) this.indent(-1);
		else this.reset(null);
	}

	/** The task goes to the queue; the next field opens at once, without a priority. A slot takes one task only. */
	private enterTask(field: Field): void {
		this.create(field);
		this.reset(field.run.spot.kind === "slot" ? null : { ...field, text: "", priority: null });
	}

	/** The field becomes `field` (none: closed); the runs it stands on are held while it does. */
	private reset(field: Field | null): void {
		const old = this.field;
		for (const run of runsOf(field)) this.runs.hold(run);
		for (const run of runsOf(old)) this.runs.release(run);
		this.field = field;
		this.changed();
	}

	private save(field: Field): void {
		if (blank(field.text)) return;
		if (field.rename) this.saveRename(field, field.rename);
		else this.create(field);
	}

	/** Edits once the writes before it show, by the key the lists give the task then: the one read at the open may have gone stale. */
	private saveRename(field: Field, { item, home }: Rename): void {
		const draft = { text: field.text, placement: this.deps.placement(field.run.spot), priority: field.priority };
		this.queued(home, async () => {
			await this.deps.fresh();
			await this.deps.edit(this.keyAt(home, item), draft);
		});
	}

	/** The renamed task's key as the lists show it now: the card at its place while that is still it. */
	private keyAt(home: Run, item: TaskItem): TaskKey {
		if (home.spot.kind !== "list") return item.key;
		const card = this.deps.cards(home.spot.column)[home.spot.place.index];
		return card?.key.raw === item.key.raw ? card.key : item.key;
	}

	/** The field's text, written at its run once the lists show the writes before it: at the level it was entered at, as far as the cards then allow. */
	private create(field: Field): void {
		const { run } = field;
		const line = { text: field.text, priority: field.priority, level: run.spot.kind === "list" ? run.spot.place.level : 0 };
		run.pending.push(line);
		this.queued(run, async () => {
			try {
				await this.deps.fresh();
				await this.write(run.spot, line);
			} finally {
				run.pending.shift();
				if (run === this.field?.run) this.changed();
			}
		});
	}

	private async write(spot: EntrySpot, line: Line): Promise<void> {
		switch (spot.kind) {
			case "slot":
				return this.deps.createInPlace(line.text, line.priority, { kind: "slot", slot: spot.slot });
			case "stack":
				return this.deps.createInPlace(line.text, line.priority, { kind: "subtask", parent: spot.parent, before: null });
			case "list": {
				const cards = this.deps.cards(spot.column);
				const place = fitLevel(cards, { ...spot.place, level: line.level });
				await this.deps.createInPlace(line.text, line.priority, this.deps.placeOf(spot.column, resultOf(cards, place)));
				this.runs.landed(spot.column, place.index);
			}
		}
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

	private changed(): void {
		this.deps.onChange(this.state);
	}
}

function runsOf(field: Field | null): Run[] {
	if (!field) return [];
	return field.rename ? [field.run, field.rename.home] : [field.run];
}
