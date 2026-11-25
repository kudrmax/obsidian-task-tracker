import type { LocalDate, Slot } from "../domain/Task";
import type { CarryState, ColumnList, ViewChoice, DropColumn, DroppedTask, DropOrigin, DropPreview, DropTo, MenuFrom, ProjectsNodeId, ScreenReader, ScreenView, TaskItem, TaskMenuModel } from "./contracts";
import type { TaskMenuActionId } from "./taskActions";
import type { Read, TaskReads } from "./TaskReads";
import type { TaskWrites } from "./TaskWrites";
import type { ResizeEdge, StretchSpan } from "./TimelineSpans";

/** A read answered over the one read of the file a reader holds: as the service's own read would answer it. */
export type HeldAnswer = <R>(read: Read<R>) => R;

/** `ScreenReader` over one read of the file: the service's reads and writes asked over it, each screen and the tasks read once. */
export class SnapshotReader implements ScreenReader {
	private readonly screens = new Map<LocalDate, ScreenView>();
	private items: ReadonlyMap<string, TaskItem> | null = null;

	constructor(
		private readonly reads: TaskReads,
		private readonly writes: TaskWrites,
		private readonly answer: HeldAnswer,
		private readonly filter: ProjectsNodeId | null,
		private readonly carry: () => CarryState | undefined,
	) {}

	screen(date: LocalDate): ScreenView {
		const kept = this.screens.get(date);
		if (kept) return kept;
		const screen = this.answer(this.reads.screenRead(date, this.filter));
		this.screens.set(date, screen);
		return screen;
	}

	view(wide: boolean, notePath: string | null): ViewChoice {
		if (notePath === null) return this.answer(this.reads.viewInRead(this.filter, wide));
		return this.answer(this.reads.projectNoteViewRead(notePath, wide))?.view ?? this.answer(this.reads.viewInRead(this.filter, wide, true));
	}

	columnView(column: DropColumn, date: LocalDate): ColumnList {
		return this.reads.columnView(this.screen(date), column);
	}

	item(id: string): TaskItem | null {
		this.items ??= this.answer(this.reads.itemsRead(this.filter));
		return this.items.get(id) ?? null;
	}

	dropPreview(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): DropPreview {
		return this.answer(this.writes.dropPreview(tasks, to, day, this.filter, this.carry()));
	}

	takes(origins: readonly DropOrigin[], to: DropTo): boolean {
		return this.answer(this.reads.takesRead(origins, to));
	}

	menu(id: string, from: MenuFrom, day: LocalDate): TaskMenuModel<TaskMenuActionId> | null {
		const item = this.item(id);
		if (!item) return null;
		const screen = this.screen(day);
		return this.reads.menu(item, from, { today: this.reads.today(), day, offer: screen.offer, projects: screen.projectTree });
	}

	stretch(id: string, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan | null {
		const item = this.slotted(id);
		return item && this.reads.stretch(item, day, edge, minute);
	}

	resizedSlot(id: string, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Slot | null {
		const item = this.slotted(id);
		return item && this.reads.resizedSlot(item, day, edge, minute, minDurationMin);
	}

	within(filter: ProjectsNodeId | null): ScreenReader {
		return filter === this.filter ? this : new SnapshotReader(this.reads, this.writes, this.answer, filter, this.carry);
	}

	private slotted(id: string): TaskItem | null {
		const item = this.item(id);
		return item?.slot ? item : null;
	}
}
