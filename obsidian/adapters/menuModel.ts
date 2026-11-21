import type { GroupedList, LocalDate, MenuProject, TaskItem, TaskMenuActionId, TaskMenuModel as CoreMenuModel } from "../../core/application/contracts";
import type { ListPlaceId, ProjectPage, TaskMenuModel } from "../ui/engine/port";

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
		project: projectPageOf(model.project),
		peek: model.peek?.description ?? null,
		subtasks,
	};
}
