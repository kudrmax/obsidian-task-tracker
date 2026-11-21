import { type DayService, type DropColumn, type EntryList, type EntryState, type LocalDate, type Placement, type QuickEntryView, QuickEntrySession, type ScreenReader, type TaskItem, type TaskService, type WriteLine } from "../../core/application/contracts";
import type { Destination, EntryBar, EntryCommit, EntryDraft, EntryField, ListId, MenuFrom, PlaceId, RenameStart } from "../ui/engine/port";
import { ListCards } from "./ListCards";
import type { ScreenDrawing } from "./ScreenDrawing";

const DAY_MS = 86_400_000;
const NO_DRAFT: EntryDraft = { level: null, projects: [], descriptionLine: null, section: false };
const ENTRY_LISTS: readonly EntryList[] = ["day", "soon", "inbox"];

/** The writes a field queues, run one after another; `dry` drops them: a field only asked what it would show writes nothing. */
class Writes implements WriteLine {
	pushed = 0;
	private line: Promise<void> = Promise.resolve();

	constructor(private readonly dry: boolean) {}

	push(job: () => Promise<void>): void {
		if (this.dry) return;
		this.pushed++;
		this.line = this.line.then(job).catch(() => undefined);
	}

	idle(): Promise<void> {
		return this.line;
	}
}

