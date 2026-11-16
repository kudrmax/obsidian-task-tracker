import { labelTitle } from "../../domain/Label";
import { minutesToHHMM } from "../../domain/LocalDate";
import type { SectionKey } from "../../domain/Task";
import type { TaskItem } from "../contracts";

/** What a question tells the model of the tasks, and which task each ref names (`TaskItem.id`). Plain data. */
export interface Briefing {
	/** JSON: today and the candidates, each by its ref. */
	readonly input: string;
	/** Ref → `TaskItem.id`, the candidates only. */
	readonly refs: Readonly<Record<string, string>>;
}

/** Something Max can start now: a task, a folded task's next step, or an unfolded task's subtask. */
export interface Candidate {
	readonly item: TaskItem;
	/** The task at the top of its tree: its list is the candidate's. */
	readonly top: TaskItem;
	/** The tasks above it, the top one first. */
	readonly goals: readonly TaskItem[];
	/** For a folded task's next step: the open tasks of that folded branch after the step, file order, depth first. */
	readonly after: readonly TaskItem[];
}

/** A step after the candidate, as the model reads it: a task is always its title and its description. */
export interface BriefedStep {
	readonly title: string;
	/** Its nested lines without a checkbox, Markdown. */
	readonly description: string | null;
}

/** What a goal tells the model: what it is for, not something to choose. */
export interface BriefedGoal extends BriefedStep {
	/** Its priority's prefix. */
	readonly priority: string | null;
	/** Its due date, ISO. */
	readonly due: string | null;
	/** The time it is put on: HH:MM today, else ISO, `2026-11-20T10:00`. */
	readonly time: string | null;
	readonly projects: readonly string[];
	readonly labels: readonly string[];
}

/** A candidate as the model reads it: words, not codes. */
export interface BriefedCandidate extends BriefedGoal {
	readonly ref: string;
	/** Its top task's list. */
	readonly list: "today" | "soon" | "inbox" | "backlog" | "done";
	readonly inProgress: boolean;
	readonly goals: readonly BriefedGoal[];
	/** The steps after it in its folded branch. */
	readonly after: readonly BriefedStep[];
}

const LIST_WORDS: Readonly<Record<SectionKey, BriefedCandidate["list"]>> = { now: "today", soon: "soon", inbox: "inbox", backlog: "backlog", done: "done" };

/**
 * What Max can start now among `tasks` (open, each with its open subtasks), in file order: a task with no open subtask
 * itself; a folded task only its next step, the one its card shows; an unfolded task with open subtasks not itself but
 * each open subtask by these same rules. A task met twice is a candidate once.
 */
export function candidatesOf(tasks: readonly TaskItem[]): readonly Candidate[] {
	const found: Candidate[] = [];
	const seen = new Set<string>();
	const add = (candidate: Candidate): void => {
		if (seen.has(candidate.item.id)) return;
		seen.add(candidate.item.id);
		found.push(candidate);
	};
	const walk = (item: TaskItem, top: TaskItem, goals: readonly TaskItem[]): void => {
		if (!item.open) return;
		const step = item.collapsed ? item.card.step : null;
		if (step) add(stepOf(item, step, top, goals));
		else if (item.subtasks.length === 0) add({ item, top, goals, after: [] });
		else for (const sub of item.subtasks) walk(sub, top, [...goals, item]);
	};
	for (const item of tasks) walk(item, item, []);
	return found;
}

/** The next step of the folded `folded`: the tasks between them are its goals too, the open ones after it its `after`. */
function stepOf(folded: TaskItem, step: TaskItem, top: TaskItem, goals: readonly TaskItem[]): Candidate {
	const flat: { item: TaskItem; above: readonly TaskItem[] }[] = [];
	const flatten = (item: TaskItem, above: readonly TaskItem[]): void => {
		flat.push({ item, above });
		for (const sub of item.subtasks) flatten(sub, [...above, item]);
	};
	for (const sub of folded.subtasks) flatten(sub, [folded]);
	const at = flat.findIndex((entry) => entry.item.id === step.id);
	return { item: step, top, goals: [...goals, ...flat[at].above], after: flat.slice(at + 1).map((entry) => entry.item) };
}

/** The briefing of the candidates among `tasks` on `today`: refs t1, t2… in the order sent. */
export function briefingOf(today: string, tasks: readonly TaskItem[]): Briefing {
	const refs: Record<string, string> = {};
	const candidates = candidatesOf(tasks).map((candidate, index): BriefedCandidate => {
		const ref = `t${index + 1}`;
		refs[ref] = candidate.item.id;
		const { title, description, ...marks } = briefedGoal(candidate.item, today);
		return {
			ref,
			title,
			list: LIST_WORDS[candidate.top.list],
			inProgress: candidate.item.status === "inProgress",
			...marks,
			description,
			goals: candidate.goals.map((goal) => briefedGoal(goal, today)),
			after: candidate.after.map((item) => ({ title: item.title, description: item.description })),
		};
	});
	return { input: JSON.stringify({ today, candidates }), refs };
}

/** No task to send. */
export function isEmptyBriefing(briefing: Briefing): boolean {
	return Object.keys(briefing.refs).length === 0;
}

function briefedGoal(item: TaskItem, today: string): BriefedGoal {
	return {
		title: item.title,
		description: item.description,
		priority: item.priority?.prefix ?? null,
		due: item.dueDate,
		time: item.slot ? `${item.slot.date === today ? "" : `${item.slot.date}T`}${minutesToHHMM(item.slot.start)}` : null,
		projects: item.projects.map((project) => project.name),
		labels: item.labels.map((label) => labelTitle(label.name)),
	};
}

