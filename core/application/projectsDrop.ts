import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import type { GroupedList } from "../domain/Lists";
import type { LocalDate } from "../domain/Task";
import { projectKey } from "../domain/Project";
import type { DropColumn, DropFrom, GroupName, ProjectsCard, ProjectsDrop, ProjectsDropLanding, ProjectsLifted, ProjectsSection, ProjectsView, TaskItem, TaskKey, TaskStep } from "./contracts";
import { StaleTaskError } from "./contracts";
import { acceptsDrop, dropMove } from "./drops";
import type { ListPlace } from "./nesting";
import { originOf } from "./projectsLift";
import { projectOfNode } from "./projectsScreen";
import { keyOf, samePlace } from "./taskKeys";

const COLUMN_OF: Readonly<Record<GroupedList, DropColumn>> = { now: "day", soon: "soon", inbox: "inbox", backlog: "backlog" };

/** The list a task stands in: its own, a subtask's its task's; Today is Now. */
function listOf(item: { readonly list: ProjectsLifted["list"] }): GroupedList | null {
	return item.list === "done" ? null : item.list;
}

/**
 * A carried card as the drop judges it: who its task is, its list, the column it is dragged from, and whether the list
 * shows a card of it (`shown`): one it does not show was lifted on another node, then a held card opened this one.
 */
interface Carried extends ProjectsLifted {
	readonly shown: boolean;
}

function carriedOf(item: TaskItem): Carried {
	return { id: item.id, list: item.list, origin: originOf(item), shown: true };
}

/** Where a drop between cards goes: next to a card (after the one above, or before the one below), or into an empty part. */
type Anchor = { readonly kind: "after" | "before"; readonly item: TaskItem } | { readonly kind: "empty"; readonly list: GroupedList | null };

/** What a drop in the Projects list between cards means, before the file is looked at. */
interface Plan {
	readonly anchor: Anchor;
	/** The part's project in place of the one each card was shown under (By project); undefined: the projects stay. */
	readonly project: string | null | undefined;
}

function shownItem(view: ProjectsView, key: TaskKey): TaskItem | null {
	for (const section of view.sections) for (const row of section.rows) if (samePlace(row.item.key, key)) return row.item;
	return null;
}

/** A carried card as the screen shows it, else as it was lifted (`ProjectsDrop.lifted`); stale when neither says. */
function carriedIn(view: ProjectsView, card: ProjectsDrop): Carried {
	const item = shownItem(view, card.key);
	if (item) return carriedOf(item);
	if (!card.lifted) throw new StaleTaskError();
	return { ...card.lifted, shown: false };
}

/** A carried card as the file has it now (`entry`), the screen read from that file saying whether it shows it. */
function carriedInFile(view: ProjectsView, entry: TaskEntry, card: ProjectsDrop): Carried {
	const item = shownItem(view, card.key);
	if (item) return carriedOf(item);
	if (!card.lifted) throw new StaleTaskError();
	return { id: entry.id, list: entry.section, origin: originOf({ list: entry.section, slot: entry.task.slot, dueDate: entry.task.dueDate }), shown: false };
}

/**
 * The drop's plan over `view`, the screen as read: the part, and the card next to which the cards go (dropped ones never
 * counted, nor a second card of a task shown in two parts). Rejects with StaleTaskError for a part the screen lacks.
 */
function planOf(view: ProjectsView, carried: readonly Carried[], place: Extract<ListPlace, { readonly kind: "task" }>): Plan {
	const section = view.sections.find((s) => s.group === place.group);
	if (!section) throw new StaleTaskError();
	const at = place.before === null ? section.cards.length : section.cards.findIndex((card) => samePlace(card.item.key, place.before!));
	if (at < 0) throw new StaleTaskError();
	const kept = (card: ProjectsCard) => !carried.some((item) => item.id === card.item.id);
	const above = section.cards.slice(0, at).filter(kept).pop();
	const below = section.cards.slice(at).find(kept);
	const anchors: Anchor[] = [...(above ? [{ kind: "after", item: above.item } as const] : []), ...(below ? [{ kind: "before", item: below.item } as const] : [])];
	const anchor = anchors.find((a) => enters(carried, targetList(a))) ?? anchors[0] ?? { kind: "empty", list: null };
	return { anchor, project: partProject(view, section) };
}