/** A day as a count of days from today: the engine names days so. */
function offsetBetween(today: LocalDate, date: LocalDate): number {
	const at = (d: LocalDate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
	return Math.round((at(date) - at(today)) / DAY_MS);
}

/**
 * The new task's field over the core's quick entry (`QuickEntrySession`, which holds every rule of it): each of the
 * engine's asks opens a session at the field the engine names, sets what the bar has set and what is typed, and reads the
 * core's answer back in the engine's words. Only a commit lets the session write.
 */
export class CoreEntry {
	constructor(
		private readonly core: { readonly tasks: TaskService; readonly days: DayService },
		private readonly drawing: ScreenDrawing,
		private readonly reader: () => ScreenReader,
		private readonly refresh: () => Promise<void>,
	) {}

	plus(dayOffset: number, shown: readonly ListId[]): Destination {
		const { session } = this.session(dayOffset, shown);
		session.openFromPlus();
		return this.fieldOf(session.state, dayOffset).at;
	}

	end(list: ListId, dayOffset: number): Destination {
		const { session } = this.session(dayOffset);
		session.openAtEnd(list);
		return this.fieldOf(session.state, dayOffset).at;
	}

	subtask(id: string, dayOffset: number): Destination {
		const { session } = this.session(dayOffset);
		session.open(session.subtaskSpot(this.item(id).key));
		return { ...this.fieldOf(session.state, dayOffset).at, under: id };
	}

	bar(field: EntryField, draft: EntryDraft, text: string): EntryBar {
		const { session } = this.opened(field, draft, text, true);
		const state = session.state!;
		const today = this.core.days.today();
		return {
			bar: state.bar,
			levels: state.marks.tiles.levels.map((tile) => ({ prefix: tile.mark.prefix, color: tile.mark.color, on: tile.on })),
			tint: state.marks.tint,
			projects: (state.project?.page.options ?? []).map((option) => ({ name: option.project.name, depth: option.depth, on: option.checked, folder: option.project.folder })),
			where: state.place && { id: this.placeIdOf(state.place), title: this.core.tasks.placementTitle(state.place) },
			places: state.places.map((choice) => ({ id: choice.kind, title: choice.kind === "date" ? "Date" : this.core.tasks.listName(choice.kind), on: choice.on })),
			date: { today, picked: state.place && this.core.tasks.dayOfPlacement(state.place) },
		};
	}

	place(field: EntryField, choice: PlaceId, date: string | null, reach: readonly ListId[]): EntryField {
		const { session } = this.opened(field, NO_DRAFT, "", true);
		const move = session.choosePlace(this.placementOf(choice, date));
		if (!move) return field;
		const home = { ...field.at, backlog: undefined, away: undefined };
		if (move.column === "backlog") return { ...field, at: { ...home, backlog: true } };
		const dayOffset = move.day === null ? field.at.dayOffset : offsetBetween(this.core.days.today(), move.day);
		const at = this.fieldOf(session.state, dayOffset).at;
		return reach.includes(at.list) ? { ...field, at } : { ...field, at: { ...home, away: { list: at.list, dayOffset } } };
	}

	rename(id: string, from: MenuFrom, dayOffset: number): RenameStart {
		const item = this.item(id);
		const { session } = this.session(dayOffset);
		const spot = session.renameSpot(item, from === "stack");
		if (!spot) throw new Error(`no place to rename ${id}`);
		session.open(spot, item);
		const state = session.state!;
		return { field: this.fieldOf(state, dayOffset), draft: this.draftOf(state), text: state.text };
	}

	commit(field: EntryField, text: string, draft: EntryDraft, next: boolean): EntryCommit {
		const { session, writes } = this.opened(field, draft, text, false);
		const before = session.state!;
		const renamed = before.renaming;
		if (next) session.enter();
		else session.blur();
		const written = writes.pushed > 0;
		const after = session.state;
		const pending = session.renamed.find((rename) => rename.id === renamed?.id);
		return {
			write: written ? writes.idle().then(() => this.refresh()) : null,
			face: renamed && pending && written ? { ...this.drawing.face(renamed, null), title: pending.title, color: before.marks.tint } : null,
			next: after ? this.fieldOf(after, field.at.dayOffset) : null,
			draft: after ? this.draftOf(after) : NO_DRAFT,
		};
	}

	/** A session at `field`, with the bar set as `draft` and `text` typed. */
	private opened(field: EntryField, draft: EntryDraft, text: string, dry: boolean): { readonly session: QuickEntrySession; readonly writes: Writes } {
		const { at } = field;
		const away = at.away;
		const made = this.session(away?.dayOffset ?? at.dayOffset, undefined, dry);
		const { session } = made;
		if (field.renaming !== null) this.openRename(session, field);
		else if (at.backlog) session.openAtEnd("backlog");
		else if (away) session.openAtEnd(away.list);
		else if (field.stack) session.open({ kind: "stack", parent: this.item(at.under!).key });
		else if (at.at !== undefined) session.openSlot(this.core.tasks.newSlot(this.dateOf(at.dayOffset), at.at));
		else if (at.under !== undefined) session.open(session.subtaskSpot(this.item(at.under).key));
		else session.open({ kind: "list", column: at.list, place: this.cards(at.list, at.dayOffset).gapOf(at) });
		if (draft.level !== session.state?.priority) session.setPriority(draft.level);
		this.setProjects(session, draft.projects);
		if (draft.descriptionLine !== null) {
			session.openDescription();
			session.typeDescription(draft.descriptionLine);
		}
		if (draft.section && session.state?.section === false) session.toggleSection();
		session.type(text);
		return made;
	}

	/** A rename's field at its own card, moved where the bar's place sends it. */
	private openRename(session: QuickEntrySession, field: EntryField): void {
		const item = this.item(field.renaming!);
		const spot = session.renameSpot(item, field.stack);
		if (!spot) throw new Error(`no place to rename ${item.id}`);
		session.open(spot, item);
		const { at } = field;
		const target = at.backlog ? ({ kind: "backlog" } as const) : at.away ? this.placementOfList(at.away.list, at.away.dayOffset) : null;
		if (target) session.choosePlace(target);
	}

	private setProjects(session: QuickEntrySession, names: readonly string[]): void {
		const has = this.projectsOf(session.state);
		if (has.length === names.length && has.every((name, i) => name === names[i])) return;
		session.setProject(null);
		for (const name of names) session.toggleProject(name);
	}

	private projectsOf(state: EntryState | null): readonly string[] {
		return (state?.project?.page.options ?? []).filter((option) => option.checked).map((option) => option.project.name);
	}

	private draftOf(state: EntryState): EntryDraft {
		return { level: state.priority, projects: this.projectsOf(state), descriptionLine: state.description, section: state.section === true };
	}

	/** The engine's field for the core's: a list's gap as the card it goes before, a slot as its minute, a stack by its task. */
	private fieldOf(state: EntryState | null, dayOffset: number): EntryField {
		if (!state) throw new Error("no field");
		const { spot } = state;
		const renaming = state.renaming?.id ?? null;
		const date = this.dateOf(dayOffset);
		if (spot.kind === "slot") return { at: { list: "day", before: null, dayOffset, at: this.core.days.boundary().spanOf(spot.slot, date).start }, renaming, stack: false };
		if (spot.kind === "stack") return { at: { list: "day", before: null, dayOffset, under: spot.parent.id }, renaming, stack: true };
		const list = spot.column as ListId;
		return { at: { list, dayOffset, ...this.cards(list, dayOffset).destinationOf(spot.place) }, renaming, stack: false };
	}

	private session(dayOffset: number, shown: readonly ListId[] = ENTRY_LISTS as readonly ListId[], dry = true): { readonly session: QuickEntrySession; readonly writes: Writes } {
		const writes = new Writes(dry);
		return { session: new QuickEntrySession(this.core.tasks, this.look(dayOffset, shown), writes), writes };
	}

	/** What the quick entry reads of the screen: each list's cards and sections as the core's held read draws them on the day. */
	private look(dayOffset: number, shown: readonly ListId[]): QuickEntryView {
		const date = this.dateOf(dayOffset);
		const column = (list: EntryList) => this.reader().columnView(list as DropColumn, date);
		return {
			cards: (list) => (list === "projects" ? [] : new ListCards(column(list)).cards),
			sections: (list) => (list === "projects" ? [] : column(list).groups.filter((group) => group.header).map((group) => group.name)),
			sectioned: (list) => list !== "projects" && column(list).sections !== null,
			day: () => date,
			today: () => this.core.days.today(),
			shown: () => shown,
			fresh: async (beforeShow) => {
				await this.refresh();
				beforeShow?.((list) => (list === "projects" ? [] : new ListCards(column(list)).cards));
			},
			onChange: () => undefined,
		};
	}

	private cards(list: ListId, dayOffset: number): ListCards {
		return new ListCards(this.reader().columnView(list, this.dateOf(dayOffset)));
	}

	private placementOf(choice: PlaceId, date: string | null): Placement {
		if (choice === "date") return this.core.tasks.placementOfDay(date ?? this.core.days.today());
		return { kind: choice };
	}

	private placementOfList(list: ListId, dayOffset: number): Placement {
		return list === "day" ? this.core.tasks.placementOfDay(this.dateOf(dayOffset)) : { kind: list };
	}

	private placeIdOf(place: Placement): PlaceId {
		return place.kind;
	}

	private item(id: string): TaskItem {
		const item = this.reader().item(id);
		if (!item) throw new Error(`no task ${id}`);
		return item;
	}

	private dateOf(dayOffset: number): LocalDate {
		return this.core.days.step(this.core.days.today(), dayOffset);
	}
}
