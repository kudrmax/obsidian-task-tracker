import { type GapPlace, type GroupName, type ListCard, type ListGroup, type ListSection, type ListView, listView, type PendingText, samePlace, type TaskItem, type TaskKey } from "../application/contracts";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { el } from "./dom";
import { isEmptyGroup } from "./listGroups";
import { renderTaskCard, renderUnwrittenCard, showProgressDot } from "./TaskCard";

/** A task being typed in the list: the texts already typed, as plain cards each at its level, and the field after them, in `place`. */
export interface ListEntryInput {
	readonly place: GapPlace;
	readonly pending: readonly PendingText[];
	/** The field writes a section's name: it stands as the new header does, apart from the group above, whose plate stays. */
	readonly section?: boolean;
	/** Draws the field into `parent`, the row that stands in the list; gives the field's element. */
	field(parent: HTMLElement): HTMLElement;
}

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
	/** The task being typed, which takes its place among the cards without being one of them; null when none is. */
	entry?(): ListEntryInput | null;
	/**
	 * The task whose text the field edits, wherever the field stands: its card keeps its place among the cards, hidden, and
	 * the branches pass it by.
	 */
	renaming?(): TaskKey | null;
	/** `subtree` gives the cards of the task's subtasks at every depth: they go wherever the task goes. */
	onCard?(card: HTMLElement, item: TaskItem, subtree: readonly HTMLElement[]): void;
	onHeader?(head: HTMLElement, group: ListGroup): void;
	/** The No tasks plate under an empty section's header. */
	onPlate?(plate: HTMLElement, group: ListGroup): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
	/** 0 for a task, one more for each task above a subtask. */
	readonly level: number;
	/** The section it is drawn in: none in a list that shows no headers. */
	readonly group: GroupName;
}

const QUICK_ROW = "tc-quick-row";
export const PLATE = "tc-group-empty";

/**
 * A column of cards that scrolls: each task with its open subtasks right under it, a level further in, a branch running
 * from the task to each, unless the task folds them away; with sections, a header over each.
 */
