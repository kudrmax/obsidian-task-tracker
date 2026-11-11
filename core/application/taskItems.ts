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
import { nextStep } from "../domain/NextStep";
import { markColors } from "./marks";
import type { ProjectRef, SubtaskProgress, TaskBlock, TaskCard, TaskItem } from "./contracts";
import { keyOf } from "./taskKeys";

/** Of the task's own subtasks, the done ones out of all but those given up. */
function progressOf(entry: TaskEntry): SubtaskProgress | null {
	if (entry.subtasks.length === 0) return null;
	const counted = entry.subtasks.filter((s) => s.task.status !== "cancelled");
	return { done: counted.filter((s) => s.task.status === "done").length, total: counted.length };
}


/** How the items read the settings: the level of a prefix, the labels of names in the settings' order. */
export interface ItemLevels {
	levelOf(prefix: string): PriorityLevel | null;
	labelsOf(names: readonly string[]): readonly LabelLevel[];
	/** A task's projects as the screen shows them, by their names. */
	projectsOf(names: readonly string[]): readonly ProjectRef[];
}

const NO_LEVELS: ItemLevels = { levelOf: () => null, labelsOf: () => [], projectsOf: () => [] };

/** The levels and labels in the settings' order, a level only by a usable prefix, a label by a usable name. */
export function itemLevels(levels: readonly PriorityLevel[], labels: readonly LabelLevel[], projectOf: (name: string) => ProjectRef = (name) => ({ name, link: name, path: [name], note: null, canOpenNote: false, mark: true })): ItemLevels {
	return {
		levelOf: (prefix) => levels.find((l) => l.prefix === prefix) ?? null,
		labelsOf: (names) => labels.filter((l) => names.includes(l.name)),
		projectsOf: (names) => names.map(projectOf),
	};
}

/** The item of the task with this id among `items` and their subtasks, at every depth. */
function itemWithId(items: readonly TaskItem[], id: string): TaskItem | null {
	for (const item of items) {
		if (item.id === id) return item;
		const inner = itemWithId(item.allSubtasks, id);
		if (inner) return inner;
	}
	return null;
}

/** A card of one line: the task's own title. */
export function ownCard(item: Pick<TaskItem, "text" | "title">): TaskCard {
	return { text: item.text, title: item.title, over: null, step: null, semibold: false };
}

/** The card of a task: a folded task's next step under its own title, small; any other task's own title. */
function cardOf(item: Pick<TaskItem, "text" | "title">, step: TaskItem | null): TaskCard {
	return step ? { text: step.text, title: step.title, over: item.title, step, semibold: false } : ownCard(item);
}

/** The timeline's block of a task: a folded task's next step, else its own title. */
function blockOf(item: Pick<TaskItem, "text" | "title">, step: TaskItem | null): TaskBlock {
	return step ? { text: step.text, title: step.title, step } : { text: item.text, title: item.title, step: null };
}

/** The step a folded task shows, by its id, and the task it is drawn on. */
interface DrawnStep {
	readonly id: string;
	readonly on: TaskEntry;
}

/** The task as the UI sees it on `today`; `parent`, the task a subtask sits under; `boundary`, where the day begins; `drawn`, the step of a folded task above it. */
export function toItem(entry: TaskEntry, today: LocalDate, levels: ItemLevels = NO_LEVELS, parent: TaskEntry | null = null, boundary: DayBoundary = DayBoundary.MIDNIGHT, drawn: DrawnStep | null = null): TaskItem {
	const marks = marksOfTask(entry.task);
	const choices = markChoices(marks);
	const priority = marks.priority === null ? null : levels.levelOf(marks.priority);
	const labels = levels.labelsOf(marks.labels);
	const open = isOpen(entry.task.status);
	const collapsed = entry.task.collapsed && hasOpenSubtask(entry);
	const shown = collapsed && open ? nextStep(entry) : null;
	const drawnBelow = shown ? { id: shown.id, on: entry } : drawn;
	const allSubtasks = entry.subtasks.map((sub) => toItem(sub, today, levels, entry, boundary, drawnBelow));
	const description = descriptionMarkdown(entry);
	const step = shown && itemWithId(allSubtasks, shown.id);
	const own = { text: entry.task.text, title: plainText(entry.task.text) };
	const projects = levels.projectsOf(entry.projects);
	return {
		id: entry.id,
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
		project: projects[0] ?? null,
		projects,
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
			setProject: entry.path.length === 0,
			result: false,
		},
		isResult: false,
		resultOf: null,
		card: cardOf(own, step),
		block: blockOf(own, step),
		drawnOn: drawn?.id === entry.id ? { key: keyOf(drawn.on), slot: drawn.on.task.slot } : null,
		subtasks: allSubtasks.filter((sub) => sub.open),
		allSubtasks,
		progress: progressOf(entry),
		collapsed,
		description,
		parentText: parent?.task.text ?? null,
		parentKey: parent ? keyOf(parent) : null,
	};
}
