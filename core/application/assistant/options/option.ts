import type { TaskCalendarSettings } from "../../../settings";
import type { AssistantOptionChoice, TaskItem } from "../../contracts";
import type { AssistantTasks, ListedTasks } from "../tasks";

/** The task a `task` answer chose, as it stands when the answer comes, and the tasks around it. */
export interface ChosenTask {
	readonly task: TaskItem;
	readonly listed: ListedTasks;
}

/**
 * Something an action does besides its answer, set on the Assistant page under the action's prompt: one row of choices,
 * saved by the action's id and the option's key. An action declares its options; the machinery goes over them and never
 * names one, so the next action with an option adds an entry to its own list.
 */
export interface ActionOption {
	/** Its key in the settings, under the action's id. */
	readonly key: string;
	/** The row's label on the page. */
	readonly label: string;
	/** The row's choices now, in order; the one whose value is null (none) first. A saved value no choice has reads as none. */
	choices(settings: TaskCalendarSettings): readonly AssistantOptionChoice[];
	/** After a `task` answer, the value set (never none): does its part through `tasks`; the words drawn under the card, or null. */
	afterAnswer(value: string, chosen: ChosenTask, tasks: AssistantTasks): Promise<string | null>;
}

/** The option's value as saved, when one of its choices still has it; else none. */
export function optionValue(option: ActionOption, saved: string | undefined, settings: TaskCalendarSettings): string | null {
	if (saved === undefined) return null;
	return option.choices(settings).some((choice) => choice.value === saved) ? saved : null;
}
