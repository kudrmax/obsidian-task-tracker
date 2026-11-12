import { ScrollEdges } from "./ScrollEdges";
import { branchOf, type EntryDrawing, type GroupName, type Header, type ListCard, type ListGroup, type ListRow, type ListSection, type ListView, listView, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { el } from "./dom";
import { fillCard } from "./TaskCard";
import { KeyedRows, type RowsDrawing } from "./motion/KeyedRows";
import { ScrollHold } from "./motion/ScrollHold";
import { EntryRows, type LevelRow, type ListEntryInput } from "./EntryRows";

export type { ListEntryInput } from "./EntryRows";

export interface TaskListDeps {
	items(): readonly TaskItem[];
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	day(): LocalDate | null;
	/** Whether the list shows its sections: Inbox, Soon, and the day column on today. */
	grouped?(): boolean;
	/** The groups of the list the column shows, in file order: where its empty sections stand. */
	sections?(): readonly ListSection[];
	/** The header over the tasks outside any section. */
	ungroupedName?(): string;
	/** A card waiting for the name of the section it starts: drawn last, under the place for the name. */
	pending?(): TaskItem | null;
	/** The task being typed, which takes its place among the cards about to be drawn (`drawing`) without being one of them; null when none is. */
	entry?(drawing: EntryDrawing): ListEntryInput | null;
	/**
	 * The task whose text the field edits, wherever the field stands: its card keeps its place among the cards, hidden, and
	 * the branches pass it by.
	 */
	renaming?(): TaskKey | null;
	/** `subtree` gives the cards of the task's subtasks at every depth: they go wherever the task goes. */
	onCard?(card: HTMLElement, item: TaskItem, subtree: readonly HTMLElement[], signal: AbortSignal): void;
	onHeader?(head: HTMLElement, group: ListGroup, signal: AbortSignal): void;
	/** The No tasks plate under an empty section's header. */
	onPlate?(plate: HTMLElement, group: ListGroup, signal: AbortSignal): void;
	/** The words of the plate a list that draws nothing shows (`ViewChoice.plates`); null: none. */
	empty?(): string | null;
	/** The words of an empty section's plate (`ViewChoice.emptyLabel`). */
	emptyLabel?(): string;
	/** That plate tapped: a new task at the list's end. */
	onEmpty?(): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
	/** 0 for a task, one more for each task above a subtask. */
	readonly level: number;
	/** The section it is drawn in: none in a list that shows no headers. */
	readonly group: GroupName;
}

/** A section as the list draws it. */
export interface DrawnSection {
	readonly group: ListGroup;
}

/** What a list shows: its sections as the core groups them. */
interface ListShape {
	readonly headers: boolean;
	readonly drawn: readonly DrawnSection[];
}

function shapeOf(view: ListView): ListShape {
	return { headers: view.showsHeaders, drawn: view.groups.map((group) => ({ group })) };
}

function plateKey(name: GroupName): string {
	return JSON.stringify(name);
}

/** The key of the dashed place a lifted section lands on. */
const LANDING = "landing";

/** Where a lifted section's landing place stands: over the `before`-th header drawn, or right after the section of id `after` (`ListGroup.id`). */
export type Landing = { readonly before: number } | { readonly after: string };
export const PLATE = "tc-group-empty";

/** What a list about to draw `shape` shows the field among. */
function drawingOf(shape: ListShape): EntryDrawing {
	const sections = shape.drawn;
	return {
		cards: sections.flatMap((section) => section.group.rows.map(({ item, level }) => ({ key: item.key, id: item.id, level, group: section.group.name }))),
		sections: sections.map((section) => section.group.name),
	};
}

/**
 * A column of cards that scrolls: each task with its open subtasks right under it, a level further in, a branch running
 * from the task to each, unless the task folds them away; with sections, a header over each.
 */
export class TaskList {
	private entries: ListEntry[] = [];
	private rendered: readonly DrawnSection[] = [];
	private nodes: HTMLElement[] = [];
	/** Each header drawn, as the places see it: its section's name. */
	private heads = new Map<HTMLElement, Header>();
	/** Where a lifted section will land, shown as a dashed place among the sections; none while no section is carried. */
	private landing: Landing | null = null;
	private headsById = new Map<string, HTMLElement>();
	/** Each empty section's No tasks plate drawn, by its name. */
	private plates = new Map<string, HTMLElement>();
	/** Each section's cards as drawn, its subtasks' among them. */
	private sectionCards = new Map<ListGroup, HTMLElement[]>();
	private withHeaders = false;
	private slot: HTMLElement | null = null;
	/** The rows by key: a card by its task's id, a header by its section's, so a row lives as long as what it shows. */
	private readonly keyed: KeyedRows;
	private readonly hold: ScrollHold;
	/** The field typed in the list, among its cards. */
	private readonly entryRows: EntryRows;
	/** The day of the last drawing: another day is drawn at once, never moved into. */
	private drawnDay: LocalDate | null | undefined = undefined;
	/** `listCards` as of the last drawing, made the first time it is asked for. */
	private drawnCards: readonly ListCard[] | null = null;
	private readonly edges: ScrollEdges;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
		this.keyed = new KeyedRows(el);
		this.hold = new ScrollHold(el);
		this.edges = new ScrollEdges(el);
		this.entryRows = new EntryRows(this.keyed);
	}

	/** The list goes away with its view or its peek: it stops following its scroll and size. */
	destroy(): void {
		this.edges.destroy();
	}

	/** Draws what the list shows now; `moving` false puts it in place at once, as for its first drawing. */
	render(moving = true): void {
		this.drawnCards = null;
		this.draw(moving);
		this.drawnCards = null;
		this.edges.update();
	}

	private draw(moving: boolean): void {
		const day = this.deps.day();
		const items = this.deps.items();
		const shape = this.shapeOf(items);
		const entry = this.deps.entry?.(drawingOf(shape)) ?? null;
		const renaming = this.deps.renaming?.() ?? null;
		const moves = moving && this.drawnDay === day;
		if (moves) this.hold.keep();
		const drawing = this.keyed.begin(moves);
		this.entryRows.begin(drawing, renaming);
		this.drawnDay = day;
		this.entries = [];
		this.nodes = [];
		this.heads = new Map();
		this.headsById = new Map();
		this.plates = new Map();
		this.sectionCards = new Map();
		this.rendered = shape.drawn;
		this.withHeaders = shape.headers;
		const rows: LevelRow[] = [];
		const signals = new Map<HTMLElement, AbortSignal>();
		const at = entry?.at ?? null;
		let entered = entry === null;
		let entryRow: HTMLElement | null = null;
		let section = 0;
		const enter = (): void => {
			if (entered || !entry) return;
			entered = true;
			entryRow = this.entryRows.draw(drawing, entry, rows);
		};
		const enterAtCard = (): void => {
			if (at?.kind === "in" && at.section === section && at.card === this.entries.length) enter();
		};
		const add = ({ item, level }: ListRow, group: GroupName): void => {
			enterAtCard();
			const card = this.cardOf(drawing, item, day, signals);
			card.style.setProperty(PROPERTY.level, String(level));
			const renamed = this.entryRows.renames(item.key);
			card.classList.toggle("is-renaming", renamed);
			this.entries.push({ card, item, level, group });
			this.nodes.push(card);
			if (!renamed) rows.push({ node: card, level });
		};
		/** Each card of a section with the cards of its subtasks: those right after it, deeper than it. */
		const subtrees = (from: number): void => {
			for (let i = from; i < this.entries.length; i++) {
				const { card, item, level } = this.entries[i];
				let end = i + 1;
				while (end < this.entries.length && this.entries[end].level > level) end++;
				this.deps.onCard?.(card, item, this.entries.slice(i + 1, end).map((e) => e.card), signals.get(card)!);
			}
		};
		if (at?.kind === "top") enter();
		let i = -1;
		let headsDrawn = 0;
		const landing = this.landing;
		const mark = () => drawing.takeMark(LANDING, () => el(null, "div", "tc-group-drop"));
		for (const { group } of shape.drawn) {
			section = ++i;
			if (this.withHeaders && group.header) {
				if (landing && "before" in landing && landing.before === headsDrawn) mark();
				headsDrawn++;
				this.nodes.push(this.header(drawing, group));
			}
			const platesField = at?.kind === "in" && at.section === i && !at.keepsPlate;
			if (group.empty && !platesField) this.nodes.push(this.plate(drawing, group));
			const groupStart = this.entries.length;
			for (const row of group.rows) add(row, group.name);
			this.sectionCards.set(group, this.entries.slice(groupStart).map((e) => e.card));
			subtrees(groupStart);
			enterAtCard();
			if (landing && "after" in landing && landing.after === group.id) mark();
		}
		if (landing && "before" in landing && landing.before >= headsDrawn) mark();
		enter();
		if (entryRow) this.entryRows.markRenamed(entryRow, this.entries);
		rows.forEach((row, i) => {
			const lines = branchOf(rows.map((r) => r.level), i);
			if (lines) branch(row.node, lines.through, lines.last);
		});
		const pending = this.deps.pending?.() ?? null;
		const empty = this.nodes.length === 0 && entryRow === null && pending === null ? (this.deps.empty?.() ?? null) : null;
		if (empty !== null) this.emptyPlate(drawing, empty);
		/** Cards came into an empty list: its plate gives way at once, so the first card grows in where the plate stood, not under it. */
		else drawing.forget("empty");
		this.slot = pending ? drawing.take("slot", () => el(null, "div", "tc-group-slot")).node : null;
		if (pending) this.cardOf(drawing, pending, day, signals);
		drawing.finish();
	}

	/** A task's card: the one drawn for it last time, filled anew, or a new one; its branches go, the list draws them again. */
	private cardOf(drawing: RowsDrawing, item: TaskItem, day: LocalDate | null, signals: Map<HTMLElement, AbortSignal>): HTMLElement {
		const heir = this.entryRows.heirOf(item.id, `task:${item.id}`);
		const { node, fresh, signal } = drawing.take(`task:${item.id}`, () => el(null, "div", "tc-card"), heir);
		if (!fresh) node.replaceChildren();
		fillCard(node, item, { day });
		signals.set(node, signal);
		return node;
	}

	/** The field wrote a task where it was typed (`id`, as the write answered): its card takes the typed text's row when drawn. */
	adopt(id: string): void {
		this.entryRows.adopt(id);
	}

	/** The field closed: no text typed is awaited any more. */
	forgetTyped(): void {
		this.entryRows.forget();
	}

	/** Where the name of the section a pending card starts is typed; null without one. */
	get pendingSlot(): HTMLElement | null {
		return this.slot;
	}

	get cards(): readonly ListEntry[] {
		return this.entries;
	}

	/** The cards as places in the list see them, with no measuring: each in the section it is drawn in. The same array until the list draws again. */
	get listCards(): readonly ListCard[] {
		return (this.drawnCards ??= this.entries.map((entry) => this.listCard(entry)));
	}

	/** The cards the list is about to draw from what it is to show now, as `listCards` gives them once it has. */
	get comingCards(): readonly ListCard[] {
		return drawingOf(this.shapeOf(this.deps.items())).cards;
	}

	private shapeOf(items: readonly TaskItem[]): ListShape {
		return shapeOf(listView(items, this.deps.grouped?.() ?? false, this.deps.sections?.() ?? []));
	}

	/** A card as places in the list see it: in the section it is drawn in. */
	listCard(entry: ListEntry): ListCard {
		return { key: entry.item.key, id: entry.item.id, level: entry.level, group: entry.group };
	}

	/** The sections as drawn; one ungrouped run when the list shows none. */
	get groups(): readonly ListGroup[] {
		return this.rendered.map((section) => section.group);
	}

	/** The sections as drawn: what the field stands among. */
	get sections(): readonly Header[] {
		return this.rendered.map((section) => section.group.name);
	}

	/** What a header drawn means for a place: undefined for any other node. */
	headerAt(node: HTMLElement): Header | undefined {
		return this.heads.get(node);
	}

	get headers(): boolean {
		return this.withHeaders;
	}

	/**
	 * The place a lifted section lands, drawn as a row of the list (`before`: the header it stands over, counted among the
	 * headers drawn, past the last for the end; `after`: right after the section of that id, once the move is drawn);
	 * null takes it away, folding. The list draws itself again.
	 */
	showLanding(at: Landing | null): void {
		this.landing = at;
		this.render();
	}

	/** The header drawn for the section of id `id` (`ListGroup.id`, the same through a move or a rename), if one is. */
	headOf(id: string): HTMLElement | null {
		return this.headsById.get(id) ?? null;
	}

	/** The No tasks plate of empty section `name`; null when none is drawn. */
	plateOf(name: GroupName): HTMLElement | null {
		return this.plates.get(plateKey(name)) ?? null;
	}

	/** The cards drawn in `group`, one of `groups`, its subtasks' among them. */
	cardsOf(group: ListGroup): readonly HTMLElement[] {
		return this.sectionCards.get(group) ?? [];
	}

	/** Headers, plates and cards in the order they stand. */
	get elements(): readonly HTMLElement[] {
		return this.nodes;
	}

	private header(drawing: RowsDrawing, group: ListGroup): HTMLElement {
		const { node: head, signal } = drawing.take(`head:${JSON.stringify(group.id)}`, () => el(null, "div", "tc-group-head"));
		head.replaceChildren();
		head.classList.toggle("is-ungrouped", group.name === null);
		el(head, "span", "tc-group-name", group.name ?? this.deps.ungroupedName?.() ?? "");
		this.heads.set(head, group.name);
		this.headsById.set(group.id, head);
		this.deps.onHeader?.(head, group, signal);
		return head;
	}

	/** The plate of a list that draws nothing: not a section's, a tap types a task at the list's end. */
	private emptyPlate(drawing: RowsDrawing, words: string): void {
		const { node: plate, signal } = drawing.take("empty", () => el(null, "div", `${PLATE} tc-list-empty`));
		plate.textContent = words;
		plate.addEventListener("click", () => this.deps.onEmpty?.(), { signal });
	}

	private plate(drawing: RowsDrawing, group: ListGroup): HTMLElement {
		const { node: plate, signal } = drawing.take(`plate:${JSON.stringify(group.id)}`, () => el(null, "div", PLATE));
		plate.textContent = this.deps.emptyLabel?.() ?? "";
		plate.dataset.group = group.name ?? "";
		this.plates.set(plateKey(group.name), plate);
		this.deps.onPlate?.(plate, group, signal);
		return plate;
	}
}

/** A subtask's branch from its task, bending in if it is the last; and the lines of the tasks further up that go on past it. */
export function branch(card: HTMLElement, through: readonly boolean[], last: boolean): void {
	el(card, "span", last ? "tc-branch is-last" : "tc-branch");
	through.forEach((goesOn, i) => {
		if (goesOn) el(card, "span", "tc-branch-pass").style.setProperty(PROPERTY.pass, String(through.length - i));
	});
}
