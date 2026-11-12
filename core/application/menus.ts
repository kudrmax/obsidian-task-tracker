import { repeatRow } from "./repeatWords";
import { addDays } from "../domain/LocalDate";
import type { LabelLevel } from "../domain/Label";
import type { PriorityLevel } from "../domain/Priority";
import { type LocalDate, nextProgress, REMINDER_KINDS, type TaskStatus } from "../domain/Task";
import { projectKey } from "../domain/Project";
import { NO_PROJECT } from "./projects";
import type { ColumnSections, DropColumn, MenuEditId, MenuGroupId, MenuFrom, MenuProject, ProjectRef, MenuScreen, MenuSections, MenuStatus, MenuStatusId, QuickMove, QuickMoveId, TaskItem, TaskKey, TaskMenuModel } from "./contracts";
import { type SectionOffer, sectionChoice } from "./sections";
import { isUnder, keyId } from "./taskKeys";

/** The tasks a priority may be set on: those without labels. */
function priorityHolders(items: readonly TaskItem[]): readonly TaskItem[] {
	return items.filter((item) => item.can.setPriority);
}

/** The tasks labels may be put on: those without a priority. */
function labelHolders(items: readonly TaskItem[]): readonly TaskItem[] {
	return items.filter((item) => item.can.setLabels);
}

/** The level is on: every task that may have a priority has this one. */
export function levelOn(items: readonly TaskItem[], prefix: string): boolean {
	const holders = priorityHolders(items);
	return holders.length > 0 && holders.every((item) => item.priority?.prefix === prefix);
}

/** A tap on a level: off for them all when it is on, else it goes on them all. */
export function toggledPriority(items: readonly TaskItem[], prefix: string): string | null {
	return levelOn(items, prefix) ? null : prefix;
}

/** The label is on: every task that may carry labels has it. */
export function labelOn(items: readonly TaskItem[], name: string): boolean {
	const holders = labelHolders(items);
	return holders.length > 0 && holders.every((item) => item.labels.some((label) => label.name === name));
}

/** A tap on a label: each task's labels after it, in the order given. On, it goes off them all; else it goes last on each that lacks it. A task that may carry none keeps its own. */
export function toggledLabels(items: readonly TaskItem[], name: string): readonly (readonly string[])[] {
	const on = labelOn(items, name);
	return items.map((item) => {
		const names = item.labels.map((label) => label.name);
		if (!item.can.setLabels) return names;
		if (on) return names.filter((n) => n !== name);
		return names.includes(name) ? names : [...names, name];
	});
}

const MOVE_ORDER: readonly QuickMoveId[] = ["today", "tomorrow", "pick"];

/** Today, Tomorrow and Pick a date, without the day the task stands on already; a task that may not be put off has none. */
export function quickMoves(item: TaskItem, today: LocalDate): readonly QuickMove[] {
	if (!item.can.postpone) return [];
	const moves: readonly QuickMove[] = [
		{ id: "today", date: today },
		{ id: "tomorrow", date: addDays(today, 1) },
		{ id: "pick", date: null },
	];
	return moves.filter((move) => move.date === null || move.date !== item.day);
}

/** The moves any of the tasks has, in the order Today, Tomorrow, Pick a date. */
function sharedMoves(items: readonly TaskItem[], today: LocalDate): readonly QuickMove[] {
	const offered = items.flatMap((item) => quickMoves(item, today));
	return MOVE_ORDER.flatMap((id) => offered.find((move) => move.id === id) ?? []);
}

/** The due date every task has; none when they differ. */
function sharedDueDate(items: readonly TaskItem[]): LocalDate | null {
	const first = items[0]?.dueDate ?? null;
	return items.every((item) => item.dueDate === first) ? first : null;
}

/** Which menu: one task's, opened from `from`, or the bulk menu of the picked tasks. */
export type MenuOf = { readonly kind: "task"; readonly from: MenuFrom } | { readonly kind: "bulk" };

