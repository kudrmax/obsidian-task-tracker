import type { EntryBarGroup, FieldActionId, FieldGroup, MenuActionGroup, MenuStatusId, TaskMenuActionId, TaskMenuGroup } from "../ui/engine/port";
import { FIELD_TABLE, MENU_TABLE } from "./actionTable.generated";

/**
 * The core's table of task actions as the stand reads it (task actions spec, «What the engine and MockPort change»): the
 * stand may not import the core, so `actionTable.generated.ts` holds the table's answers, generated from the core by
 * `tests/ui/engine/standTable.test.ts`, which fails once they drift. The stand says what it knows of a task in the core's
 * words (`MenuFacts`, `FieldFacts`); the answers say what is offered. No rule of the menus is written here.
 */

/** What the core's menu reads of one task, as the stand knows it: where its card stands, what its `can` says, its day. */
export interface MenuFacts {
	/** The core's `MenuFrom`: a list column's card, the calendar's block, a card of a block's stack. */
	readonly from: "inbox" | "soon" | "day" | "timeline" | "stack";
	readonly subtask: boolean;
	readonly postpone: boolean;
	/** The day it stands on: today, tomorrow, or another (none too). */
	readonly day: "today" | "tomorrow" | "other";
	readonly inProgress: boolean;
	readonly stop: boolean;
	readonly remind: boolean;
	readonly addDescription: boolean;
	readonly firstStep: boolean;
	readonly repeatable: boolean;
	/** Its column shows its list's sections. */
	readonly sections: boolean;
}

/** What the core's field reads, as the stand knows it (the core's `FieldContext`). */
export interface FieldFacts {
	readonly task: boolean;
	/** A new task, or a rename of a task that may repeat or may not. */
	readonly renaming: "none" | "repeatable" | "fixed";
	readonly topLevel: boolean;
	readonly place: boolean;
	readonly indents: boolean;
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	readonly maySection: boolean;
}

export type Offer = "shown" | "disabled" | "hidden";

/** An action's answer in one task's menu: whether it is offered, whether it asks first, the status it writes, the day it writes (days from today). */
export interface MenuAnswer {
	readonly offer: Offer;
	readonly asks: boolean;
	readonly status: MenuStatusId | null;
	readonly day: number | null;
}

/** One action of a surface: its group and order there, the facts its answer depends on, and the answer for each of their values. */
export interface TableRow<Id, Group, Fact, Answer> {
	readonly id: Id;
	readonly group: Group;
	readonly order: number;
	readonly facts: readonly Fact[];
	/** By the facts' values, joined with commas. */
	readonly answers: Readonly<Record<string, Answer>>;
}

export interface SurfaceTable<Id, Group, Fact, Answer> {
	readonly groups: readonly Group[];
	/** Groups drawn even when they offer nothing: one task's menu's copy. */
	readonly kept: readonly Group[];
	readonly rows: readonly TableRow<Id, Group, Fact, Answer>[];
}

export interface MenuTable extends SurfaceTable<TaskMenuActionId, TaskMenuGroup, keyof MenuFacts, MenuAnswer> {
	/** Pick a date's list tiles in their order, and the facts and answers of whether the page offers them. */
	readonly places: { readonly ids: readonly ("inbox" | "backlog" | "soon" | "now")[]; readonly facts: readonly (keyof MenuFacts)[]; readonly answers: Readonly<Record<string, boolean>> };
}

export type FieldTable = SurfaceTable<FieldActionId, FieldGroup, keyof FieldFacts, Offer>;

const keyOf = <F>(facts: F, names: readonly (keyof F)[]): string => names.map((name) => String(facts[name])).join(",");

function answerOf<F, A>(row: { readonly facts: readonly (keyof F)[]; readonly answers: Readonly<Record<string, A>> }, facts: F): A {
	const answer = row.answers[keyOf(facts, row.facts)];
	if (answer === undefined) throw new Error(`the stand's table has no answer for ${keyOf(facts, row.facts)}`);
	return answer;
}

/** The surface's groups in their order, each with its offered actions in theirs; an empty group left out unless kept. */
function arrange<Id, Group, Fact, Answer, Out>(table: SurfaceTable<Id, Group, Fact, Answer>, answer: (row: TableRow<Id, Group, Fact, Answer>) => Out | null): readonly { readonly group: Group; readonly actions: readonly Out[] }[] {
	return table.groups.flatMap((group) => {
		const actions = table.rows
			.filter((row) => row.group === group)
			.sort((a, b) => a.order - b.order)
			.flatMap((row) => {
				const out = answer(row);
				return out === null ? [] : [out];
			});
		return actions.length > 0 || table.kept.includes(group) ? [{ group, actions }] : [];
	});
}

/** One task's menu as the core lays it out (`TaskMenuModel.layout`); `dayOf` writes a day `n` days from today as `YYYY-MM-DD`. */
export function menuLayout(facts: MenuFacts, dayOf: (n: number) => string): readonly MenuActionGroup<TaskMenuActionId>[] {
	return arrange(MENU_TABLE, (row) => {
		const { offer, asks, status, day } = answerOf<MenuFacts, MenuAnswer>(row, facts);
		return offer === "hidden" ? null : { id: row.id, disabled: offer === "disabled", asks, status, date: day === null ? null : dayOf(day) };
	});
}

/** Pick a date's list tiles, in their order; none where the core offers none (a subtask). */
export function menuPlaces(facts: MenuFacts): readonly ("inbox" | "backlog" | "soon" | "now")[] {
	return answerOf<MenuFacts, boolean>(MENU_TABLE.places, facts) ? MENU_TABLE.places.ids : [];
}

/** The field's bar as the core lays it out (`EntryState.bar`), each button lit as `lit` says. */
export function fieldBar(facts: FieldFacts, lit: Readonly<Record<FieldActionId, boolean>>): readonly EntryBarGroup[] {
	return arrange(FIELD_TABLE, (row) => {
		const offer = answerOf<FieldFacts, Offer>(row, facts);
		return offer === "hidden" ? null : { id: row.id, disabled: offer === "disabled", lit: lit[row.id] };
	});
}
