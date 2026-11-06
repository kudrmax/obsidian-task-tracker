import { canPostpone, canRemoveDue, dayOfTask } from "../domain/Days";
import { descriptionMarkdown } from "../domain/description";
import type { LabelLevel } from "../domain/Label";
import type { PriorityLevel } from "../domain/Priority";
import { markChoices } from "../domain/Marks";
import { DayBoundary } from "../domain/DayBoundary";
import { dayOf, hasOpenSubtask, marksOfTask } from "../domain/operations";
import { repeatDay } from "../domain/RepeatDraft";
import { repeatable } from "../domain/queries";
import { canRemind, isOpen, type LocalDate } from "../domain/Task";
import type { TaskEntry } from "../domain/TaskDocument";
import { plainText } from "../domain/TaskText";
import { markColors } from "./marks";
import type { SubtaskProgress, TaskItem, TaskKey } from "./contracts";

/** Of the task's own subtasks, the done ones out of all but those given up. */
function progressOf(entry: TaskEntry): SubtaskProgress | null {
	if (entry.subtasks.length === 0) return null;
	const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
	return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
}

function keyOf(entry: TaskEntry): TaskKey {
	return { section: entry.section, index: entry.index, path: entry.path, raw: entry.raw };
}

/** How the items read the settings: the level of a prefix, the labels of names in the settings' order. */
export interface ItemLevels {
	levelOf(prefix: string): PriorityLevel | null;
	labelsOf(names: readonly string[]): readonly LabelLevel[];
}

const NO_LEVELS: ItemLevels = { levelOf: () => null, labelsOf: () => [] };

/** The levels and labels in the settings' order, a level only by a usable prefix, a label by a usable name. */
export function itemLevels(levels: readonly PriorityLevel[], labels: readonly LabelLevel[]): ItemLevels {
	return {
		levelOf: (prefix) => levels.find((l) => l.prefix === prefix) ?? null,
		labelsOf: (names) => labels.filter((l) => names.includes(l.name)),
	};
}

/** The task as the UI sees it on `today`; `parent`, the task a subtask sits under; `boundary`, where the day begins. */
export function toItem(entry: TaskEntry, today: LocalDate, levels: ItemLevels = NO_LEVELS, parent: TaskEntry | null = null, boundary: DayBoundary = DayBoundary.MIDNIGHT): TaskItem {
	const marks = marksOfTask(entry.task);
	const choices = markChoices(marks);
	const priority = marks.priority === null ? null : levels.levelOf(marks.priority);
	const labels = levels.labelsOf(marks.labels);
	const allSubtasks = entry.subtasks.map((sub) => toItem(sub, today, levels, entry, boundary));
	const description = descriptionMarkdown(entry);
	return {
		key: keyOf(entry),
		text: entry.task.text,
		title: plainText(entry.task.text),
		status: entry.task.status,
		dueDate: entry.task.dueDate,
		slot: entry.task.slot,
		durationMin: entry.task.slot && entry.task.slot.end !== null ? entry.task.slot.end - entry.task.slot.start : null,
		reminder: entry.task.reminder,
		repeat: entry.task.repeat?.rule ?? null,
		open: isOpen(entry.task.status),
		repeatable: repeatable(entry),
		priority,
		labels,
		colors: markColors(priority, labels),
		group: entry.group,
		list: entry.section,
		isSubtask: entry.path.length > 0,
		day: dayOfTask(entry.section, entry.task, today),
		repeatDay: repeatDay(dayOf(entry.task, boundary), today),
		can: {
			postpone: canPostpone(entry.section),
			removeDue: canRemoveDue(entry.task.dueDate, today),
			remind: canRemind(entry.task.slot),
			setPriority: choices.priority,
			setLabels: choices.labels,
			stop: entry.task.repeat !== null && repeatable(entry),
			addDescription: description === null,
			fold: hasOpenSubtask(entry),
			resize: entry.task.slot !== null,
		},
		subtasks: allSubtasks.filter((sub) => sub.open),
		allSubtasks,
		progress: progressOf(entry),
		collapsed: entry.task.collapsed && hasOpenSubtask(entry),
		description,
		parentText: parent?.task.text ?? null,
		parentKey: parent ? keyOf(parent) : null,
	};
}
