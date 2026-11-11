import { type EntryAt, type PendingText, samePlace, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { PROPERTY } from "./design";
import { el } from "./dom";
import type { KeyedRows, RowsDrawing } from "./motion/KeyedRows";
import { fillUnwrittenCard, showProgressDot } from "./TaskCard";

/** A task being typed in a list: the texts already typed, as plain cards each at its level, and the field after them, in `place`. */
export interface ListEntryInput {
	/** Where among the cards and sections drawn the field stands. */
	readonly at: EntryAt;
	/** The level the field stands at. */
	readonly level: number;
	readonly pending: readonly PendingText[];
	/** The field writes a section's name: it stands as the new header does, apart from the group above, whose plate stays. */
	readonly section?: boolean;
	/** Draws the field into `parent`, the row that stands in the list; gives the field's element. */
	field(parent: HTMLElement): HTMLElement;
}

/** A row drawn in the list, at its level: what the branches are drawn over. */
export interface LevelRow {
	readonly node: HTMLElement;
	readonly level: number;
}

const QUICK_ROW = "tc-quick-row";
/** The key of the field's row, and of the cards of the texts typed and not yet written, by their order. */
const ENTRY = "entry";
const UNWRITTEN = "unwritten:";

/**
 * The quick entry as every list the field stands in draws it among its cards, the funnel's columns and the Projects
 * screen's list alike: the texts typed and not yet written, the field's row, the card being renamed hidden in its place,
 * and a written text's card taking over the row it was typed as.
 */
export class EntryRows {
	/**
	 * The tasks the field has written, by the id each write answered (`TaskService.createWithId`), oldest first: the card
	 * drawn for one takes over the row of the text it was typed as, so a written text stays the same card on the screen.
	 */
	private created: string[] = [];
	/** A card was renamed in place last time, and is now: its field's row comes and goes with the card's in the same frame. */
	private renamedDrawn = false;
	private renaming: TaskKey | null = null;
	/** How many texts typed have become their tasks' cards in this drawing. */
	private written = 0;

	constructor(private readonly keyed: KeyedRows) {}

	/** A drawing starts, with `renaming` the task whose text the field edits, wherever the field stands. */
	begin(drawing: RowsDrawing, renaming: TaskKey | null): void {
		if (this.renamedDrawn && renaming === null) drawing.forget(ENTRY);
		this.renamedDrawn = renaming !== null;
		this.renaming = renaming;
		this.written = 0;
	}

	/** The card of `key` is the one being renamed: it keeps its place, hidden, and the branches pass it by. */
	renames(key: TaskKey): boolean {
		return this.renaming !== null && samePlace(this.renaming, key);
	}

	/** The typed texts, each as a plain card at its level, then the field's row, after the rows drawn so far (`rows`). */
	draw(drawing: RowsDrawing, entry: ListEntryInput, rows: LevelRow[]): HTMLElement {
		const put = (row: HTMLElement, level: number): void => {
			row.style.setProperty(PROPERTY.level, String(level));
			rows.push({ node: row, level });
		};
		/** Lines typed since the last drawing: each stands where the field stood, and the field's row opens anew under them. */
		let typed = false;
		entry.pending.forEach(({ text, level }, i) => {
			const { node, fresh } = drawing.take(`${UNWRITTEN}${i}`, () => el(null, "div", "tc-card"), `${UNWRITTEN}${i + this.written}`);
			if (!fresh) node.replaceChildren();
			else if (this.keyed.nodeOf(ENTRY)) {
				drawing.standIn(node);
				typed = true;
			}
			fillUnwrittenCard(node, text);
			put(node, level);
		});
		const row = drawing.take(ENTRY, () => el(null, "div", QUICK_ROW)).node;
		if (this.renaming !== null) drawing.standIn(row);
		else if (typed) drawing.regrow(row);
		for (const old of row.querySelectorAll(":scope > .tc-branch, :scope > .tc-branch-pass")) old.remove();
		entry.field(row);
		row.classList.toggle("is-section", entry.section === true);
		put(row, entry.level);
		return row;
	}

	/** The field's row keeps the dot of the task in progress it renames; a row for a new task has none. */
	markRenamed(row: HTMLElement, drawn: readonly { readonly item: TaskItem }[]): void {
		const renaming = this.renaming;
		const renamed = renaming === null ? undefined : drawn.find((e) => samePlace(renaming, e.item.key));
		if (renamed) showProgressDot(row, renamed.item);
		else row.querySelector(":scope > .tc-progress-dot")?.remove();
	}

	/**
	 * A task the field has just written (`id`) takes over the row of the text it was typed as, unless its card (`key`) is
	 * drawn already; it stops being awaited then. The row's key to take over, if any.
	 */
	heirOf(id: string, key: string): string | undefined {
		const at = this.created.indexOf(id);
		if (at < 0 || this.keyed.nodeOf(key)) return undefined;
		this.created.splice(at, 1);
		return `${UNWRITTEN}${this.written++}`;
	}

	/** The field wrote a task where it was typed (`id`, as the write answered): its card takes the typed text's row when drawn. */
	adopt(id: string): void {
		this.created.push(id);
	}

	/** The field closed: no text typed is awaited any more. */
	forget(): void {
		this.created = [];
	}
}
