import { ScrollEdges } from "./ScrollEdges";
import { branchOf, type EntryAt, type EntryDrawing, type GroupName, type Header, type ListCard, type ListGroup, type ListGrouping, type ListRow, type ListSection, type ListView, listView, type PendingText, type ProjectGroup, type ProjectZone, samePlace, type TaskItem, type TaskKey } from "../../core/application/contracts";
import { icon } from "./kit/icons";
import { PROPERTY } from "./design";
import type { LocalDate } from "./types";
import { el } from "./dom";
import { fillCard, fillUnwrittenCard, showProgressDot } from "./TaskCard";
import { KeyedRows, type RowsDrawing } from "./motion/KeyedRows";

/** A task being typed in the list: the texts already typed, as plain cards each at its level, and the field after them, in `place`. */
export interface ListEntryInput {
	/** Where among the cards and sections drawn the field stands. */
	readonly at: EntryAt;
	/** The level the field stands at. */
	readonly level: number;
	readonly pending: readonly PendingText[];
	/** The field writes a section's name: it stands as the new header does, apart from the group above, whose plate stays. */
	readonly section?: boolean;
	/** The section named in a project's part for the task being typed: its header stands over the field. */
	readonly newSection?: string | null;
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
	/** The list's grouping by project: while on, the list draws its project groups in place of its sections. */
	grouping?(): ListGrouping | null;
	/** A project group's header: the chevron and the title fold it, the arrow opens the note. */
	onProjectHead?(head: HTMLElement, group: ProjectGroup, signal: AbortSignal): void;
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
	/** The No tasks plate under an empty section's header, or of an empty project group (`project`, its part). */
	onPlate?(plate: HTMLElement, group: ListGroup, signal: AbortSignal, project?: ProjectZone): void;
}

export interface ListEntry {
	readonly card: HTMLElement;
	readonly item: TaskItem;
	/** 0 for a task, one more for each task above a subtask. */
	readonly level: number;
	/** The section it is drawn in: none in a list that shows no headers. */
	readonly group: GroupName;
	/** The project's part it is drawn in, in a list grouped by project. */
	readonly project?: ProjectZone;
}

/** A section as the list draws it: in a list grouped by project, with the part of the project it is drawn in. */
export interface DrawnSection {
	readonly group: ListGroup;
	readonly project?: ProjectZone;
}

/** What the list draws, in order: a project group's header, or a section of cards. */
type Drawn = { readonly kind: "project"; readonly group: ProjectGroup } | ({ readonly kind: "section" } & DrawnSection);

/** What a list shows: its sections as the core groups them, or its project groups, each with its sections. */
interface ListShape {
	readonly headers: boolean;
	readonly drawn: readonly Drawn[];
}

function shapeOf(view: ListView, grouping: ListGrouping | null): ListShape {
	if (!grouping?.on) return { headers: view.showsHeaders, drawn: view.groups.map((group) => ({ kind: "section", group })) };
	const drawn = grouping.groups.flatMap((group): Drawn[] => [
		...(group.titled ? [{ kind: "project", group } as const] : []),
		...(group.folded ? [] : group.sections.map((section): Drawn => ({ kind: "section", group: section, project: group.zone }))),
	]);
	return { headers: drawn.some((d) => d.kind === "project" || d.group.header), drawn };
}

function sectionsOf(shape: ListShape): DrawnSection[] {
	return shape.drawn.flatMap((d) => (d.kind === "section" ? [{ group: d.group, ...(d.project !== undefined && { project: d.project }) }] : []));
}

/** A section's header as the places see it: a name, or with its project's part in a grouped list. */
function headerOf(section: DrawnSection): Header {
	return section.project === undefined ? section.group.name : { group: section.group.name, project: section.project };
}

function plateKey(name: GroupName, project?: ProjectZone): string {
	return JSON.stringify([project === undefined ? "" : project, name]);
}

const QUICK_ROW = "tc-quick-row";
/** The key of the field's row, and of the cards of the texts typed and not yet written, by their order. */
const ENTRY = "entry";
const UNWRITTEN = "unwritten:";
export const PLATE = "tc-group-empty";

