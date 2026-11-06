import { addDays } from "../domain/LocalDate";
import type { LabelLevel } from "../domain/Label";
import type { PriorityLevel } from "../domain/Priority";
import { type LocalDate, nextProgress } from "../domain/Task";
import type { MenuSections, QuickMove, QuickMoveId, TaskItem, TaskKey, TaskMenuModel } from "./contracts";
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

function menuSections(items: readonly TaskItem[], offer: SectionOffer | null): MenuSections | null {
	const choice = offer ? sectionChoice(items, offer) : null;
	return choice && { choice, shared: items.every((item) => item.group === items[0].group) };
}

/** The menu of one task or of several picked at once: what each group offers, what is on, what can't be pressed. */
export function taskMenu(items: readonly TaskItem[], today: LocalDate, levels: readonly PriorityLevel[], labels: readonly LabelLevel[], offer: SectionOffer | null): TaskMenuModel {
	return {
		progress: nextProgress(items.map((item) => item.status)),
		levels: { tiles: levels.map((level) => ({ level, on: levelOn(items, level.prefix) })), disabled: priorityHolders(items).length === 0 },
		labels: { tiles: labels.map((label) => ({ label, on: labelOn(items, label.name) })), disabled: labelHolders(items).length === 0 },
		moves: sharedMoves(items, today),
		removeDue: items.some((item) => item.can.removeDue),
		dueDate: sharedDueDate(items),
		sections: menuSections(items, offer),
	};
}

/** The picked tasks a lifted one carries along: all but itself and those under another picked one, which go with it. */
export function carriedWith(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
	const id = keyId(lifted);
	return picked.filter((key) => keyId(key) !== id && !picked.some((other) => other !== key && isUnder(key, other)));
}
