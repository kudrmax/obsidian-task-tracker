import type { TaskDocument, TaskEntry } from "../domain/TaskDocument";
import type { GroupedList } from "../domain/Lists";
import { projectKey } from "../domain/Project";
import { type ProjectsCard, type ProjectsDrop, type ProjectsDropLanding, type ProjectsSection, type ProjectsView, StaleTaskError, type TaskChange, type TaskKey, type TaskStep } from "./contracts";
import type { ListPlace } from "./nesting";
import { projectOfNode } from "./projectsScreen";
import { keyOf, samePlace } from "./taskKeys";

const GROUPED: ReadonlySet<string> = new Set<GroupedList>(["inbox", "backlog", "soon", "now"]);

/** The tasks a drop names, found in the document as read. */
type EntryOf = (key: TaskKey) => TaskEntry;

/**
 * The steps of `applyAll` a drop in the Projects list means, over `view`, the screen as read from `doc`: the funnel's own
 * moves (`nest`, `moveToGroup`) and, By project, the part's project in place of the one each card was shown under.
 */
export function projectsDropSteps(view: ProjectsView, doc: TaskDocument, entryOf: EntryOf, cards: readonly ProjectsDrop[], place: ListPlace): readonly TaskStep[] {
	if (!view.reorders) throw new StaleTaskError();
	if (place.kind === "subtask") return cards.map((card) => ({ key: card.key, change: { kind: "nest", parent: place.parent, before: place.before } }));
	const section = view.sections.find((s) => s.group === place.group);
	if (!section) throw new StaleTaskError();
	const move = placeIn(section, doc, entryOf, new Set(cards.map((card) => entryOf(card.key).id)), place.before);
	if (move === null) return [];
	const to = partProject(view, section);
	return cards.flatMap((card): TaskStep[] => [
		{ key: card.key, change: move },
		...(view.mode === "byProject" && !sameProject(card.from, to) ? [{ key: card.key, change: { kind: "swapProject", from: card.from, to } } as const] : []),
	]);
}

/**
 * Where a card let go before `before` (null: at the end) of `section` goes in the file: right after the card above it, in
 * that card's list and section; with none above, right before the card below; in an empty part, where its plus writes.
 * The dropped tasks (`dropped`, their ids) are neither above nor below.
 */
function placeIn(section: ProjectsSection, doc: TaskDocument, entryOf: EntryOf, dropped: ReadonlySet<string>, before: TaskKey | null): Extract<TaskChange, { readonly kind: "moveToGroup" }> | null {
	const at = before === null ? section.cards.length : section.cards.findIndex((card) => samePlace(card.item.key, before));
	if (at < 0) throw new StaleTaskError();
	const kept = (card: ProjectsCard) => !dropped.has(entryOf(card.item.key).id);
	const above = section.cards.slice(0, at).filter(kept).pop();
	const below = section.cards.slice(at).find(kept);
	if (above) return after(doc, entryOf(above.item.key), dropped);
	if (below) {
		const entry = entryOf(below.item.key);
		return { kind: "moveToGroup", list: listOf(entry), group: entry.group, before: keyOf(entry) };
	}
	const plus = section.newTask?.place;
	return plus && plus.kind === "list" ? { kind: "moveToGroup", list: plus.list, group: plus.group, before: plus.before } : null;
}

/** Right after `entry` in the file: before the next task of its list and section that is not being dropped, else at that section's end. */
function after(doc: TaskDocument, entry: TaskEntry, dropped: ReadonlySet<string>): Extract<TaskChange, { readonly kind: "moveToGroup" }> {
	const list = listOf(entry);
	const next = doc.tasks(entry.section).find((other) => other.index > entry.index && other.group === entry.group && !dropped.has(other.id));
	return { kind: "moveToGroup", list, group: entry.group, before: next ? keyOf(next) : null };
}

function listOf(entry: TaskEntry): GroupedList {
	if (!GROUPED.has(entry.section)) throw new StaleTaskError();
	return entry.section as GroupedList;
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
