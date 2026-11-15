import type { ProjectsListRow, ProjectsSection, ProjectsView, ScreenView, TaskBlock, TaskItem, TaskKey } from "./contracts";
import { keyId } from "./taskKeys";

/** The timeline's block while the field is open: its step line is the field. */
const FIELD_BLOCK: TaskBlock = { text: "", title: "", step: null };

/** The task as drawn while First step's field is open on it: folded (with the fold's edge, subtasks or not), its card the field's. */
function typing(item: TaskItem): TaskItem {
	return { ...item, collapsed: true, card: item.firstStepCard, block: FIELD_BLOCK };
}

/** `items` with the task of `id`, at any depth, drawn as `typing`; the same array, and each item untouched, when it is not among them. */
function typedIn(items: readonly TaskItem[], id: string): readonly TaskItem[] {
	let changed = false;
	const next = items.map((item) => {
		const drawn = typedItem(item, id);
		if (drawn !== item) changed = true;
		return drawn;
	});
	return changed ? next : items;
}

function typedItem(item: TaskItem, id: string): TaskItem {
	if (keyId(item.key) === id) return typing(item);
	const subtasks = typedIn(item.subtasks, id);
	const allSubtasks = typedIn(item.allSubtasks, id);
	return subtasks === item.subtasks && allSubtasks === item.allSubtasks ? item : { ...item, subtasks, allSubtasks };
}

/** The screen's lists, day lists and timeline while First step's field is open on `key`: that task folded, its subtasks gone from the lists. */
export function firstStepScreen(view: ScreenView, key: TaskKey): ScreenView {
	const id = keyId(key);
	const list = typedIn(view.day.list, id);
	const slotted = typedIn(view.day.slotted, id);
	const soon = typedIn(view.soon, id);
	const inbox = typedIn(view.inbox, id);
	const backlog = typedIn(view.backlog, id);
	const same = list === view.day.list && slotted === view.day.slotted && soon === view.soon && inbox === view.inbox && backlog === view.backlog;
	return same ? view : { ...view, day: { ...view.day, list, slotted }, soon, inbox, backlog };
}

/** A part's rows with the task's row folded and the rows of its subtasks, deeper and right after it, left out. */
function typedRows(rows: readonly ProjectsListRow[], id: string): readonly ProjectsListRow[] {
	const out: ProjectsListRow[] = [];
	let under: number | null = null;
	for (const row of rows) {
		if (under !== null && row.level > under) continue;
		under = null;
		if (keyId(row.item.key) !== id) {
			out.push(row);
			continue;
		}
		under = row.level;
		out.push({ ...row, item: typing(row.item), card: row.card && { ...row.card, item: typing(row.card.item) } });
	}
	return out.length === rows.length && out.every((row, i) => row === rows[i]) ? rows : out;
}

function typedSection(section: ProjectsSection, id: string): ProjectsSection {
	const rows = typedRows(section.rows, id);
	if (rows === section.rows) return section;
	return { ...section, rows, cards: section.cards.map((card) => (keyId(card.item.key) === id ? { ...card, item: typing(card.item) } : card)) };
}

/** The Projects screen's list while First step's field is open on `key`: that task's row folded, the rows of its subtasks left out. */
export function firstStepProjects(view: ProjectsView, key: TaskKey): ProjectsView {
	const id = keyId(key);
	const sections = view.sections.map((section) => typedSection(section, id));
	return sections.every((section, i) => section === view.sections[i]) ? view : { ...view, sections };
}
