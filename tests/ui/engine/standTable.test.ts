import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SectionOffer, TaskItem } from "../../../core/application/contracts";
import { taskMenu } from "../../../core/application/menus";
import { FIELD_GROUPS, type FieldContext, fieldActions, placementOf, TASK_ACTION_IDS, TASK_MENU_GROUPS, type TaskMenuActionId, type FieldActionId } from "../../../core/application/taskActions";
import { addDays } from "../../../core/domain/LocalDate";
import { type FieldFacts, fieldBar, type FieldTable, type MenuAnswer, type MenuFacts, menuLayout, menuPlaces, type MenuTable, type TableRow } from "../../../obsidian/stand/actionTable";
import { onDay } from "../../fakes/itemOnDay";

/**
 * The stand's copy of the core's table of task actions (task actions spec, «What the engine and MockPort change»): the
 * stand may not import the core, so its answers are generated here into `obsidian/stand/actionTable.generated.ts`. The
 * test fails when the file drifts from the core; `UPDATE_STAND_TABLE=1` writes it again.
 */
const FILE = join(__dirname, "../../../obsidian/stand/actionTable.generated.ts");
const TODAY = "2026-11-18";
/** The stand's settings: the levels p1 and p2, no labels. */
const LEVELS = [
	{ prefix: "p1", color: "red" },
	{ prefix: "p2", color: "orange" },
] as const;

const MENU_VALUES: { readonly [K in keyof MenuFacts]: readonly MenuFacts[K][] } = {
	from: ["inbox", "soon", "day", "timeline", "stack"],
	subtask: [false, true],
	postpone: [false, true],
	day: ["today", "tomorrow", "other"],
	inProgress: [false, true],
	stop: [false, true],
	remind: [false, true],
	addDescription: [false, true],
	firstStep: [false, true],
	repeatable: [false, true],
	sections: [false, true],
};

const FIELD_VALUES: { readonly [K in keyof FieldFacts]: readonly FieldFacts[K][] } = {
	task: [false, true],
	renaming: ["none", "repeatable", "fixed"],
	topLevel: [false, true],
	place: [false, true],
	indents: [false, true],
	canIndent: [false, true],
	canOutdent: [false, true],
	maySection: [false, true],
};

function every<F>(values: { readonly [K in keyof F]: readonly F[K][] }): F[] {
	return (Object.keys(values) as (keyof F)[]).reduce<Partial<F>[]>((combos, name) => combos.flatMap((combo) => values[name].map((value) => ({ ...combo, [name]: value }))), [{}]) as F[];
}

const DAYS = { today: TODAY, tomorrow: addDays(TODAY, 1), other: addDays(TODAY, 5) } as const;

function itemOf(facts: MenuFacts): TaskItem {
	const base = onDay({ key: { section: "now", index: 0, path: facts.subtask ? [0] : [], raw: "- [ ] T" }, text: "T", status: facts.inProgress ? "inProgress" : "todo", dueDate: null, slot: null, reminder: "notification", repeat: null, open: true, repeatable: facts.repeatable, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null, list: "now", isSubtask: facts.subtask }, TODAY);
	return { ...base, day: DAYS[facts.day], can: { ...base.can, postpone: facts.postpone, stop: facts.stop, remind: facts.remind, addDescription: facts.addDescription, firstStep: facts.firstStep, setProject: !facts.subtask, setPriority: true, setLabels: true } };
}

const OFFER: SectionOffer = { lists: { now: ["Work"], soon: [], inbox: [], backlog: [] }, ungrouped: "No section" };

const menus = new Map<string, ReturnType<typeof taskMenu>>();
function coreMenu(facts: MenuFacts) {
	const key = JSON.stringify(facts);
	const known = menus.get(key);
	if (known) return known;
	const model = taskMenu([itemOf(facts)], TODAY, LEVELS, [], facts.sections ? OFFER : null, { kind: "task", from: facts.from }, [], [], [{ kind: "now" }]);
	menus.set(key, model);
	return model;
}

function menuAnswer(facts: MenuFacts, id: TaskMenuActionId): MenuAnswer {
	const action = coreMenu(facts).layout.flatMap((group) => group.actions).find((a) => a.id === id);
	if (!action) return { offer: "hidden", asks: false, status: null, day: null };
	const day = action.date === null ? null : [0, 1].find((n) => addDays(TODAY, n) === action.date) ?? null;
	return { offer: action.disabled ? "disabled" : "shown", asks: action.asks, status: action.status, day };
}

const MENU_COMBOS = every(MENU_VALUES);
const FIELD_COMBOS = every(FIELD_VALUES);
const RENAMED = { repeatable: itemOf({ ...MENU_COMBOS[0], repeatable: true }), fixed: itemOf({ ...MENU_COMBOS[0], repeatable: false }) };

function fieldContext(facts: FieldFacts): FieldContext {
	const renaming = facts.renaming === "none" ? null : RENAMED[facts.renaming];
	return { task: facts.task, renaming, topLevel: facts.topLevel, place: facts.place, levels: LEVELS.length, labels: 0, indents: facts.indents, canIndent: facts.canIndent, canOutdent: facts.canOutdent, maySection: facts.maySection };
}

const fieldOffer = (facts: FieldFacts, id: FieldActionId) => {
	const action = fieldActions(fieldContext(facts)).flatMap((group) => group.actions).find((a) => a.id === id);
	return action ? (action.disabled ? "disabled" : "shown") : "hidden";
};

