import { cardDue, dueLabel, MOST_CARD_COLORS, type PriorityColor, type ProjectsStage, type TaskItem, textParts } from "../../../../core/application/contracts";
import type { LocalDate } from "./answers";

/** The stage's mark on the right of a card By subprojects, in place of the date: the symbols of the wheel and of Backlog's title. */
export type StageMark = Exclude<ProjectsStage["kind"], "date">;

const STAGE_NAMES: ReadonlyMap<StageMark, string> = new Map([
	["today", "Today"],
	["soon", "Soon"],
	["inbox", "Inbox"],
	["backlog", "Backlog"],
	["done", "Done"],
]);

export function stageName(stage: StageMark): string {
	return STAGE_NAMES.get(stage) ?? "";
}

/** A piece of a title: plain text, or a link drawn in the accent that a tap opens. */
export type TitlePart = { readonly kind: "text"; readonly text: string } | { readonly kind: "note" | "url"; readonly label: string; readonly target: string };

/** The corner of a card: the due day over its month, the repeat's mark beside the day; a repeat with no date its mark alone. */
export interface DueFace {
	readonly day: string | null;
	readonly month: string | null;
	readonly repeats: boolean;
}

/** The column where the subtask counter stands: «2/5» over the description's mark, either alone. */
export interface MetaFace {
	readonly count: string | null;
	readonly description: boolean;
}

/**
 * A card as the view draws it (`TaskCard` of the old screen, the same marks): every fact read from the core's `TaskItem`,
 * nothing decided here but how the item's own fields are worded.
 */
export interface CardFace {
	/** The first colour tints the card (`data-priority`); a card of several colours carries each (`data-label0…`). */
	readonly tint: PriorityColor | null;
	/** A card of several colours carries each, painted as stripes or a blend; none for one colour. */
	readonly stripes: readonly PriorityColor[];
	/** Its subtasks are folded away: a card peeks out under it. */
	readonly folded: boolean;
	/** The task's status, which the stylesheet paints (the dot of a task in progress). */
	readonly status: TaskItem["status"];
	/** The small line over the title (a folded task's own title); null for a card of one line. */
	readonly over: string | null;
	readonly title: readonly TitlePart[];
	/** The project the folder mark names; null where the screen shows no mark. */
	readonly project: string | null;
	readonly meta: MetaFace | null;
	readonly due: DueFace | null;
	/** By subprojects: the stage's mark in the corner instead of the date. */
	readonly stage: StageMark | null;
}

export function titleParts(text: string): readonly TitlePart[] {
	return textParts(text);
}

/** How the card of `item` is drawn on a list of `day` (null for a list of no day): its due date there goes without saying. */
export function cardFace(item: TaskItem, day: LocalDate | null, stage: ProjectsStage | null = null): CardFace {
	const kept = FACES.get(item);
	if (kept && kept.day === day && kept.stage === stage) return kept.face;
	const face = faceOf(item, day, stage);
	FACES.set(item, { day, stage, face });
	return face;
}

/**
 * The face drawn for a task item, kept while the core answers the same item (its view answers are kept by replica):
 * a card whose face is the same object is not drawn again.
 */
const FACES = new WeakMap<TaskItem, { readonly day: LocalDate | null; readonly stage: ProjectsStage | null; readonly face: CardFace }>();

function faceOf(item: TaskItem, day: LocalDate | null, stage: ProjectsStage | null): CardFace {
	const colors = item.colors.slice(0, MOST_CARD_COLORS);
	const face = item.card;
	const step = face.step;
	const dated = stage?.kind === "date" ? stage.date : null;
	const corner = stage === null || dated !== null ? cardDue(dated ? { dueDate: dated, repeat: item.repeat } : item, day) : null;
	const label = corner?.date ? dueLabel(corner.date) : null;
	return {
		tint: colors.find(() => true) ?? null,
		stripes: colors.length > 1 ? colors : [],
		folded: item.collapsed,
		status: item.status,
		over: step ? (face.over ?? "") : null,
		title: titleParts(step ? step.text : item.text),
		project: item.project?.mark ? item.project.name : null,
		meta: metaOf(item),
		due: corner ? { day: label?.day ?? null, month: label?.month ?? null, repeats: corner.repeats } : null,
		stage: stage && stage.kind !== "date" ? stage.kind : null,
	};
}

/**
 * The counter of the task's own subtasks and the description's mark, as the core gives them: a task «may add a
 * description» exactly while it has none (`TaskItem.can.addDescription`).
 */
function metaOf(item: TaskItem): MetaFace | null {
	const count = item.progress ? `${item.progress.done}/${item.progress.total}` : null;
	const description = !item.can.addDescription;
	return count !== null || description ? { count, description } : null;
}