export class TaskList {
	private entries: ListEntry[] = [];
	private rendered: readonly ListGroup[] = [];
	private nodes: HTMLElement[] = [];
	private withHeaders = false;
	private slot: HTMLElement | null = null;
	/** `listCards` as of the last drawing, made the first time it is asked for. */
	private drawnCards: readonly ListCard[] | null = null;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
	}

	render(): void {
		this.drawnCards = null;
		this.draw();
		this.drawnCards = null;
	}

	private draw(): void {
		const entry = this.deps.entry?.() ?? null;
		const renaming = this.deps.renaming?.() ?? null;
		const kept = entry ? this.keptRow() : null;
		for (const child of [...this.el.children]) if (child !== kept) child.remove();
		this.entries = [];
		this.nodes = [];
		const day = this.deps.day();
		const items = this.deps.items();
		const view = this.viewOf(items);
		this.rendered = view.groups;
		this.withHeaders = view.showsHeaders;
		const rows: { node: HTMLElement; level: number }[] = [];
		let entered = entry === null;
		let groupStart = 0;
		/** At a card's place, or at the end of its section for a place outside that section's cards: where `placeOfGap` writes it. */
		const enter = (group: GroupName, groupEnd = false): void => {
			if (entered || !entry || (this.withHeaders && entry.place.group !== group)) return;
			const { index } = entry.place;
			const outside = this.withHeaders && groupEnd && (index < groupStart || index > this.entries.length);
			if (index !== this.entries.length && !outside) return;
			entered = true;
			this.enterRows(entry, rows, kept);
		};
		const add = ({ item, level }: Row, group: GroupName): void => {
			enter(group);
			const card = renderTaskCard(this.el, item, { day });
			card.style.setProperty(PROPERTY.level, String(level));
			const renamed = renaming !== null && samePlace(renaming, item.key);
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
				this.deps.onCard?.(card, item, this.entries.slice(i + 1, end).map((e) => e.card));
			}
		};
		const aboveHeaders = this.withHeaders && entry?.place.group === null && !this.rendered.some((g) => g.name === null);
		if (aboveHeaders) enter(null, true);
		for (const group of this.rendered) {
			if (this.withHeaders) this.nodes.push(this.header(group));
			if (isEmptyGroup(group) && (entry?.place.group !== group.name || entry.section)) this.nodes.push(this.plate(group));
			groupStart = this.entries.length;
			for (const row of rowsOf(group.items)) add(row, group.name);
			subtrees(groupStart);
			enter(group.name, true);
		}
		if (!entered && entry) this.enterRows(entry, rows, kept);
		if (entry) this.markRenamed(renaming);
		rows.forEach((row, i) => {
			if (row.level === 0) return;
			const { through, last } = linesOf(rows.map((r) => r.level), i);
			branch(row.node, through, last);
		});
		const pending = this.deps.pending?.() ?? null;
		this.slot = pending ? el(this.el, "div", "tc-group-slot") : null;
		if (pending) renderTaskCard(this.el, pending, { day });
	}

	/** The field's row from the last drawing: it stays in the list, so the field in it keeps the focus and the keyboard. */
	private keptRow(): HTMLElement | null {
		const row = [...this.el.children].find((child) => child.classList.contains(QUICK_ROW));
		return row instanceof HTMLElement ? row : null;
	}

	/**
	 * The typed texts and the field's row after the rows drawn so far. A kept row stays where it is: what was drawn after
	 * it moves before it, and its old branches go.
	 */
	private enterRows(entry: ListEntryInput, rows: { node: HTMLElement; level: number }[], kept: HTMLElement | null): void {
		const put = (row: HTMLElement, level: number): void => {
			row.style.setProperty(PROPERTY.level, String(level));
			rows.push({ node: row, level });
		};
		const before: HTMLElement[] = [];
		for (let node = kept?.nextElementSibling ?? null; node; node = node.nextElementSibling) if (node instanceof HTMLElement) before.push(node);
		for (const { text, level } of entry.pending) {
			const card = renderUnwrittenCard(this.el, text);
			before.push(card);
			put(card, level);
		}
		if (kept) kept.before(...before);
		const row = kept ?? el(this.el, "div", QUICK_ROW);
		for (const old of row.querySelectorAll(":scope > .tc-branch, :scope > .tc-branch-pass")) old.remove();
		entry.field(row);
		row.classList.toggle("is-section", entry.section === true);
		put(row, entry.place.level);
	}

	/** The field's row keeps the dot of the task in progress it renames; a row for a new task has none. */
	private markRenamed(renaming: TaskKey | null): void {
		const row = this.keptRow();
		if (!row) return;
		const renamed = renaming === null ? undefined : this.entries.find((e) => samePlace(renaming, e.item.key));
		if (renamed) showProgressDot(row, renamed.item);
		else row.querySelector(":scope > .tc-progress-dot")?.remove();
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
		return this.viewOf(this.deps.items()).groups.flatMap((group) => rowsOf(group.items).map(({ item, level }) => ({ key: item.key, level, group: group.name })));
	}

	private viewOf(items: readonly TaskItem[]): ListView {
		return listView(items, this.deps.grouped?.() ?? false, this.deps.sections?.() ?? []);
	}

	/** A card as places in the list see it: in the section it is drawn in. */
	listCard(entry: ListEntry): ListCard {
		return { key: entry.item.key, level: entry.level, group: entry.group };
	}

	/** The sections as drawn; one ungrouped run when the list shows none. */
	get groups(): readonly ListGroup[] {
		return this.rendered;
	}

	get headers(): boolean {
		return this.withHeaders;
	}

	/** The No tasks plate of empty section `name`; null when none is drawn. */
	plateOf(name: GroupName): HTMLElement | null {
		return this.nodes.find((node) => node.classList.contains(PLATE) && node.dataset.group === name) ?? null;
	}

	/** Headers, plates and cards in the order they stand. */
	get elements(): readonly HTMLElement[] {
		return this.nodes;
	}

	private header(group: ListGroup): HTMLElement {
		const head = el(this.el, "div", group.name === null ? "tc-group-head is-ungrouped" : "tc-group-head");
		el(head, "span", "tc-group-name", group.name ?? this.deps.ungroupedName?.() ?? "");
		this.deps.onHeader?.(head, group);
		return head;
	}

	private plate(group: ListGroup): HTMLElement {
		const plate = el(this.el, "div", PLATE, "No tasks");
		plate.dataset.group = group.name ?? "";
		this.deps.onPlate?.(plate, group);
		return plate;
	}
}

/**
 * The branch lines of the row at `i` among rows of these `levels`: whether it is the last of its task's subtasks, and for each
 * task above its own whether that one has a later sibling, so its line goes on past the row.
 */
/** A task of the list at its depth. */
interface Row {
	readonly item: TaskItem;
	readonly level: number;
}

/** A section's tasks in the order the list draws them: each task, then its subtasks a level deeper, unless they are folded away. */
function rowsOf(items: readonly TaskItem[], level = 0): Row[] {
	return items.flatMap((item) => [{ item, level }, ...(item.collapsed ? [] : rowsOf(item.subtasks, level + 1))]);
}

function linesOf(levels: readonly number[], i: number): { through: boolean[]; last: boolean } {
	const goesOn = (level: number): boolean => levels.slice(i + 1).find((l) => l <= level) === level;
	const through = Array.from({ length: levels[i] - 1 }, (_, k) => goesOn(k + 1));
	return { through, last: !goesOn(levels[i]) };
}

/** A subtask's branch from its task, bending in if it is the last; and the lines of the tasks further up that go on past it. */
function branch(card: HTMLElement, through: readonly boolean[], last: boolean): void {
	el(card, "span", last ? "tc-branch is-last" : "tc-branch");
	through.forEach((goesOn, i) => {
		if (goesOn) el(card, "span", "tc-branch-pass").style.setProperty(PROPERTY.pass, String(through.length - i));
	});
}