const A_LIST_CARD: MenuOf = { kind: "task", from: "day" };

const COLUMNS: ReadonlySet<MenuFrom> = new Set<DropColumn>(["day", "soon", "inbox", "backlog"]);

/** Whether Select tasks picks a card drawn there: a list column's; never the timeline's, Done's, a stack's or the whole screen's. */
export function canPick(from: MenuFrom): boolean {
	return COLUMNS.has(from);
}

/**
 * The sections a menu offers, opened from cards at `froms`: the screen's offer when every card stands in a list column
 * that shows its list's sections (`columnSections`); none from the timeline, Done, a stack or the whole screen.
 */
export function menuOffer(froms: readonly MenuFrom[], screen: MenuScreen, columnSections: (column: DropColumn, date: LocalDate) => ColumnSections | null): SectionOffer | null {
	const shown = froms.every((from) => COLUMNS.has(from) && columnSections(from as DropColumn, screen.day) !== null);
	return shown ? screen.offer : null;
}

/** What a status tile writes; null for Stop, which stops the task as `stop` does. */
export function tileStatus(id: MenuStatusId): TaskStatus | null {
	const statuses: Readonly<Record<MenuStatusId, TaskStatus | null>> = { done: "done", inProgress: "inProgress", stopProgress: "todo", wontDo: "cancelled", stop: null };
	return statuses[id];
}

/**
 * The task a status tile of a card's menu writes: a folded card's shown step (Max, 11-12: Done, In progress and Won't
 * do on a folded card are for the task he looks at), any other card's own task. The rest of the menu stays the folded
 * task's: a move or a label is for the whole group.
 */
function statusTask(item: TaskItem, from: MenuFrom): TaskItem {
	if (from === "timeline") return item.block.step ?? item;
	return COLUMNS.has(from) ? (item.card.step ?? item) : item;
}

/** The tasks the status tiles write: one task's menu from `of.from`, the bulk menu's each from its column (`froms`). */
function statusTasks(items: readonly TaskItem[], of: MenuOf, froms: readonly MenuFrom[]): readonly TaskItem[] {
	return items.map((item, i) => statusTask(item, of.kind === "task" ? of.from : (froms[i] ?? "full")));
}

/** Done, the progress tile named for what it sets, Won't do, and Stop for one task that may be stopped; one task's menu asks before Won't do and Stop. */
function menuStatuses(items: readonly TaskItem[], of: MenuOf): readonly MenuStatus[] {
	const one = of.kind === "task";
	const progress: MenuStatusId = nextProgress(items.map((item) => item.status)) === "todo" ? "stopProgress" : "inProgress";
	return [
		{ id: "done", confirm: false },
		{ id: progress, confirm: false },
		{ id: "wontDo", confirm: one },
		...(one && items.every((item) => item.can.stop) ? [{ id: "stop", confirm: true } as const] : []),
	];
}

function menuEdits(items: readonly TaskItem[], of: MenuOf, sections: MenuSections | null): readonly MenuEditId[] {
	const section: MenuEditId[] = sections ? ["section"] : [];
	if (of.kind === "bulk") return [...section, "project"];
	const item = items[0];
	const edits: [MenuEditId, boolean][] = [
		["rename", true],
		["reminder", item.can.remind],
		["description", item.can.addDescription],
		["repeat", item.repeatable],
		["section", sections !== null],
		["project", true],
		["subtask", of.from !== "stack"],
	];
	return edits.flatMap(([id, offered]) => (offered ? [id] : []));
}

function menuSections(items: readonly TaskItem[], offer: SectionOffer | null, of: MenuOf): MenuSections | null {
	const choice = offer ? sectionChoice(items, offer) : null;
	if (!choice) return null;
	const shared = items.every((item) => item.group === choice.current);
	const names = [...choice.names, null];
	return { choice, options: names.map((name) => ({ name, checked: shared && name === choice.current })), create: of.kind === "task" };
}