/** What a list about to draw `shape` shows the field among. */
function drawingOf(shape: ListShape): EntryDrawing {
	const sections = sectionsOf(shape);
	return {
		cards: sections.flatMap((section) => section.group.rows.map(({ item, level }) => ({ key: item.key, level, group: section.group.name, ...(section.project !== undefined && { project: section.project }) }))),
		sections: sections.map(headerOf),
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
	/** Each header drawn, as the places see it: a section's, or a project group's (its part without a section, or its end while folded). */
	private heads = new Map<HTMLElement, Header>();
	/** Each empty section's No tasks plate drawn, by its name and its project's part. */
	private plates = new Map<string, HTMLElement>();
	/** Each section's cards as drawn, its subtasks' among them. */
	private sectionCards = new Map<ListGroup, HTMLElement[]>();
	private withHeaders = false;
	private slot: HTMLElement | null = null;
	/** The rows by key: a card by its task's id, a header by its section's, so a row lives as long as what it shows. */
	private readonly keyed: KeyedRows;
	/**
	 * How many texts typed here were drawn as plain cards last time, and how many of them the file has written since:
	 * the first new cards drawn now take over their rows (`heirs`), so a written text stays the same card on the screen.
	 */
	private typedDrawn = 0;
	private written = 0;
	private heirs: string[] = [];
	/** The day of the last drawing: another day is drawn at once, never moved into. */
	private drawnDay: LocalDate | null | undefined = undefined;
	/** `listCards` as of the last drawing, made the first time it is asked for. */
	private drawnCards: readonly ListCard[] | null = null;
	private readonly edges: ScrollEdges;
	/** Watches the list's width: a project's title cut or whole again fades or not. */
	private readonly sizes: ResizeObserver | null;

	constructor(
		readonly el: HTMLElement,
		private readonly deps: TaskListDeps,
	) {
		el.classList.add("tc-list");
		this.keyed = new KeyedRows(el);
		this.edges = new ScrollEdges(el);
		this.sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.fadeCutTitles());
		this.sizes?.observe(el);
	}

	/** The list goes away with its view or its peek: it stops following its scroll and size. */
	destroy(): void {
		this.edges.destroy();
		this.sizes?.disconnect();
	}

	/** Draws what the list shows now; `moving` false puts it in place at once, as for its first drawing. */
	render(moving = true): void {
		this.drawnCards = null;
		this.draw(moving);
		this.drawnCards = null;
		this.edges.update();
		this.fadeCutTitles();
	}

	/** A project's title fades at its end only when the header cuts it: the count and the arrow follow a whole title right after it. */
	private fadeCutTitles(): void {
		for (const name of this.el.querySelectorAll<HTMLElement>(".tc-group-head.is-project > .tc-group-name")) name.classList.toggle("is-cut", name.scrollWidth > name.clientWidth);
	}

	private draw(moving: boolean): void {
		const day = this.deps.day();
		const items = this.deps.items();
		const shape = this.shapeOf(items);
		const entry = this.deps.entry?.(drawingOf(shape)) ?? null;
		const renaming = this.deps.renaming?.() ?? null;
		const drawing = this.keyed.begin(moving && this.drawnDay === day);
		this.drawnDay = day;
		const typed = entry?.pending.length ?? 0;
		this.written = Math.max(0, this.typedDrawn - typed);
		this.heirs = Array.from({ length: this.written }, (_, i) => `${UNWRITTEN}${i}`);
		this.typedDrawn = typed;
		this.entries = [];
		this.nodes = [];
		this.heads = new Map();
		this.plates = new Map();
		this.sectionCards = new Map();
		this.rendered = sectionsOf(shape);
		this.withHeaders = shape.headers;
		const rows: { node: HTMLElement; level: number }[] = [];
		const signals = new Map<HTMLElement, AbortSignal>();
		const at = entry?.at ?? null;
		let entered = entry === null;
		let entryRow: HTMLElement | null = null;
		let section = 0;
		const enter = (): void => {
			if (entered || !entry) return;
			entered = true;
			entryRow = this.enterRows(drawing, entry, rows);
		};
		const enterAtCard = (): void => {
			if (at?.kind === "in" && at.section === section && at.card === this.entries.length) enter();
		};
		const add = ({ item, level }: ListRow, group: GroupName, project: ProjectZone | undefined): void => {
			enterAtCard();
			const card = this.cardOf(drawing, item, day, signals);
			card.style.setProperty(PROPERTY.level, String(level));
			const renamed = renaming !== null && samePlace(renaming, item.key);
			card.classList.toggle("is-renaming", renamed);
			this.entries.push({ card, item, level, group, ...(project !== undefined && { project }) });
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
		for (const part of shape.drawn) {
			if (part.kind === "project") {
				this.nodes.push(this.projectHeader(drawing, part.group));
				continue;
			}
			section = ++i;
			const { group, project } = part;
			if (this.withHeaders && group.header) this.nodes.push(this.header(drawing, group, project));
			const platesField = at?.kind === "in" && at.section === i && !at.keepsPlate;
			if (group.empty && !platesField) this.nodes.push(this.plate(drawing, group, project));
			const groupStart = this.entries.length;
			for (const row of group.rows) add(row, group.name, project);
			this.sectionCards.set(group, this.entries.slice(groupStart).map((e) => e.card));
			subtrees(groupStart);
			enterAtCard();
		}
		enter();
		if (entryRow) this.markRenamed(entryRow, renaming);
		rows.forEach((row, i) => {
			const lines = branchOf(rows.map((r) => r.level), i);
			if (lines) branch(row.node, lines.through, lines.last);
		});
		const pending = this.deps.pending?.() ?? null;
		this.slot = pending ? drawing.take("slot", () => el(null, "div", "tc-group-slot")).node : null;
		if (pending) this.cardOf(drawing, pending, day, signals);
		drawing.finish();
	}

	/** A task's card: the one drawn for it last time, filled anew, or a new one; its branches go, the list draws them again. */
	private cardOf(drawing: RowsDrawing, item: TaskItem, day: LocalDate | null, signals: Map<HTMLElement, AbortSignal>): HTMLElement {
		const heir = this.heirs.length > 0 && !this.keyed.nodeOf(`task:${item.id}`) ? this.heirs.shift() : undefined;
		const { node, fresh, signal } = drawing.take(`task:${item.id}`, () => el(null, "div", "tc-card"), heir);
		if (!fresh) node.replaceChildren();
		fillCard(node, item, { day });
		signals.set(node, signal);
		return node;
	}

	/** The typed texts, each as a plain card at its level, then the field's row, after the rows drawn so far. */
	private enterRows(drawing: RowsDrawing, entry: ListEntryInput, rows: { node: HTMLElement; level: number }[]): HTMLElement {
		const put = (row: HTMLElement, level: number): void => {
			row.style.setProperty(PROPERTY.level, String(level));
			rows.push({ node: row, level });
		};
		entry.pending.forEach(({ text, level }, i) => {
			const { node, fresh } = drawing.take(`${UNWRITTEN}${i}`, () => el(null, "div", "tc-card"), `${UNWRITTEN}${i + this.written}`);
			if (!fresh) node.replaceChildren();
			fillUnwrittenCard(node, text);
			put(node, level);
		});
		if (entry.newSection) this.namedHeader(drawing, entry.newSection);
		const row = drawing.take(ENTRY, () => el(null, "div", QUICK_ROW)).node;
		for (const old of row.querySelectorAll(":scope > .tc-branch, :scope > .tc-branch-pass")) old.remove();
		entry.field(row);
		row.classList.toggle("is-section", entry.section === true);
		put(row, entry.level);
		return row;
	}

	/** The header of the section named for the task being typed, over the field, as a section's header looks. */
	private namedHeader(drawing: RowsDrawing, name: string): HTMLElement {
		const head = drawing.take("named", () => el(null, "div", "tc-group-head is-named")).node;
		head.replaceChildren();
		el(head, "span", "tc-group-name", name);
		return head;
	}

	/** The field's row keeps the dot of the task in progress it renames; a row for a new task has none. */
	private markRenamed(row: HTMLElement, renaming: TaskKey | null): void {
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
		return drawingOf(this.shapeOf(this.deps.items())).cards;
	}

	private shapeOf(items: readonly TaskItem[]): ListShape {
		return shapeOf(listView(items, this.deps.grouped?.() ?? false, this.deps.sections?.() ?? []), this.deps.grouping?.() ?? null);
	}

	/** A card as places in the list see it: in the section, and the project's part, it is drawn in. */
	listCard(entry: ListEntry): ListCard {
		return { key: entry.item.key, level: entry.level, group: entry.group, ...(entry.project !== undefined && { project: entry.project }) };
	}

	/** The sections as drawn; one ungrouped run when the list shows none. */
	get groups(): readonly ListGroup[] {
		return this.rendered.map((section) => section.group);
	}

	/** The sections as drawn, each with its project's part in a list grouped by project: what the field stands among. */
	get sections(): readonly Header[] {
		return this.rendered.map(headerOf);
	}

	/** What a header drawn means for a place: undefined for any other node. */
	headerAt(node: HTMLElement): Header | undefined {
		return this.heads.get(node);
	}

	get headers(): boolean {
		return this.withHeaders;
	}

	/** The No tasks plate of empty section `name` (of the project's part `project`); null when none is drawn. */
	plateOf(name: GroupName, project?: ProjectZone): HTMLElement | null {
		return this.plates.get(plateKey(name, project)) ?? null;
	}

	/** The cards drawn in `group`, one of `groups`, its subtasks' among them. */
	cardsOf(group: ListGroup): readonly HTMLElement[] {
		return this.sectionCards.get(group) ?? [];
	}

	/** Headers, plates and cards in the order they stand. */
	get elements(): readonly HTMLElement[] {
		return this.nodes;
	}

	private header(drawing: RowsDrawing, group: ListGroup, project?: ProjectZone): HTMLElement {
		const { node: head, signal } = drawing.take(`head:${JSON.stringify([project ?? "", group.id])}`, () => el(null, "div", "tc-group-head"));
		head.replaceChildren();
		head.classList.toggle("is-ungrouped", group.name === null);
		head.classList.toggle("is-in-project", project !== undefined);
		el(head, "span", "tc-group-name", group.name ?? this.deps.ungroupedName?.() ?? "");
		this.heads.set(head, headerOf({ group, project }));
		this.deps.onHeader?.(head, group, signal);
		return head;
	}

	/**
	 * A project group's header: the section header with a chevron before its title, turned down while the group is open,
	 * the count of its tasks while folded, and the arrow that opens the note. A drop on it lands in the group: among its
	 * tasks without a section, or at its end while it is folded.
	 */
	private projectHeader(drawing: RowsDrawing, group: ProjectGroup): HTMLElement {
		const { node: head, signal } = drawing.take(`project:${group.key}`, () => el(null, "div", "tc-group-head is-project"));
		head.replaceChildren();
		head.classList.toggle("is-ungrouped", group.project === null);
		head.classList.toggle("is-shut", group.folded);
		head.setAttribute("role", "button");
		head.setAttribute("aria-expanded", String(!group.folded));
		el(head, "span", "tc-group-chevron").appendChild(icon("chevronRight"));
		el(head, "span", "tc-group-name", group.title);
		if (group.folded) el(head, "span", "tc-group-count", String(group.count));
		if (group.canOpenNote) {
			const open = el(head, "span", "tc-group-open");
			open.setAttribute("aria-label", `Open ${group.title}`);
			open.appendChild(icon("openFile"));
		}
		this.heads.set(head, group.head);
		this.deps.onProjectHead?.(head, group, signal);
		return head;
	}

	private plate(drawing: RowsDrawing, group: ListGroup, project?: ProjectZone): HTMLElement {
		const { node: plate, signal } = drawing.take(`plate:${JSON.stringify([project ?? "", group.id])}`, () => el(null, "div", PLATE, "No tasks"));
		plate.dataset.group = group.name ?? "";
		this.plates.set(plateKey(group.name, project), plate);
		this.deps.onPlate?.(plate, group, signal, project);
		return plate;
	}
}

/** A subtask's branch from its task, bending in if it is the last; and the lines of the tasks further up that go on past it. */
function branch(card: HTMLElement, through: readonly boolean[], last: boolean): void {
	el(card, "span", last ? "tc-branch is-last" : "tc-branch");
	through.forEach((goesOn, i) => {
		if (goesOn) el(card, "span", "tc-branch-pass").style.setProperty(PROPERTY.pass, String(through.length - i));
	});
}
