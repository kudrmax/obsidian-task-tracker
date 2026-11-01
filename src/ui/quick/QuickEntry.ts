import type { NewTaskPlace, Placement, TaskItem, TaskKey, TaskService } from "../../application/contracts";
import type { ListColumn } from "../drag/DropTarget";
import { type GapPlace, type PlaceResult, type PlacedCard, resultOf, shiftLevel } from "../drag/listPlace";
import type { Slot } from "../types";
import { WriteQueue } from "./WriteQueue";

/** Where the field stands: a gap of a list, a slot on the calendar, or the end of a task's subtasks in the calendar menu. */
export type EntrySpot =
	| { readonly kind: "list"; readonly column: ListColumn; readonly place: GapPlace }
	| { readonly kind: "slot"; readonly slot: Slot }
	| { readonly kind: "stack"; readonly parent: TaskKey };

export interface EntryState {
	readonly spot: EntrySpot;
	readonly text: string;
	/** A level's prefix, or none. */
	readonly priority: string | null;
	/** Texts entered here and not yet written, in order: drawn right before the field. */
	readonly pending: readonly string[];
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

/**
 * The tasks typed one under another at one spot. Its writes land there in order, each moving the spot a card down, and
 * keep doing so after the field moved elsewhere or closed.
 */
class Run {
	readonly pending: string[] = [];

	constructor(public spot: EntrySpot) {}

	/** A task landed at the spot: the next one goes under it. */
	advance(): void {
		if (this.spot.kind !== "list") return;
		const { place } = this.spot;
		this.spot = { ...this.spot, place: { ...place, index: place.index + 1 } };
	}
}

interface Field {
	readonly run: Run;
	text: string;
	priority: string | null;
	readonly renaming: TaskItem | null;
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
			pending: [...field.run.pending],
			renaming: field.renaming,
			canIndent: this.shifted(1) !== null,
			canOutdent: this.shifted(-1) !== null,
		};
	}

	/** A field at `spot`; one already open is finished first, as by a tap elsewhere. A rename's spot is the gap right before its own card. */
	open(spot: EntrySpot, renaming?: TaskItem): void {
		if (this.field) this.save(this.field);
		this.reset({ run: new Run(spot), text: renaming?.text ?? "", priority: renaming?.priority?.prefix ?? null, renaming: renaming ?? null });
	}

	type(text: string): void {
		if (!this.field) return;
		this.field.text = text;
		this.changed();
	}

	setPriority(prefix: string | null): void {
		if (!this.field) return;
		this.field.priority = prefix;
		this.changed();
	}

	indent(delta: 1 | -1): void {
		const place = this.shifted(delta);
		if (!this.field || !place || this.field.run.spot.kind !== "list") return;
		this.field.run.spot = { ...this.field.run.spot, place };
		this.changed();
	}

	enter(): void {
		const field = this.field;
		if (!field) return;
		if (field.renaming) this.enterRename(field, field.renaming);
		else if (blank(field.text)) this.enterBlank();
		else this.enterTask(field);
	}

	/** A tap elsewhere: the text is kept as by Enter, and the field closes. */
	blur(): void {
		if (!this.field) return;
		this.save(this.field);
		this.close();
	}

	/** The field's own text goes; what Enter already sent is still written. */
	escape(): void {
		this.close();
	}

	/** The field, its text and priority, at another spot; what was entered at the old one is still written there. */
	moveTo(spot: EntrySpot): void {
		if (!this.field) return;
		this.reset({ ...this.field, run: new Run(spot) });
	}

	/** Resolves once every write sent so far is done. */
	idle(): Promise<void> {
		return this.queue.idle();
	}

	/** Saved, then a new line under the task; a blank text cancels the rename. */
	private enterRename(field: Field, item: TaskItem): void {
		const { spot } = field.run;
		if (blank(field.text)) this.close();
		else {
			this.saveRename(field, item);
			if (spot.kind !== "list") this.close();
			else this.reset({ run: new Run(this.under(spot, item)), text: "", priority: null, renaming: null });
		}
	}

	/** As in Obsidian: a level shallower, and the end of the entry where it can go no shallower. */
	private enterBlank(): void {
		if (this.shifted(-1)) this.indent(-1);
		else this.close();
	}

	/** The task goes to the queue; the next field opens at once, without a priority. A slot takes one task only. */
	private enterTask(field: Field): void {
		this.create(field.run, field.text, field.priority);
		if (field.run.spot.kind === "slot") this.close();
		else this.reset({ ...field, text: "", priority: null });
	}

	private reset(field: Field): void {
		this.field = field;
		this.changed();
	}

	private save(field: Field): void {
		if (blank(field.text)) return;
		if (field.renaming) this.saveRename(field, field.renaming);
		else this.create(field.run, field.text, field.priority);
	}

	private saveRename(field: Field, item: TaskItem): void {
		const draft = { text: field.text, placement: this.deps.placement(field.run.spot), priority: field.priority };
		this.queue.push(() => this.deps.edit(item.key, draft));
	}

	/** Written where the run stands once the lists show the writes before it, so its neighbours are those of the file then. */
	private create(run: Run, text: string, priority: string | null): void {
		run.pending.push(text);
		this.queue.push(async () => {
			try {
				await this.deps.fresh();
				await this.deps.createInPlace(text, priority, this.placeIn(run.spot));
				run.advance();
			} finally {
				run.pending.shift();
				if (run === this.field?.run) this.changed();
			}
		});
	}

	private placeIn(spot: EntrySpot): NewTaskPlace {
		switch (spot.kind) {
			case "list":
				return this.deps.placeOf(spot.column, resultOf(this.deps.cards(spot.column), spot.place));
			case "slot":
				return { kind: "slot", slot: spot.slot };
			case "stack":
				return { kind: "subtask", parent: spot.parent, before: null };
		}
	}

	/** Right under a renamed task at its level, or its first subtask when it has some: nothing may stand between a task and them. */
	private under(spot: Extract<EntrySpot, { kind: "list" }>, item: TaskItem): EntrySpot {
		const { place } = spot;
		return { ...spot, place: { ...place, index: place.index + 1, level: place.level + (item.subtasks.length > 0 ? 1 : 0) } };
	}

	/** The field's place a level deeper or shallower; null when the cards around forbid it, or the field does not move (a rename, a slot, a stack). */
	private shifted(delta: 1 | -1): GapPlace | null {
		const field = this.field;
		if (!field || field.renaming || field.run.spot.kind !== "list") return null;
		const { column, place } = field.run.spot;
		return shiftLevel(this.deps.cards(column), place, delta);
	}

	private close(): void {
		this.field = null;
		this.changed();
	}

	private changed(): void {
		this.deps.onChange(this.state);
	}
}
