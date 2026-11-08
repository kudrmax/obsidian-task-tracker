import type { DropLanding, GroupedList, LandingColumn, LandingPart, ScreenView, TaskItem } from "./contracts";
import type { LocalDate } from "../domain/Task";
import type { TimelineSpans } from "./TimelineSpans";

/** Where the task `id` stands on `screen`, the screen of `day`: a block of its timeline, a card of a column, a subtask, or away. */
export function landingOf(screen: ScreenView, id: string, day: LocalDate, timeline: TimelineSpans): DropLanding {
	const span = (item: TaskItem) => timeline.shown({ slot: item.slot!, open: item.open }, day);
	const block = screen.day.slotted.find((item) => item.id === id);
	if (block) {
		const own = timeline.shown({ slot: block.slot!, open: false }, day);
		const shown = span(block);
		return { kind: "timeline", id, item: block, span: shown, ridesNow: shown.start !== own.start, slotted: screen.day.slotted.map((item) => ({ id: item.id, span: span(item) })) };
	}
	const columns: readonly [LandingColumn, readonly TaskItem[]][] = [["day", screen.day.list], ["soon", screen.soon], ["inbox", screen.inbox], ["backlog", screen.backlog], ["done", screen.done]];
	for (const [column, items] of columns) {
		const card = items.find((item) => item.id === id);
		if (card) {
			const part = partOf(screen, column, id);
			return { kind: "list", id, item: card, column, group: card.group, index: items.filter((item) => item.group === card.group).indexOf(card), ...(part && { part }) };
		}
		for (const top of items) {
			const under = subtaskOf(top, id);
			if (under) return under;
		}
	}
	return { kind: "away", id, item: null };
}

/** The project part of `column` the card `id` is drawn in, while the column draws parts; null otherwise. */
function partOf(screen: ScreenView, column: LandingColumn, id: string): LandingPart | null {
	if (column === "done") return null;
	const list: GroupedList = column === "day" ? "now" : column;
	const grouping = screen.projects[list];
	if (!grouping.on) return null;
	for (const group of grouping.groups)
		for (const section of group.sections) {
			const index = section.items.findIndex((item) => item.id === id);
			if (index >= 0) return { key: group.key, zone: group.zone, section: section.name, index };
		}
	return null;
}

/** The task `id` among the open subtasks of `parent`, at any depth. */
function subtaskOf(parent: TaskItem, id: string): DropLanding | null {
	const index = parent.subtasks.findIndex((sub) => sub.id === id);
	if (index >= 0) return { kind: "subtask", id, item: parent.subtasks[index], parent: parent.id, index };
	for (const sub of parent.subtasks) {
		const deeper = subtaskOf(sub, id);
		if (deeper) return deeper;
	}
	return null;
}
