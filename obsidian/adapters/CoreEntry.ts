import { type DayService, type DropColumn, type EntryList, type EntryState, type LocalDate, type MenuProject, type ProjectsNodeId, type Placement, type QuickEntryView, QuickEntrySession, type ScreenReader, type TaskItem, type TaskService, type WriteLine } from "../../core/application/contracts";
import type { WriteQueue } from "./WriteQueue";
import type { Destination, EntryBar, EntryCommit, EntryDraft, EntryField, ListId, MenuFrom, PlaceId, RenameStart } from "../ui/engine/port";
import { ListCards } from "./ListCards";
import { projectPageOf } from "./menuModel";
import type { ScreenDrawing } from "./ScreenDrawing";

const NO_DRAFT: EntryDraft = { level: null, projects: [], descriptionLine: null, section: false };
const ENTRY_LISTS: readonly ListId[] = ["day", "soon", "inbox", "backlog"];
/** A field with no Project button of its own (a subtask's, a section's name): an empty page, never drawn. */
const NO_PROJECT_PAGE: MenuProject = { current: null, options: [], none: true, noneLabel: "", value: "", disabled: true, newLabel: "" };

/** The writes a session only asked where a field opens queues: none, it writes nothing. */
const NO_WRITES: WriteLine = { push: () => undefined, idle: () => Promise.resolve() };

/** A field the engine names, but for its depth: two such are the same field, shifted or not. */
const placeOf = (field: EntryField) => JSON.stringify({ ...field, at: { ...field.at, depth: undefined } });

/** What the quick entry reads of the screen, kept as it changes: the day the field's list shows and the lists in sight. */
interface Look {
	date: LocalDate;
	shown: readonly ListId[];
}

/**
 * The new task's field over the core's quick entry (`QuickEntrySession`, which holds every rule of it). One session lives
 * as long as its screen's port, every screen's fields writing through the one write queue: the engine's field is followed on it (its depth by the
 * session's own shifts, its text and bar by the session's setters), so what Enter queued is still known to the next field
 * and every write lands in the order typed. Where a new field would open is asked of a session that writes nothing.
 */
export class CoreEntry {
	private readonly look: Look;
	private readonly session: QuickEntrySession;
	/** The engine's field the live session stands at; null while none is open. */
	private field: EntryField | null = null;
	private pushed = 0;

	constructor(
		private readonly core: { readonly tasks: TaskService; readonly days: DayService },
		private readonly drawing: ScreenDrawing,
		private readonly reader: () => ScreenReader,
		private readonly refresh: () => Promise<void>,
		/** The one write queue every screen's field writes through, in the order typed. */
		private readonly queue: WriteQueue,
		private readonly filter: () => { readonly node: ProjectsNodeId; readonly project: string | null } | null = () => null,
	) {
		this.look = { date: core.days.today(), shown: ENTRY_LISTS };
		const counted: WriteLine = {
			push: (job) => {
				this.pushed++;
				this.queue.push(job);
			},
			idle: () => this.queue.idle(),
		};
		this.session = new QuickEntrySession(core.tasks, this.viewOf(this.look), counted);
	}

	plus(dayOffset: number, shown: readonly ListId[]): Destination {
		const asked = this.asking(dayOffset, shown);
		asked.openFromPlus();
		return this.fieldOf(asked.state, dayOffset).at;
	}

	end(list: ListId, dayOffset: number): Destination {
		const asked = this.asking(dayOffset);
		asked.openAtEnd(list);
		return this.fieldOf(asked.state, dayOffset).at;
	}

	/** A new last subtask of `id`: in the list that shows it, else in its menu's stack (a calendar's task): the core's `subtaskSpot`. */
	subtask(id: string, dayOffset: number): EntryField {
		const asked = this.asking(dayOffset);
		asked.open(asked.subtaskSpot(this.item(id).key));
		const field = this.fieldOf(asked.state, dayOffset);
		return { ...field, at: { ...field.at, under: id } };
	}

	/** The field a level in or out by the session's own shift (`indent`), as far as its neighbours let it; null where the bar offers no such shift. */
	shift(field: EntryField, draft: EntryDraft, text: string, by: 1 | -1): EntryField | null {
		const state = this.follow(field, draft, text);
		const offered = state.bar.some((group) => group.actions.some((action) => action.id === (by > 0 ? "indent" : "outdent") && !action.disabled));
		if (!offered) return null;
		this.session.indent(by);
		this.field = { ...this.fieldOf(this.session.state, field.at.dayOffset), renaming: field.renaming };
		return this.field;
	}