/** Every card may stand in `target`: one already in it only moves among its tasks; one from elsewhere as that stage's column takes it. */
function enters(carried: readonly Carried[], target: GroupedList | null): boolean {
	if (target === null) return true;
	const moving = carried.filter((item) => listOf(item) !== target).map((item) => item.origin);
	return moving.length === 0 || (moving.every((origin): origin is DropFrom => origin !== null) && acceptsDrop(COLUMN_OF[target], moving));
}

/** The list the cards go into: the card's they go next to, or the empty stage's; null where they keep their own (an empty part By project). */
function targetList(anchor: Anchor): GroupedList | null {
	return anchor.kind === "empty" ? anchor.list : listOf(anchor.item);
}

/**
 * Whether a drop of these cards at `place` is taken, as the funnel's columns take it (`acceptsDrop`): a card that stays in
 * its own stage always is (it only moves among its list's tasks); one that changes stage only where that stage's column
 * would take it (Inbox and Backlog never a dated or timed task, Soon never a timed one). Between two cards of different
 * stages the card above decides, or the card below when the card above's stage would refuse them. A place under a task
 * always is, unless that task is in a part that takes no card (a folder's own: a task nested there would be given the
 * folder); so is no place in such a part. A card the list shows no card of (lifted on another node) is judged as it was
 * lifted (`ProjectsDrop.lifted`).
 */
export function projectsTakes(view: ProjectsView, cards: readonly ProjectsDrop[], place: ListPlace): boolean {
	if (!view.reorders) return false;
	if (place.kind === "subtask") return nestsUnder(view, place.parent);
	return takes(view, cards.map((card) => carriedIn(view, card)), place);
}

/**
 * The plus may be let go at `place` of the Projects list: a new task may be written there. Between cards, in a part that
 * writes a new task (`ProjectsSection.newTask`; a folder's own part and Done's write none); under a task, only where a
 * card may be nested (`nestsUnder`: a part that takes cards, a task carrying no folder), on a node whose list takes drops
 * (not Done, not a done project).
 */
export function projectsPlusTakes(view: ProjectsView, place: ListPlace): boolean {
	if (place.kind === "subtask") return view.reorders && nestsUnder(view, place.parent);
	return view.sections.find((s) => s.group === place.group)?.newTask != null;
}

function takes(view: ProjectsView, carried: readonly Carried[], place: Extract<ListPlace, { readonly kind: "task" }>): boolean {
	if (!(view.sections.find((s) => s.group === place.group)?.takes ?? true)) return false;
	return enters(carried, targetList(planOf(view, carried, place).anchor));
}

/**
 * A card may be nested under the row of `key`: it is drawn in a part that takes cards, and its task (the card it stands
 * under, for a subtask) carries no folder, which a subtask would carry too. In whichever part draws it, By stage too.
 */
function nestsUnder(view: ProjectsView, key: TaskKey): boolean {
	for (const section of view.sections) {
		const at = section.rows.findIndex((row) => samePlace(row.item.key, key));
		if (at < 0) continue;
		const top = section.rows.slice(0, at + 1).reverse().find((row) => row.level === 0);
		return section.takes && !(top?.item.projects.some((p) => p.folder) ?? false);
	}
	return false;
}

/**
 * The steps of `applyAll` a drop in the Projects list means, over `view`, the screen as read from `doc`. Under a task: the
 * lists' nest. Between cards: a card that stays in its stage only moves among its list's tasks (`reorder`, nothing on its
 * line changed); one that changes stage moves as a drop on that stage's column writes it (the funnel's `dropMove`); an
 * empty part By project moves nothing. By project the part's project then takes the place of the one each card was
 * shown under. A card the list does not show (lifted on another node) is judged as the file has it, and By stage the
 * chosen node's project takes the place of the one it was shown under (No project: that one goes; All: they stay). None
 * when the place does not take the cards (`projectsTakes`).
 */