/** A project the Project page offers, with its indent in the tree. */
export interface ProjectChoice {
	readonly project: ProjectRef;
	readonly depth: number;
}

/** The Project page of these tasks: the tree's projects, each checked while every task has it. Only subtasks: disabled, showing their parent's. */
export function menuProject(items: readonly TaskItem[], known: readonly ProjectChoice[]): MenuProject {
	return projectPage(
		items.map((item) => item.projects),
		known,
		items.every((item) => !item.can.setProject),
	);
}

/** «New project…»: the Project page's last option. */
export const NEW_PROJECT = "New project…";

/**
 * A Project page for `chosen`, the projects of each of the tasks or fields it is for: the tree's projects in its order,
 * then a chosen one the tree lacks; each checked while all have it; No project checked while none has any.
 */
export function projectPage(chosen: readonly (readonly ProjectRef[])[], known: readonly ProjectChoice[], disabled = false): MenuProject {
	const key = (ref: ProjectRef) => projectKey(ref.name);
	const options = [...known];
	for (const refs of chosen) for (const ref of refs) if (!options.some((option) => key(option.project) === key(ref))) options.push({ project: { ...ref, mark: true }, depth: 0 });
	const all = (ref: ProjectRef) => chosen.length > 0 && chosen.every((refs) => refs.some((r) => key(r) === key(ref)));
	const first = chosen[0] ?? [];
	const same = chosen.every((refs) => refs.length === first.length && refs.every((ref, i) => key(ref) === key(first[i])));
	const none = chosen.every((refs) => refs.length === 0);
	const shared = first.find(all) ?? null;
	return {
		value: none ? NO_PROJECT : same ? (first.length === 1 ? first[0].name : `${first[0].name} +${first.length - 1}`) : "",
		current: shared,
		options: options.map(({ project, depth }) => {
			const checked = all(project);
			return { project, depth, checked, disabled: project.folder && !checked };
		}),
		none,
		noneLabel: NO_PROJECT,
		disabled,
		newLabel: NEW_PROJECT,
	};
}

/** The menu's groups top to bottom, the same in every frontend. */
export const MENU_GROUPS: readonly MenuGroupId[] = ["statuses", "levels", "labels", "moves", "edits", "opens", "remove"];

/** The menu of one task or of several picked at once: what each group offers, what is on, what can't be pressed, what asks first. */
export function taskMenu(items: readonly TaskItem[], today: LocalDate, levels: readonly PriorityLevel[], labels: readonly LabelLevel[], offer: SectionOffer | null, of: MenuOf = A_LIST_CARD, projects: readonly ProjectChoice[] = [], froms: readonly MenuFrom[] = []): TaskMenuModel {
	const sections = menuSections(items, offer, of);
	const edits = menuEdits(items, of, sections);
	const statusFor = statusTasks(items, of, froms);
	return {
		groups: MENU_GROUPS,
		statuses: menuStatuses(statusFor, of),
		statusTasks: statusFor,
		levels: { tiles: levels.map((level) => ({ level, on: levelOn(items, level.prefix) })), disabled: priorityHolders(items).length === 0 },
		labels: { tiles: labels.map((label) => ({ label, on: labelOn(items, label.name) })), disabled: labelHolders(items).length === 0 },
		moves: sharedMoves(items, today),
		removeDue: items.some((item) => item.can.removeDue),
		dueDate: sharedDueDate(items),
		sections,
		project: menuProject(items, projects),
		edits,
		reminders: edits.includes("reminder") ? REMINDER_KINDS.map((kind) => ({ kind, checked: kind === items[0].reminder })) : [],
		repeat: repeatRow(of.kind === "task" ? (items[0]?.repeat ?? null) : null),
		remove: { confirm: of.kind === "task" },
	};
}

/** The picked tasks a lifted one carries along: all but itself and those under another picked one, which go with it. */
export function carriedWith(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
	const id = keyId(lifted);
	return picked.filter((key) => keyId(key) !== id && !picked.some((other) => other !== key && isUnder(key, other)));
}
