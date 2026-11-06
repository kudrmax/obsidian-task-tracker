import { isOpen, type LocalDate, type ReminderKind, type Slot, type TaskStatus } from "../domain/Task";
import type { TaskDocument } from "../domain/TaskDocument";
import type {
	DroppedTask,
	DropFrom,
	DropTo,
	EndList,
	GroupedList,
	GroupName,
	GroupPlace,
	MenuStatusId,
	NewTaskPlace,
	RepeatRule,
	SectionPlace,
	TaskDraft,
	TaskItem,
	TaskKey,
	TaskStep,
} from "./contracts";
import { dropMoves, type DropMove, readDrop } from "./drops";
import { tileStatus, toggledLabels, toggledPriority } from "./menus";
import type { Read, Snapshot, TaskReads } from "./TaskReads";
import type { Operation, TaskRules } from "./TaskRules";
import { droppedSpan } from "./TimelineSpans";

/** The document as normalized before and after an operation ran. */
export interface DocChange {
	readonly before: TaskDocument;
	readonly after: TaskDocument;
}

/** One call's write: the operation (null: nothing to write), and what the call answers once it ran (null: it did not). */
export interface Write<R> {
	readonly operation: Operation | null;
	answer(change: DocChange | null): R;
}

const nothing = (operation: Operation | null): Write<void> => ({ operation, answer: () => undefined });

/**
 * Every write of the task service, synchronous: the operation it makes of its arguments, and of the file as read when
 * it needs to look first (a snapshot), and the answer it gives. TaskServiceImpl runs them over the vault's file, the
 * phone's door over the text it is handed.
 */
export class TaskWrites {
	constructor(
		private readonly rules: TaskRules,
		private readonly reads: TaskReads,
	) {}

	createInList(date: LocalDate, text: string): Write<void> {
		return nothing(this.rules.createInList(date, text));
	}

	createInSoon(text: string): Write<void> {
		return nothing(this.rules.createInSoon(text));
	}

	createAtTime(date: LocalDate, start: number, text: string): Write<void> {
		return nothing(this.rules.createAtTime(date, start, text));
	}

	createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null, labels: readonly string[] = []): Write<TaskKey | null> {
		return {
			operation: this.rules.createInPlace(text, priority, place, repeat, labels),
			answer: (change) => {
				const created = change?.after.insertedSince(change.before);
				return created ? { section: created.section, index: created.index, path: created.path, raw: created.raw } : null;
			},
		};
	}

	create(draft: TaskDraft, slot?: Slot): Write<void> {
		return nothing(this.rules.create(draft, slot));
	}

	createSubtask(parent: TaskKey, draft: TaskDraft): Write<void> {
		return nothing(this.rules.createSubtask(parent, draft));
	}

	edit(key: TaskKey, draft: TaskDraft): Write<TaskItem | null> {
		const edit = this.rules.edit(key, draft);
		return {
			operation: edit?.operation ?? null,
			answer: (change) => {
				const place = edit?.place() ?? null;
				if (!change || !place || change.before.serialize() === change.after.serialize()) return null;
				return this.reads.itemAt(change.after, place, this.rules.today());
			},
		};
	}

	setStatus(key: TaskKey, status: TaskStatus): Write<void> {
		return nothing(this.rules.setStatus(key, status));
	}

	toggleDone(key: TaskKey): Write<void> {
		return nothing(this.rules.toggleDone(key));
	}

	setDueDate(key: TaskKey, date: LocalDate | null): Write<void> {
		return nothing(this.rules.setDueDate(key, date));
	}

	setPriority(key: TaskKey, priority: string | null): Write<void> {
		return nothing(this.rules.setPriority(key, priority));
	}

	setLabels(key: TaskKey, labels: readonly string[]): Write<TaskItem | null> {
		const all = this.setLabelsAll([{ key, labels }]);
		return { operation: all.operation, answer: (change) => all.answer(change)[0] ?? null };
	}

	setLabelsAll(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Write<readonly (TaskItem | null)[]> {
		if (steps.length === 0) return { operation: null, answer: () => [] };
		const labelled = this.rules.setLabelsAll(steps);
		return {
			operation: labelled.operation,
			answer: (change) => {
				if (!change) return steps.map(() => null);
				const today = this.rules.today();
				return labelled.places().map((place) => (place ? this.reads.itemAt(change.after, place, today) : null));
			},
		};
	}

	setReminder(key: TaskKey, reminder: ReminderKind): Write<void> {
		return nothing(this.rules.setReminder(key, reminder));
	}

	/** No task picked reads and writes nothing. */
	togglePriority(keys: readonly TaskKey[], prefix: string): Read<Write<void>> {
		return { reads: keys.length > 0, answer: (s) => (s ? this.togglePriorityOf(s, keys, prefix) : nothing(null)) };
	}

	private togglePriorityOf(s: Snapshot, keys: readonly TaskKey[], prefix: string): Write<void> {
		const priority = toggledPriority(this.reads.itemsAt(s, keys), prefix);
		if (keys.length === 1) return this.setPriority(keys[0], priority);
		return this.applyAll(keys.map((key) => ({ key, change: { kind: "priority", priority } })));
	}

	/** No task picked reads and writes nothing. */
	toggleLabel(keys: readonly TaskKey[], name: string): Read<Write<readonly (TaskItem | null)[]>> {
		return {
			reads: keys.length > 0,
			answer: (s) => {
				if (!s) return { operation: null, answer: () => [] };
				const labels = toggledLabels(this.reads.itemsAt(s, keys), name);
				return this.setLabelsAll(keys.map((key, i) => ({ key, labels: labels[i] })));
			},
		};
	}

	removeDue(s: Snapshot, keys: readonly TaskKey[]): Write<void> {
		const steps = this.reads.itemsAt(s, keys).flatMap((item): TaskStep[] => (item.can.removeDue ? [{ key: item.key, change: { kind: "dueDate", date: null } }] : []));
		if (steps.length === 0) return nothing(null);
		if (keys.length === 1) return this.setDueDate(steps[0].key, null);
		return this.applyAll(steps);
	}

	pickStatus(keys: readonly TaskKey[], id: MenuStatusId): Write<void> {
		const status = tileStatus(id);
		if (keys.length === 1) return status === null ? this.stop(keys[0]) : this.setStatus(keys[0], status);
		return this.applyAll(keys.map((key) => ({ key, change: status === null ? { kind: "stop" } : { kind: "status", status } })));
	}

	postponeAll(s: Snapshot, keys: readonly TaskKey[], date: LocalDate): Write<void> {
		const steps = this.reads.itemsAt(s, keys).flatMap((item): TaskStep[] => (item.can.postpone ? [{ key: item.key, change: { kind: "postpone", date } }] : []));
		if (steps.length === 0) return nothing(null);
		if (keys.length === 1) return this.postpone(steps[0].key, date);
		return this.applyAll(steps);
	}

	removeAll(keys: readonly TaskKey[]): Write<void> {
		if (keys.length === 1) return this.remove(keys[0]);
		return this.applyAll(keys.map((key) => ({ key, change: { kind: "remove" } })));
	}

	setCollapsed(key: TaskKey, collapsed: boolean): Write<void> {
		return nothing(this.rules.setCollapsed(key, collapsed));
	}

	toggleCollapsed(key: TaskKey): Write<void> {
		return nothing(this.rules.toggleCollapsed(key));
	}

	unfoldAbove(key: TaskKey): Write<void> {
		return nothing(this.rules.unfoldAbove(key));
	}

	/** What showing a found task writes first: a subtask's tasks show their subtasks; a task, nothing. */
	revealUnfold(item: TaskItem): Write<void> {
		return nothing(item.isSubtask ? this.rules.unfoldAbove(item.key) : null);
	}

	setRepeat(key: TaskKey, rule: RepeatRule | null): Write<void> {
		return nothing(this.rules.setRepeat(key, rule));
	}

	stop(key: TaskKey): Write<void> {
		return nothing(this.rules.stop(key));
	}

	rename(s: Snapshot, key: TaskKey, text: string): Write<TaskItem | null> {
		if (!this.rules.renameChanges(s.doc, key, text)) return { operation: null, answer: () => null };
		return { operation: this.rules.rename(key, text), answer: (change) => change && this.reads.itemAt(change.after, key, s.today) };
	}

	setDescription(key: TaskKey, markdown: string): Write<void> {
		return nothing(this.rules.setDescription(key, markdown));
	}

	remove(key: TaskKey): Write<void> {
		return nothing(this.rules.remove(key));
	}

	moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Write<void> {
		return nothing(this.rules.moveBefore(key, before, date));
	}

	nest(key: TaskKey, parent: TaskKey, before: TaskKey | null): Write<void> {
		return nothing(this.rules.nest(key, parent, before));
	}

	setSlot(key: TaskKey, slot: Slot): Write<void> {
		return nothing(this.rules.setSlot(key, slot));
	}

	/** A drop on the timeline of `day` at `start`: the task's own duration from the file when it came from the timeline. */
	toTime(s: Snapshot, key: TaskKey, from: DropFrom, start: number, day: LocalDate): Write<void> {
		const { slot } = this.rules.entryOf(s.doc, key).task;
		const span = droppedSpan(start, from === "timeline" && slot && slot.end !== null ? slot.end - slot.start : null);
		return this.setSlot(key, s.boundary.slotAt(day, span.start, span.end));
	}

	resize(s: Snapshot, key: TaskKey, day: LocalDate, edge: "start" | "end", minute: number, minDurationMin: number): Write<boolean> {
		const { slot, status } = this.rules.entryOf(s.doc, key).task;
		const next = slot && this.reads.timeline().resized({ slot, open: isOpen(status) }, day, edge, minute, minDurationMin);
		if (!next) return { operation: null, answer: () => false };
		return { operation: this.rules.setSlot(key, next), answer: () => true };
	}

	clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Write<void> {
		return nothing(this.rules.clearSlot(key, place));
	}

	moveToList(key: TaskKey, date: LocalDate): Write<void> {
		return nothing(this.rules.moveToList(key, date));
	}

	moveToSoon(key: TaskKey, date: LocalDate): Write<void> {
		return nothing(this.rules.moveToSoon(key, date));
	}

	postpone(key: TaskKey, date: LocalDate): Write<void> {
		return nothing(this.rules.postpone(key, date));
	}

	moveToEnd(key: TaskKey, section: EndList): Write<void> {
		return nothing(this.rules.moveToEnd(key, section));
	}

	moveToGroup(key: TaskKey, list: GroupedList, group: GroupName, before: TaskKey | null, date?: LocalDate): Write<void> {
		return nothing(this.rules.moveToGroup(key, list, group, before, date));
	}

	createGroup(key: TaskKey, list: GroupedList, name: string, date?: LocalDate): Write<void> {
		return nothing(this.rules.createGroup(key, list, name, date));
	}

	toSection(s: Snapshot, keys: readonly TaskKey[], name: GroupName): Write<void> {
		const steps = keys.flatMap((key): TaskStep[] => {
			const change = this.rules.sectionChange(this.rules.entryOf(s.doc, key), name);
			return change ? [{ key, change }] : [];
		});
		if (steps.length === 0) return nothing(null);
		if (keys.length !== 1) return this.applyAll(steps);
		const { key, change } = steps[0];
		if (change.kind === "moveToGroup") return this.moveToGroup(key, change.list, change.group, change.before, change.date);
		if (change.kind === "createGroup") return this.createGroup(key, change.list, change.name, change.date);
		return nothing(null);
	}

	moveGroup(list: GroupedList, group: GroupName, place: GroupPlace): Write<void> {
		return nothing(this.rules.moveGroup(list, group, place));
	}

	/** Reads first only when there is a name to write: a blank one or the section's own answers false at once. */
	renameGroup(list: GroupedList, group: string, name: string): Read<Write<boolean>> {
		const operation = this.rules.renameGroup(list, group, name);
		return {
			reads: operation !== null,
			answer: (s) => {
				if (!operation || !s || operation(s.doc, s.today, this.rules.moment().settings, s.boundary) === s.doc) return { operation: null, answer: () => false };
				return { operation, answer: () => true };
			},
		};
	}

	removeGroup(list: GroupedList, group: string): Write<void> {
		return nothing(this.rules.removeGroup(list, group));
	}

	createSection(name: string, place: SectionPlace): Write<{ readonly list: GroupedList; readonly group: string } | null> {
		const made = this.rules.createSection(name, place);
		return {
			operation: made?.operation ?? null,
			answer: (change) => {
				if (!made || !change || change.after.serialize() === change.before.serialize()) return null;
				return { list: made.list, group: made.group };
			},
		};
	}

	applyAll(steps: readonly TaskStep[]): Write<void> {
		return nothing(this.rules.applyAll(steps));
	}

	/**
	 * What a drop means: the moves, and whether one of them sets a time and so reads the task's duration first. It answers
	 * the tasks' keys as the file now has them, in their order; one not found again is left out.
	 */
	drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Read<Write<readonly TaskKey[]>> {
		const moves = dropMoves(tasks, readDrop(to, (column) => this.reads.columnSections(column, day)), day);
		return {
			reads: moves.kind === "one" && moves.move.kind === "toTime",
			answer: (s) => this.landed(tasks, moves.kind === "one" ? this.moveOne(s, moves.key, moves.move) : this.applyAll(moves.steps)),
		};
	}

	/** The dropped tasks where `write` left them. */
	private landed(tasks: readonly DroppedTask[], write: Write<void>): Write<readonly TaskKey[]> {
		return {
			operation: write.operation,
			answer: (change) => {
				if (!change) return tasks.map((task) => task.key);
				const moved = tasks.map((task) => this.rules.entryOf(change.before, task.key));
				return change.after.movedSince(change.before, moved).flatMap((entry) => (entry ? [{ section: entry.section, index: entry.index, path: entry.path, raw: entry.raw }] : []));
			},
		};
	}

	private moveOne(s: Snapshot | null, key: TaskKey, move: DropMove): Write<void> {
		switch (move.kind) {
			case "toTime":
				return this.toTime(s!, key, move.from, move.start, move.day);
			case "clearSlot":
				return this.clearSlot(key, move.place);
			case "moveToGroup":
				return this.moveToGroup(key, move.list, move.group, move.before, move.date);
			case "nest":
				return this.nest(key, move.parent, move.before);
			case "moveBefore":
				return this.moveBefore(key, move.before, move.date);
			case "moveToList":
				return this.moveToList(key, move.date);
			case "moveToSoon":
				return this.moveToSoon(key, move.date);
			case "moveToEnd":
				return this.moveToEnd(key, move.section);
		}
	}
}
