import type { GroupName, Slot } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import type { Placement } from "../domain/Placement";
import type { DropTo, NewTaskPlace, TaskItem, TaskKey, TaskService } from "./contracts";
import type { ListCard, ListPlace } from "./nesting";
import type { EntryList } from "./screenPlaces";
import { type EntryDrawing, type EntryJob, type EntryLook, type EntrySpot, type EntryState, type EntryTasks, type ListEntry, type PendingRename, type PlaceMove, QuickEntry, type StackEntry } from "./QuickEntry";

export { ENTRY_PLACES, type EntryAt, type EntryDrawing, type EntryProject, type EntrySpot, type EntryState, type ListEntry, type PendingRename, type PendingText, type PlaceChoice, type PlaceMove, type StackAt, type StackEntry } from "./QuickEntry";

/** What the session reads from the service: the marks, the places and the writes. */
export type QuickEntryTasks = EntryTasks & Pick<TaskService, "createWithId" | "createSection" | "edit"> & Partial<Pick<TaskService, "unfoldAbove">>;

/** What the session reads from the screen, and tells it. */
export interface QuickEntryView extends EntryLook {
	/**
	 * Resolves once the lists show the file as of the last write; `beforeShow` runs right before they draw it, given the
	 * cards each column is about to draw.
	 */
	fresh(beforeShow?: (coming: (column: EntryList) => readonly ListCard[]) => void): Promise<void>;
	/**
	 * After every change of the state; null once the field closed. `drawnNext`: the lists are about to draw the data this
	 * change belongs to, so it needs no drawing of its own.
	 */
	onChange(state: EntryState | null, drawnNext?: boolean): void;
	/** A rename was written: `was` as it was opened, `now` as the file now has it, its key fresh. */
	renamed?(was: TaskItem, now: TaskItem): void;
}

/** The writes, one at a time in the order pushed; a failing one is reported by the queue and the next one still runs. */
export interface WriteLine {
	push(job: () => Promise<void>): void;
	/** Resolves once every job pushed so far, and every one they pushed, has run. */
	idle(): Promise<void>;
}

/**
 * The plugin's host of the quick entry: QuickEntry holds every rule; this runs its jobs on the write line, each once the
 * lists show the writes before it, and tells the view of every change.
 */
export class QuickEntrySession {
	private readonly entry: QuickEntry;

	constructor(
		private readonly tasks: QuickEntryTasks,
		private readonly view: QuickEntryView,
		private readonly writes: WriteLine,
	) {
		this.entry = new QuickEntry(tasks, view, undefined, (state, drawnNext) => view.onChange(state, drawnNext), (job) => this.writes.push(() => this.run(job)));
	}

	get state(): EntryState | null {
		return this.entry.state;
	}

	get renaming(): TaskKey | null {
		return this.entry.renaming;
	}

	get renamed(): readonly PendingRename[] {
		return this.entry.renamed;
	}

	/** What `column`'s list draws for the field, among what it is about to draw (`drawn`); none when the field stands elsewhere. */
	listEntry(column: EntryList, drawn?: EntryDrawing): ListEntry | null {
		return this.entry.listEntry(column, drawn);
	}

	openAtEnd(column: EntryList): void {
		this.entry.openAtEnd(column);
	}

	openFromPlus(): void {
		this.entry.openFromPlus();
	}

	openIn(column: EntryList, group: GroupName): void {
		this.entry.openIn(column, group);
	}

	/** The plus let go at `place` of list `column` (the Projects list's): the field of a new task there. */
	openAt(column: EntryList, place: ListPlace): void {
		this.entry.openAt(column, place);
	}

	openSlot(slot: Slot): void {
		this.entry.openSlot(slot);
	}

	openAtDrop(column: EntryList | null, result: DropTo | null): boolean {
		return this.entry.openAtDrop(column, result);
	}

	/** Where `task`'s full screen draws the field: none unless it stands in the stack of `task` or one of its subtasks. */
	stackEntry(task: TaskItem): StackEntry | null {
		return this.entry.stackEntry(task);
	}

	stackSpot(parent: TaskKey): EntrySpot {
		return this.entry.stackSpot(parent);
	}

	subtaskSpot(parent: TaskKey): EntrySpot {
		return this.entry.subtaskSpot(parent);
	}

	renameSpot(item: TaskItem, inStack: boolean): EntrySpot | null {
		return this.entry.renameSpot(item, inStack);
	}

	open(spot: EntrySpot, renaming?: TaskItem): void {
		this.entry.open(spot, renaming);
	}

	type(text: string): void {
		this.entry.type(text);
	}

	setPriority(prefix: string | null): void {
		this.entry.setPriority(prefix);
	}

	togglePriority(prefix: string): void {
		this.entry.togglePriority(prefix);
	}

	setLabels(labels: readonly string[]): void {
		this.entry.setLabels(labels);
	}

	toggleLabel(name: string): void {
		this.entry.toggleLabel(name);
	}

	setRepeat(rule: RepeatRule | null): void {
		this.entry.setRepeat(rule);
	}

	/** A project picked on the bar's Project button (null: No project): kept by the field, as its labels are. */
	setProject(link: string | null): void {
		this.entry.setProject(link);
	}

	indent(delta: 1 | -1): void {
		this.entry.indent(delta);
	}

	toggleSection(): void {
		this.entry.toggleSection();
	}

	enter(): void {
		this.entry.enter();
	}

	blur(): void {
		this.entry.blur();
	}

	escape(): void {
		this.entry.escape();
	}

	choosePlace(placement: Placement): PlaceMove | null {
		return this.entry.choosePlace(placement);
	}

	moveToEnd(column: EntryList): void {
		this.entry.moveToEnd(column);
	}

	/** Resolves once every write sent so far is done. */
	idle(): Promise<void> {
		return this.writes.idle();
	}

	placeOf(column: EntryList, result: ListPlace, placement?: Placement): NewTaskPlace {
		return this.entry.placeOf(column, result, placement);
	}

	/** A job, once the lists show the writes before it; whatever happens, its spot stops following the cards after it. */
	private async run(job: EntryJob): Promise<void> {
		try {
			await this.view.fresh();
			await this.write(job);
		} finally {
			this.entry.unshown(job.id);
			this.entry.done(job.id);
		}
	}

	private async write(job: EntryJob): Promise<void> {
		const call = this.entry.call(job.id);
		if (!call) return void (job.kind === "section" && (await this.view.fresh()));
		switch (call.method) {
			case "createInPlace": {
				const created = await this.tasks.createWithId(...call.args);
				return this.view.fresh((coming) => this.entry.shown(job.id, created, coming));
			}
			case "edit": {
				const now = await this.tasks.edit(...call.args);
				if (now && job.kind === "rename") this.view.renamed?.(job.item, now);
				return;
			}
			case "createSection":
				await this.tasks.createSection(...call.args);
				await this.view.fresh();
				return;
			case "unfoldAbove":
				await this.tasks.unfoldAbove?.(...call.args);
				await this.view.fresh();
		}
	}
}