	rename(id: string, from: MenuFrom, dayOffset: number): RenameStart {
		const asked = this.asking(dayOffset);
		const item = this.item(id);
		const spot = asked.renameSpot(item, from === "stack");
		if (!spot) throw new Error(`no place to rename ${id}`);
		asked.open(spot, item);
		const state = asked.state!;
		return { field: this.fieldOf(state, dayOffset), draft: this.draftOf(state), text: state.text };
	}

	/** What a new field at `field` starts with: the session opened there, as the core sets it (a project's screen, a list's part). */
	draft(field: EntryField): EntryDraft {
		return this.draftOf(this.follow(field, null, null));
	}

	bar(field: EntryField, draft: EntryDraft, text: string): EntryBar {
		const state = this.follow(field, draft, text);
		return {
			bar: state.bar,
			levels: state.marks.tiles.levels.map((tile) => ({ prefix: tile.mark.prefix, color: tile.mark.color, on: tile.on })),
			tint: state.marks.tint,
			project: projectPageOf(state.project?.page ?? NO_PROJECT_PAGE),
			where: state.place && { id: state.place.kind, title: this.core.tasks.placementTitle(state.place) },
			places: state.places.map((choice) => ({ id: choice.kind, title: choice.kind === "date" ? null : this.core.tasks.listName(choice.kind), on: choice.on })),
			date: { today: this.core.days.today(), picked: state.place && this.core.tasks.dayOfPlacement(state.place) },
		};
	}

	place(field: EntryField, choice: PlaceId, date: string | null, reach: readonly ListId[]): EntryField {
		this.follow(field, null, null);
		const move = this.session.choosePlace(this.placementOf(choice, date));
		if (!move) return field;
		const home = { ...field.at, away: undefined };
		const dayOffset = move.day === null ? field.at.dayOffset : this.core.days.offset(this.core.days.today(), move.day);
		this.look.date = this.dateOf(dayOffset);
		const moved = this.landed(field, home, dayOffset, reach);
		this.field = moved;
		return moved;
	}

	commit(field: EntryField, text: string, draft: EntryDraft, next: boolean): EntryCommit {
		const before = this.follow(field, draft, text);
		const renamed = before.renaming;
		const pushed = this.pushed;
		if (next) this.session.enter();
		else this.session.blur();
		const written = this.pushed > pushed;
		const after = this.session.state;
		const pending = this.session.renamed.find((rename) => rename.id === renamed?.id);
		this.field = after ? this.nextOf(field, after) : null;
		return {
			write: written ? this.queue.idle().then(() => this.refresh()) : null,
			face: renamed && pending && written ? { ...this.drawing.face(renamed, null), title: pending.title, color: before.marks.tint } : null,
			next: this.field,
			draft: after ? this.draftOf(after) : NO_DRAFT,
		};
	}

	/**
	 * The field open after a commit: where the session stands; but a field kept where it stood while it writes elsewhere
	 * (a list out of reach) stays so, as the next one types to the same place.
	 */
	private nextOf(field: EntryField, after: EntryState): EntryField {
		return field.at.away ? { ...field, renaming: after.renaming?.id ?? null } : this.fieldOf(after, field.at.dayOffset);
	}

	/** The field a place moved to: where the session now stands, or kept where it stood when the screen can't bring that list into sight. */
	private landed(field: EntryField, home: Destination, dayOffset: number, reach: readonly ListId[]): EntryField {
		const at = this.fieldOf(this.session.state, dayOffset).at;
		return reach.includes(at.list) ? { ...field, at } : { ...field, at: { ...home, away: { list: at.list, dayOffset } } };
	}

	/**
	 * The live session at the engine's `field`, with its bar set as `draft` and `text` typed (null: as they stand). The same
	 * field shifted takes the session's own shifts; another field is opened afresh, the one open before dropped as Escape
	 * drops it (what Enter queued is still written).
	 */
	private follow(field: EntryField, draft: EntryDraft | null, text: string | null): EntryState {
		if (!this.field || placeOf(this.field) !== placeOf(field)) this.open(field);
		else this.shiftBy((field.at.depth ?? 0) - (this.field.at.depth ?? 0));
		this.field = field;
		if (draft) this.setDraft(draft);
		if (text !== null && this.session.state?.text !== text) this.session.type(text);
		return this.session.state!;
	}

