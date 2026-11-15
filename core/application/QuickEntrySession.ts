import type { GroupName, Slot } from "../domain/Task";
import type { RepeatRule } from "../domain/Repeat";
import type { Placement } from "../domain/Placement";
import type { CreatedTask, DropTo, NewTaskPlace, TaskItem, TaskKey, TaskService } from "./contracts";
import { type EntryJobOutcome, type EntryJobs, type EntryJobStep, entryJobStep } from "./EntryJobs";
import type { ListCard, ListPlace } from "./nesting";
import type { EntryList } from "./screenPlaces";
import { type EntryDrawing, type EntryJob, type EntryLook, type EntrySpot, type EntryState, type EntryTasks, type ListEntry, type PendingRename, type PlaceMove, QuickEntry, type StackEntry } from "./QuickEntry";

export { ENTRY_PLACES, type EntryAt, type EntryDrawing, type EntryProject, type EntrySpot, type EntryState, type ListEntry, type PendingRename, type PendingText, type PlaceChoice, type PlaceMove, type StackAt, type StackEntry } from "./QuickEntry";

/** What the session reads from the service: the marks, the places and the writes. */
export type QuickEntryTasks = EntryTasks & Pick<TaskService, "createWithId" | "createSection" | "edit"> & Partial<Pick<TaskService, "unfoldAbove">>;

/** The writes a job's step names (`tasks.<method>`, `entryJobStep`), each the service's own call: only `unfoldAbove` may be missing. */
const JOB_WRITES: { readonly [M in "createWithId" | "edit" | "createSection" | "unfoldAbove"]: (tasks: QuickEntryTasks, args: readonly unknown[]) => Promise<unknown> } = {
	createWithId: (tasks, args) => tasks.createWithId(...(args as Parameters<QuickEntryTasks["createWithId"]>)),
	edit: (tasks, args) => tasks.edit(...(args as Parameters<QuickEntryTasks["edit"]>)),
	createSection: (tasks, args) => tasks.createSection(...(args as Parameters<QuickEntryTasks["createSection"]>)),
	unfoldAbove: async (tasks, args) => (tasks.unfoldAbove ? tasks.unfoldAbove(...(args as Parameters<NonNullable<QuickEntryTasks["unfoldAbove"]>>)) : null),
};

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

	openFromPlus(): boolean {
		return this.entry.openFromPlus();
	}

	/** A tap on the plus opens a field (`QuickEntry.plusOpens`): false on the Projects screen where no part takes it. */
	plusOpens(): boolean {
		return this.entry.plusOpens();
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

	/**
	 * A job, run step by step in the order `entryJobStep` gives: its call once the lists show the writes before it, the
	 * write, the new task shown; whatever happens, its spot stops following the cards after it and it is done. A step that
	 * failed is reported once the job is done.
	 */
	private async run(job: EntryJob): Promise<void> {
		let jobs: EntryJobs = { queue: [job], running: null };
		let outcome: EntryJobOutcome = null;
		let failure: { readonly error: unknown } | null = null;
		for (;;) {
			const next = entryJobStep(jobs, outcome);
			jobs = next.jobs;
			if (next.step === null) break;
			try {
				outcome = await this.take(next.step);
			} catch (error) {
				failure ??= { error };
				outcome = { ok: false };
			}
		}
		if (failure) throw failure.error;
	}

	/** One step of a job, over this session's entry and service. */
	private async take(step: EntryJobStep): Promise<EntryJobOutcome> {
		if (step.kind === "renamed") {
			this.view.renamed?.(step.was, step.now);
			return null;
		}
		const [space, name] = step.method.split(".");
		const [id, ...args] = step.args as [string, ...unknown[]];
		if (space === "entry" && name === "shown") {
			await this.view.fresh((coming) => this.entry.shown(id, args[0] as CreatedTask | null, coming));
			return { ok: true, result: null };
		}
		if (step.fresh) await this.view.fresh();
		if (space === "entry") {
			if (name === "call") return { ok: true, result: { value: this.entry.call(id), jobs: [] } };
			if (name === "unshown") this.entry.unshown(id);
			else this.entry.done(id);
			return { ok: true, result: null };
		}
		if (!Object.prototype.hasOwnProperty.call(JOB_WRITES, name)) throw new Error(`Task Calendar: a quick entry's job writes by no ${step.method}`);
		return { ok: true, result: await JOB_WRITES[name as keyof typeof JOB_WRITES](this.tasks, step.args) };
	}
}
