import { type EntryListLook, type ListCard, type ProjectsListRow, type ProjectsStage, type ProjectsView, projectsEntryLook } from "../../core/application/contracts";
import type { CardFace, ListData, Row, StageMark } from "../ui/engine/port";
import { type CardGroups, ListCards } from "./ListCards";
import type { ScreenDrawing } from "./ScreenDrawing";

/** The stage's mark of the core's stage kind (Today is the sun, Now's). */
const MARKS: Readonly<Record<Exclude<ProjectsStage["kind"], "date">, StageMark>> = { inbox: "inbox", backlog: "backlog", soon: "soon", today: "now", done: "done" };

/** A part's header as the engine draws it: its own id, apart from every card's. */
const headerId = (key: string): string => `part:${key}`;

/**
 * By project's list (F229–F237) as the core's Projects screen gives it (`ProjectsView`), in the engine's words: one list of
 * rows, a part's header before its rows, each card with its stage's mark. A row is known by its task's id, unless the
 * task shows in two parts: then each of its rows by the core's own row id. It decides nothing: every row, header, plate
 * and mark is the core's.
 */
export class ProjectsList {
	/** The engine's id of each row, in the view's order of rows. */
	private readonly ids: readonly string[];
	private readonly rows = new Map<string, ProjectsListRow>();

	constructor(readonly view: ProjectsView) {
		const all = view.sections.flatMap((section) => section.rows);
		const seen = new Map<string, number>();
		for (const row of all) seen.set(row.item.id, (seen.get(row.item.id) ?? 0) + 1);
		this.ids = all.map((row) => ((seen.get(row.item.id) ?? 0) > 1 ? row.id : row.item.id));
		all.forEach((row, i) => this.rows.set(this.ids[i], row));
	}

	/** The row the engine knows as `id`; null for none. */
	rowOf(id: string): ProjectsListRow | null {
		return this.rows.get(id) ?? null;
	}

	/** The list and its cards' faces as the engine draws them. */
	draw(drawing: ScreenDrawing, emptyLabel: string): { readonly list: ListData; readonly cards: Readonly<Record<string, CardFace>> } {
		const rows: Row[] = [];
		const cards: Record<string, CardFace> = {};
		let at = 0;
		for (const section of this.view.sections) {
			if (section.header) rows.push({ kind: "section", id: headerId(section.key), title: section.title ?? "", tasks: section.cards.length, ungrouped: false, menu: null, plate: section.plate ? emptyLabel : null, lifts: false });
			for (const row of section.rows) {
				const id = this.ids[at++];
				const face = drawing.face(row.item, null);
				const stage = row.card?.stage ?? null;
				cards[id] = { ...face, id, due: stage?.kind === "date" ? stage.label : null, stage: stage && stage.kind !== "date" ? MARKS[stage.kind] : null };
				rows.push({ kind: "task", id, depth: row.level });
			}
		}
		return { list: { title: this.view.title, rows, plate: rows.length === 0 ? emptyLabel : null }, cards };
	}

	/** Its cards as the nesting rules read them, by the engine's ids: the gap a place names, `without` the card lifted. */
	cards(without: string | null = null): ListCards {
		let at = 0;
		const groups: CardGroups["groups"] = this.view.sections.map((section) => ({
			id: headerId(section.key),
			name: section.group,
			header: section.header,
			rows: section.rows.map((row) => ({ item: { id: this.ids[at++], key: row.item.key }, level: row.level })),
		}));
		return new ListCards({ groups }, without);
	}

	/** What the quick entry reads of the list (`projectsEntryLook`), its cards known by the engine's ids. */
	entryLook(): EntryListLook {
		const look = projectsEntryLook(this.view);
		return { ...look, cards: look.cards.map((card, i): ListCard => ({ ...card, id: this.ids[i] })) };
	}
}
