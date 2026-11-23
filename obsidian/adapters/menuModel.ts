import { editRepeat, type GroupedList, type LocalDate, type MenuProject, onTheDay, REPEAT_WORDS, type RepeatChange, type RepeatDraft, repeatDraft, type RepeatRule, type TaskItem, type TaskMenuActionId, type TaskMenuModel as CoreMenuModel } from "../../core/application/contracts";
import type { ListPlaceId, ProjectPage, RepeatPage, TaskMenuModel } from "../ui/engine/port";

/** The Repeat page over the core's draft, worded as the core words it. */
function repeatPageOf(draft: RepeatDraft): RepeatPage {
	return { draft, monthDay: draft.detail === "monthDay" ? onTheDay(draft.rule) : "", words: REPEAT_WORDS };
}

/** The Repeat page as it opens: `rule`, a new one drawn from `day` (the core's `repeatDraft`). */
export function repeatPageFor(day: LocalDate, rule: RepeatRule | null): RepeatPage {
	return repeatPageOf(repeatDraft(day, rule));
}

/** The page after a tap (the core's `editRepeat`); null when the tap changes nothing. */
export function repeatPageEdited(page: RepeatPage, change: RepeatChange): RepeatPage | null {
	const next = editRepeat(page.draft, change);
	return next && repeatPageOf(next);
}

/** A Project page in the engine's words, from the core's `MenuProject` as it is. */
export function projectPageOf(page: MenuProject): ProjectPage {
	return { options: page.options.map((option) => ({ name: option.project.name, depth: option.depth, on: option.checked, disabled: option.disabled })), none: page.none, noneLabel: page.noneLabel, newLabel: page.newLabel };
}

/** The words of Pick a date's list tiles: the lists' own names as the core's settings give them. */
export type ListNames = (list: GroupedList) => string;

/**
 * A task's menu in the engine's words, from the core's `TaskMenuModel` as it is: the layout the table of task actions
 * gives, the tiles and pages with what is on, the title the status tiles write. `subtasks`: a calendar task's open ones.
 */
export function menuModelOf(item: TaskItem, model: CoreMenuModel<TaskMenuActionId>, subtasks: readonly string[], names: ListNames, today: LocalDate): TaskMenuModel {
	return {
		kind: "task",
		title: item.title,
		statusTitle: model.statusTasks[0]?.title ?? item.title,
		layout: model.layout,
		levels: model.levels.tiles.map((tile) => ({ prefix: tile.level.prefix, color: tile.level.color, on: tile.on })),
		labels: model.labels.tiles.map((tile) => ({ name: tile.label.name, color: tile.label.color, on: tile.on })),
		date: { today, picked: model.dueDate, removable: model.removeDue },
		places: model.places.flatMap((choice) => (choice.kind === "date" ? [] : [{ id: choice.kind as ListPlaceId, title: names(choice.kind), on: choice.on }])),
		reminders: model.reminders.map((row) => ({ kind: row.kind, checked: row.checked })),
		sections: model.sections && { options: model.sections.options.map((option) => ({ name: option.name, label: option.name ?? model.sections!.choice.ungrouped, checked: option.checked })), create: model.sections.create },
		repeat: repeatPageFor(model.repeatOf.repeatDay, model.repeatOf.repeat),
		project: projectPageOf(model.project),
		peek: model.peek?.description ?? null,
		peekTask: model.peek?.id ?? null,
		subtasks,
	};
}
