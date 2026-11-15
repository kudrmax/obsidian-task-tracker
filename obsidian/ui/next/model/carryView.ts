import { groupPlaceOf } from "../../../../core/application/contracts";
import { type BlockModel, currentLists } from "./block";
import type { CardFace } from "./card";
import type { CardRow, ListRow } from "./lists";

/** How the carry and the picks show on the rows (the view's `RowMarks`). */
export interface Marks {
	readonly waiting: ReadonlySet<string>;
	readonly arriving: string | null;
	readonly hot: string | null;
	readonly picking: boolean;
	readonly picked: ReadonlySet<string>;
	readonly landing: { readonly column: string; readonly index: number } | null;
}

/** The carried cards wait dashed where they stood; the card a drop lands on is its place until the float is down; the plate under the finger lit; the picks. */
export function rowMarks(model: BlockModel): Marks {
	const carry = model.carry;
	const carrying = carry !== null && carry.phase !== "landing";
	return {
		waiting: new Set(carrying ? carry.rows : []),
		arriving: carry?.phase === "landing" ? carry.lands : null,
		hot: carry?.target?.plate ?? null,
		picking: model.select?.selecting === true,
		picked: new Set(model.select?.picked ?? []),
		landing: sectionLanding(model),
	};
}

/**
 * Where a lifted section's landing place shows (the old screen's `SectionSlots.preview`): over the header of the slot
 * nearest the finger, among the headers the list draws while the section is lifted; none on the section's own slots.
 */
export function sectionLanding(model: BlockModel): { readonly column: string; readonly index: number } | null {
	const section = model.carry?.phase === "carried" ? model.carry.section : null;
	if (!section || groupPlaceOf(section.groups, section.lifted, section.gap) === null) return null;
	return { column: section.column, index: section.gap <= section.lifted ? section.gap : section.gap - 1 };
}

/** The drop line under the finger, in the stack's content pixels; null while none shows. */
export function dropLine(model: BlockModel): { readonly x: number; readonly y: number; readonly width: number } | null {
	const line = model.carry?.phase === "carried" ? model.carry.target?.line : null;
	return line ? { x: line.left, y: line.y, width: Math.max(0, line.right - line.left) } : null;
}

/** The variables the carry gives the stylesheet (`motion` writes them): the drop line's place and length. */
export function carryVars(model: BlockModel): ReadonlyMap<string, Readonly<Record<string, string>>> {
	const line = dropLine(model);
	return line ? new Map([["drop-line", { "--tc-n-drop-x": `${line.x}px`, "--tc-n-drop-y": `${line.y}px`, "--tc-n-drop-w": `${line.width}px` }]]) : new Map();
}

/** What the float under the finger draws: the card carried (as the snapshot drew it), how many go along, whether a stack of layers shows under it. */
export interface FloatFace {
	readonly face: CardFace;
	readonly count: number;
	/** A task with subtasks, or several carried: layers under the card. */
	readonly stacked: boolean;
}

export function floatFace(model: BlockModel): FloatFace | null {
	const carry = model.carry;
	if (!carry) return null;
	const lists = model.pinned ?? currentLists(model);
	const rows: readonly ListRow[] = lists.kind === "rows" ? lists.rows.flatMap((row) => row.list.rows) : lists.kind === "byProject" ? lists.list.rows : [];
	const row = rows.find((r): r is CardRow => r.kind === "card" && r.key === carry.id);
	if (!row) return null;
	return { face: row.face, count: carry.rows.length, stacked: carry.rows.length > 1 || carry.folded.length > 0 || row.face.folded };
}

/** The plus and the capsule step aside while a card or the plus is carried; a lifted section leaves them (the old block's QuickEntryController). */
export function footAside(model: BlockModel): boolean {
	return model.carry !== null && model.carry.kind !== "section";
}
