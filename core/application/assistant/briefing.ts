import { labelTitle } from "../../domain/Label";
import { minutesToHHMM } from "../../domain/LocalDate";
import type { SectionKey } from "../../domain/Task";
import type { TaskItem } from "../contracts";

/** What a question tells the model of the tasks, and which task each ref names (`TaskItem.id`). Plain data. */
export interface Briefing {
	/** JSON: today and the tasks, each by its ref. */
	readonly input: string;
	/** Ref → `TaskItem.id`. */
	readonly refs: Readonly<Record<string, string>>;
}

/** A task as the model reads it: words, not codes. */
export interface BriefedTask {
	readonly ref: string;
	readonly title: string;
	readonly list: "today" | "soon" | "inbox" | "backlog" | "done";
	readonly inProgress: boolean;
	/** Its priority's prefix. */
	readonly priority: string | null;
	/** Its due date, ISO. */
	readonly due: string | null;
	/** The time it is put on: HH:MM today, else ISO, `2026-11-20T10:00`. */
	readonly time: string | null;
	readonly projects: readonly string[];
	readonly labels: readonly string[];
	/** The ref of the task it is a step of. */
	readonly parent: string | null;
}

const LIST_WORDS: Readonly<Record<SectionKey, BriefedTask["list"]>> = { now: "today", soon: "soon", inbox: "inbox", backlog: "backlog", done: "done" };

/** The briefing of `tasks` (each with its open subtasks below it) on `today`: refs t1, t2… in the order sent, a subtask right after its task. */
export function briefingOf(today: string, tasks: readonly TaskItem[]): Briefing {
	const briefed: BriefedTask[] = [];
	const refs: Record<string, string> = {};
	const seen = new Set<string>();
	const add = (item: TaskItem, parent: string | null): void => {
		if (!item.open || seen.has(item.id)) return;
		seen.add(item.id);
		const ref = `t${briefed.length + 1}`;
		refs[ref] = item.id;
		briefed.push(briefedTask(item, ref, parent, today));
		for (const sub of item.subtasks) add(sub, ref);
	};
	for (const item of tasks) add(item, null);
	return { input: JSON.stringify({ today, tasks: briefed }), refs };
}

/** No task to send. */
export function isEmptyBriefing(briefing: Briefing): boolean {
	return Object.keys(briefing.refs).length === 0;
}

function briefedTask(item: TaskItem, ref: string, parent: string | null, today: string): BriefedTask {
	return {
		ref,
		title: item.title,
		list: LIST_WORDS[item.list],
		inProgress: item.status === "inProgress",
		priority: item.priority?.prefix ?? null,
		due: item.dueDate,
		time: item.slot ? `${item.slot.date === today ? "" : `${item.slot.date}T`}${minutesToHHMM(item.slot.start)}` : null,
		projects: item.projects.map((project) => project.name),
		labels: item.labels.map((label) => labelTitle(label.name)),
		parent,
	};
}