export function projectsDropSteps(view: ProjectsView, doc: TaskDocument, entryOf: (key: TaskKey) => TaskEntry, cards: readonly ProjectsDrop[], place: ListPlace, today: LocalDate): readonly TaskStep[] {
	if (!view.reorders) throw new StaleTaskError();
	if (place.kind === "subtask") {
		if (!nestsUnder(view, place.parent)) return [];
		return cards.map((card) => ({ key: card.key, change: { kind: "nest", parent: place.parent, before: place.before } }));
	}
	const carried = cards.map((card) => carriedInFile(view, entryOf(card.key), card));
	if (!takes(view, carried, place)) return [];
	const plan = planOf(view, carried, place);
	const { anchor } = plan;
	const target = targetList(anchor);
	const dropped = new Set(cards.map((card) => entryOf(card.key).id));
	const spot = target === null ? null : spotOf(doc, anchor, target, entryOf, dropped);
	return cards.flatMap((card, i): TaskStep[] => {
		const item = carried[i];
		const moves: TaskStep[] = [];
		if (spot !== null && target !== null) {
			if (listOf(item) === target) moves.push({ key: card.key, change: { kind: "reorder", group: spot.group, before: spot.before } });
			else {
				const move = dropMove(item.origin!, { kind: "group", list: target, date: null, group: spot.group, before: spot.before }, today);
				if (move.kind === "toTime" || move.kind === "clearSlot") throw new StaleTaskError();
				moves.push({ key: card.key, change: move });
			}
		}
		const project = projectFor(view, plan, item);
		if (project !== undefined && !sameProject(card.from, project)) moves.push({ key: card.key, change: { kind: "swapProject", from: card.from, to: project } });
		return moves;
	});
}

/** The section and the task the cards go before in `list`: right after the card above (before the next task of its section not being dropped, else that section's end), right before the card below, or the end of an empty stage's list. */
function spotOf(doc: TaskDocument, anchor: Anchor, list: GroupedList, entryOf: (key: TaskKey) => TaskEntry, dropped: ReadonlySet<string>): { readonly group: GroupName; readonly before: TaskKey | null } {
	if (anchor.kind === "empty") return { group: null, before: null };
	const entry = entryOf(anchor.item.key);
	if (anchor.kind === "before") return { group: entry.group, before: keyOf(entry) };
	const next = doc.tasks(list).find((other) => other.index > entry.index && other.group === entry.group && !dropped.has(other.id));
	return { group: entry.group, before: next ? keyOf(next) : null };
}

/** The project that takes the place of the one a card was shown under: the part's. */
function projectFor(_view: ProjectsView, plan: Plan, _item: Carried): string | null | undefined {
	return plan.project;
}

/** The project a part stands for: the chosen node's for its own part, none for No project's, else the part's subproject. */
function partProject(view: ProjectsView, section: ProjectsSection): string | null {
	return section.group === null ? projectOfNode(view.selected) : projectOfNode(section.key);
}

function sameProject(a: string | null, b: string | null): boolean {
	return a === null || b === null ? a === b : projectKey(a) === projectKey(b);
}

/** Where the task `id` stands on the Projects screen `view`: a card, preferring the part it was dropped in (`group`), a subtask, or away. */
export function projectsLandingOf(view: ProjectsView, id: string, group: string | null | undefined): ProjectsDropLanding {
	const parts = [...view.sections.filter((s) => group !== undefined && s.group === group), ...view.sections.filter((s) => group === undefined || s.group !== group)];
	for (const section of parts) {
		const index = section.cards.findIndex((card) => card.item.id === id);
		if (index >= 0) {
			const card = section.cards[index];
			return { kind: "card", id, item: card.item, card: card.id, section: section.key, index };
		}
	}
	for (const section of parts) {
		const rowAt = section.rows.findIndex((row) => row.level > 0 && row.item.id === id);
		if (rowAt < 0) continue;
		const row = section.rows[rowAt];
		const parent = section.rows.slice(0, rowAt).reverse().find((r) => r.level === row.level - 1)!;
		return { kind: "subtask", id, item: row.item, parent: parent.item.id, index: parent.item.subtasks.findIndex((sub) => sub.id === id) };
	}
	return { kind: "away", id, item: null };
}