	private shiftBy(by: number): void {
		for (let n = 0; n < Math.abs(by); n++) this.session.indent(by > 0 ? 1 : -1);
	}

	private open(field: EntryField): void {
		if (this.session.state) this.session.escape();
		const { at } = field;
		const away = at.away;
		this.look.date = this.dateOf(away?.dayOffset ?? at.dayOffset);
		this.look.shown = ENTRY_LISTS;
		const session = this.session;
		if (field.renaming !== null) this.openRename(field);
		else if (away) session.openAtEnd(away.list);
		else if (field.stack) session.open({ kind: "stack", parent: this.item(at.under!).key });
		else if (at.at !== undefined) session.openSlot(this.core.tasks.newSlot(this.look.date, at.at));
		else if (at.under !== undefined) session.open(session.subtaskSpot(this.item(at.under).key));
		else {
			const gap = this.cards(at.list, at.dayOffset).gapOf(at);
			if (gap) session.open({ kind: "list", column: at.list, place: gap });
			else session.openAtEnd(at.list);
		}
	}

	/** A rename's field at its own card, moved where the bar's place sends it. */
	private openRename(field: EntryField): void {
		const item = this.item(field.renaming!);
		const spot = this.session.renameSpot(item, field.stack);
		if (!spot) throw new Error(`no place to rename ${item.id}`);
		this.session.open(spot, item);
		const { at } = field;
		const target = at.away ? this.placementOfList(at.away.list, at.away.dayOffset) : null;
		if (target) this.session.choosePlace(target);
	}

	private setDraft(draft: EntryDraft): void {
		const state = () => this.session.state!;
		if (draft.level !== state().priority) this.session.setPriority(draft.level);
		this.setProjects(draft.projects);
		if (draft.descriptionLine !== null && draft.descriptionLine !== state().description) {
			this.session.openDescription();
			this.session.typeDescription(draft.descriptionLine);
		}
		if (draft.section !== (state().section === true) && state().section !== null) this.session.toggleSection();
	}

	private setProjects(names: readonly string[]): void {
		const has = this.projectsOf(this.session.state);
		if (has.length === names.length && has.every((name, i) => name === names[i])) return;
		this.session.setProject(null);
		for (const name of names) this.session.toggleProject(name);
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

	/** A session that writes nothing, over the screen of `dayOffset` showing `shown`: where a new field would open. */
	private asking(dayOffset: number, shown: readonly ListId[] = ENTRY_LISTS): QuickEntrySession {
		return new QuickEntrySession(this.core.tasks, this.viewOf({ date: this.dateOf(dayOffset), shown }), NO_WRITES);
	}

	/** What the quick entry reads of the screen: each list's cards and sections as the core's held read draws them on `look`'s day. */
	private viewOf(look: Look): QuickEntryView {
		const column = (list: EntryList) => this.drawing.column(this.reader().screen(look.date), list as DropColumn);
		const cards = (list: EntryList) => (list === "projects" ? [] : new ListCards(column(list)).cards);
		return {
			cards,
			sections: (list) => (list === "projects" ? [] : column(list).groups.filter((group) => group.header).map((group) => group.name)),
			sectioned: (list) => list !== "projects" && column(list).sections !== null,
			day: () => look.date,
			today: () => this.core.days.today(),
			shown: () => look.shown,
			fresh: async (beforeShow) => {
				await this.refresh();
				beforeShow?.(cards);
			},
			onChange: () => undefined,
			filter: () => this.filter(),
		};
	}

	private cards(list: ListId, dayOffset: number): ListCards {
		const date = this.dateOf(dayOffset);
		return new ListCards(this.drawing.column(this.reader().screen(date), list));
	}

	private placementOf(choice: PlaceId, date: string | null): Placement {
		if (choice === "date") return this.core.tasks.placementOfDay(date ?? this.core.days.today());
		return { kind: choice };
	}

	private placementOfList(list: ListId, dayOffset: number): Placement {
		return list === "day" ? this.core.tasks.placementOfDay(this.dateOf(dayOffset)) : { kind: list };
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