/** The facts an answer depends on (flipping one changes it somewhere), and the answer for each of their values; it fails if the answer is not a function of them. `combos` is `every(values)`, in its order. */
function rowOf<F, A>(combos: readonly F[], values: { readonly [K in keyof F]: readonly F[K][] }, answer: (facts: F) => A): { facts: (keyof F)[]; answers: Record<string, A> } {
	const names = Object.keys(values) as (keyof F)[];
	const said = combos.map((facts) => JSON.stringify(answer(facts)));
	const strides = names.map((_, n) => names.slice(n + 1).reduce((product, later) => product * values[later].length, 1));
	const facts = names.filter((name, n) => {
		const size = values[name].length;
		return said.some((value, i) => {
			const at = Math.floor(i / strides[n]) % size;
			return values[name].some((_, v) => said[i + (v - at) * strides[n]] !== value);
		});
	});
	const answers: Record<string, A> = {};
	combos.forEach((combo, i) => {
		const key = facts.map((name) => String(combo[name])).join(",");
		if (key in answers && JSON.stringify(answers[key]) !== said[i]) throw new Error(`the answer is not a function of ${String(facts)}`);
		answers[key] = JSON.parse(said[i]) as A;
	});
	return { facts, answers };
}

function generated(): { menu: MenuTable; field: FieldTable } {
	const menuCombos = MENU_COMBOS;
	const fieldCombos = FIELD_COMBOS;
	const menuRows = TASK_ACTION_IDS.flatMap((id): TableRow<TaskMenuActionId, (typeof TASK_MENU_GROUPS)[number], keyof MenuFacts, MenuAnswer>[] => {
		const cell = placementOf(id, "taskMenu");
		if ("absent" in cell) return [];
		return [{ id: id as TaskMenuActionId, group: cell.group, order: cell.order, ...rowOf(menuCombos, MENU_VALUES, (facts) => menuAnswer(facts, id as TaskMenuActionId)) }];
	});
	const fieldRows = TASK_ACTION_IDS.flatMap((id): TableRow<FieldActionId, (typeof FIELD_GROUPS)[number], keyof FieldFacts, "shown" | "disabled" | "hidden">[] => {
		const cell = placementOf(id, "field");
		if ("absent" in cell) return [];
		return [{ id: id as FieldActionId, group: cell.group, order: cell.order, ...rowOf(fieldCombos, FIELD_VALUES, (facts) => fieldOffer(facts, id as FieldActionId)) }];
	});
	const kept = TASK_MENU_GROUPS.filter((group) => menuCombos.some((facts) => coreMenu(facts).layout.some((g) => g.group === group && g.actions.length === 0)));
	const placeIds = coreMenu({ ...menuCombos[0], postpone: true }).places.map((place) => place.kind as "inbox" | "backlog" | "soon" | "now");
	return {
		menu: { groups: TASK_MENU_GROUPS, kept, rows: menuRows, places: { ids: placeIds, ...rowOf(menuCombos, MENU_VALUES, (facts) => coreMenu(facts).places.length > 0) } },
		field: { groups: FIELD_GROUPS, kept: [], rows: fieldRows },
	};
}

function fileOf(table: { menu: MenuTable; field: FieldTable }): string {
	return [
		"// Generated from the core's table of task actions (core/application/taskActions.ts) by tests/ui/engine/standTable.test.ts.",
		"// After the table changes: UPDATE_STAND_TABLE=1 npx vitest run tests/ui/engine/standTable.test.ts",
		'import type { FieldTable, MenuTable } from "./actionTable";',
		"",
		`export const MENU_TABLE: MenuTable = ${JSON.stringify(table.menu)};`,
		"",
		`export const FIELD_TABLE: FieldTable = ${JSON.stringify(table.field)};`,
		"",
	].join("\n");
}

/** Every task the stand can describe is 15 360 menus laid out twice: far past vitest's 5 s on a busy machine. */
const EVERY_TASK_MS = 30_000;

describe("the stand's copy of the table of task actions", () => {
	const table = generated();

	it("is the core's table as it stands now", () => {
		const text = fileOf(table);
		if (process.env.UPDATE_STAND_TABLE) writeFileSync(FILE, text);
		expect(readFileSync(FILE, "utf8"), "the stand's table drifted from the core's: UPDATE_STAND_TABLE=1 npx vitest run tests/ui/engine/standTable.test.ts").toBe(text);
	});

	it("lays out one task's menu as the core does, for every task the stand can describe", { timeout: EVERY_TASK_MS }, () => {
		const dayOf = (n: number) => addDays(TODAY, n);
		for (const facts of MENU_COMBOS) {
			const core = coreMenu(facts);
			expect(menuLayout(facts, dayOf), JSON.stringify(facts)).toEqual(core.layout);
			expect(menuPlaces(facts), JSON.stringify(facts)).toEqual(core.places.map((place) => place.kind));
		}
	});

	it("lays out the field's bar as the core does, for every field the stand can describe", () => {
		const unlit = Object.fromEntries(TASK_ACTION_IDS.map((id) => [id, false])) as Record<FieldActionId, boolean>;
		for (const facts of FIELD_COMBOS) {
			const core = fieldActions(fieldContext(facts)).map(({ group, actions }) => ({ group, actions: actions.map(({ id, disabled }) => ({ id, disabled, lit: false })) }));
			expect(fieldBar(facts, unlit), JSON.stringify(facts)).toEqual(core);
		}
	});
});
