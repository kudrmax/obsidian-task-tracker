import { type DropColumn, editRepeat, type GroupName, labelTitle, type MenuFrom, type MenuStatusId, onTheDay, type ReminderKind, REPEAT_WORDS, type RepeatChange, type RepeatDraft, type RepeatRule, type TaskItem, type TaskMenuModel } from "../../../../core/application/contracts";
import type { LocalDate } from "./answers";
import type { CardFace } from "./card";
import { MONTH_NAMES, monthGrid, type MonthCell } from "./monthGrid";

/** An icon of the design, by its name in the view's set (`view/icons.tsx`). */
export type IconName = string;

/** A page of the menu's panel: the menu itself, or one of the pages a row opens in its place. */
export type MenuPage = "menu" | "sections" | "projects" | "projectName" | "reminders" | "repeat" | "picker";

/** What the menu asks about: a status tile that asks first, or Delete. */
export type Asking = MenuStatusId | "delete";

/** Where the bulk menu stands: beside the clicked card's list, or over Select tasks' menu button. */
export type BulkAt = { readonly at: "beside"; readonly key: string } | { readonly at: "over" };

/** A box on the screen, px. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/**
 * Where the menu's parts stand, as `motion` measured them for the panel drawn at `seq` (P4: sizes from the browser enter
 * the model as a message): the copy of the card (grown to show its title, `stretched` on one line or `whole` wrapped), the
 * panel under or over it, its first `above` groups over it when it fits on neither side, the labels too long for their
 * tiles. Positions are the window's px.
 */
export interface MenuPlace {
	readonly seq: number;
	/** The copy of the card: null for the bulk menu, whose picked cards stand as they are. */
	readonly copy: { readonly box: Box; readonly stretched: boolean; readonly whole: boolean } | null;
	/** The bulk menu's copies of the picked cards, by key. */
	readonly copies: ReadonlyMap<string, Box>;
	/** How many of the panel's groups stand over the anchor. */
	readonly above: number;
	readonly panel: PanelPlace;
	/** The groups over the anchor, when the panel is split. */
	readonly upper: PanelPlace | null;
	/** The keys of labels too long for their box: they start at the left and fade out at the right. */
	readonly long: readonly string[];
}

export interface PanelPlace {
	readonly left: number;
	/** From the window's top (under the anchor), or null when it stands over it (`bottom`). */
	readonly top: number | null;
	readonly bottom: number | null;
	/** Taller than its room: it keeps to it and scrolls. */
	readonly maxHeight: number | null;
}

/** The repeat page's draft, and what it holds besides the task's own rule (written as the menu closes). */
export interface RepeatHeldPage {
	readonly draft: RepeatDraft;
	/** The rule changed to, or none for Remove repeat; null untouched (`repeatPage.end`). */
	readonly held: { readonly rule: RepeatRule | null } | null;
}

/**
 * A task's menu over the block (P6), or the bulk menu over the picked cards: pinned to its tasks by id (a task gone
 * closes it; its content follows the file in place), the page shown, what it asks, the month the date page shows, the
 * repeat page's draft, and where its parts stand.
 */
export interface TaskMenuLayer {
	readonly kind: "taskMenu";
	readonly closing: boolean;
	/** The card's row key (the task's id) the menu opened from; the bulk menu's: its first picked task's. */
	readonly id: string;
	/** The bulk menu: where it stands; null for one task's menu. */
	readonly bulk: BulkAt | null;
	readonly from: MenuFrom;
	readonly page: MenuPage;
	readonly asking: Asking | null;
	/** The first of the month the date page shows. */
	readonly month: LocalDate | null;
	readonly repeat: RepeatHeldPage | null;
	/** Bumped by every change of what the panel holds: `place` is measured again for it. */
	readonly seq: number;
	/** Keep this many groups over the anchor when the panel changes in place (a label, a question): it must not jump. */
	readonly keepAbove: number | null;
	readonly place: MenuPlace | null;
	/**
	 * What the menu drew as its close began, drawn while it fades (P6: a closing sheet pins what is under and in it): its
	 * panel and its cards, so a task its pick deleted or moved fades as it stood.
	 */
	readonly frozen: MenuDrawing | null;
}

/** What a menu draws: its panel, and the cards it lifts (the one card's face, or the picked cards'). */
export interface MenuDrawing {
	readonly panel: PanelModel;
	readonly cards: readonly { readonly key: string; readonly face: CardFace }[];
	/** The start of the task's description over its card's copy (the old `DescriptionPeek`): one task's menu, never while a name is typed in it. */
	readonly peek: string | null;
}

/** Where `motion` reports the menu's parts stand (`placed`), and the menu's own messages. */
export type MenuMsg =
	| { readonly kind: "opened"; readonly id: string }
	/** A mouse pressed again right after the click that opened the menu: a double click, which renames (the old `onClickedAgain`). */
	| { readonly kind: "clickedAgain"; readonly id: string }
	| { readonly kind: "openedBulk"; readonly at: BulkAt }
	| { readonly kind: "placed"; readonly place: MenuPlace }
	| { readonly kind: "status"; readonly id: MenuStatusId }
	| { readonly kind: "confirm" }
	| { readonly kind: "cancelAsk" }
	| { readonly kind: "level"; readonly prefix: string }
	| { readonly kind: "label"; readonly name: string }
	| { readonly kind: "move"; readonly date: LocalDate }
	| { readonly kind: "page"; readonly page: MenuPage }
	| { readonly kind: "edit"; readonly id: "rename" | "description" | "subtask" }
	| { readonly kind: "section"; readonly name: GroupName }
	| { readonly kind: "newSection" }
	| { readonly kind: "project"; readonly name: string | null }
	| { readonly kind: "newProject"; readonly name: string }
	| { readonly kind: "reminder"; readonly kind_: ReminderKind }
	| { readonly kind: "repeat"; readonly change: RepeatChange }
	| { readonly kind: "repeatRemove" }
	| { readonly kind: "month"; readonly by: 1 | -1 }
	| { readonly kind: "removeDue" }
	| { readonly kind: "full" }
	| { readonly kind: "openFile" }
	/** The task's line read (`tasks.lineOf`): the tasks file opens there. */
	| { readonly kind: "openTasksFile"; readonly line: number }
	| { readonly kind: "remove" }
	/** What the repeat page wrote as the menu closed (`repeatPage.end`): the rule to set, or nothing. */
	| { readonly kind: "repeatEnd"; readonly key: TaskItem["key"]; readonly end: { readonly rule: RepeatRule | null } | null };

// What the panel draws ------------------------------------------------------------------------------------------------

/** A press on the panel: the act the view marks (`data-n-act`) and the value it carries. */
export interface MenuAct {
	readonly act: string;
	readonly arg?: string;
}

export interface MenuTile extends MenuAct {
	readonly key: string;
	readonly label: string;
	readonly icon: IconName;
	/** A level's or a label's tile: its colour (`data-priority`). */
	readonly color: string | null;
	readonly on: boolean;
	readonly disabled: boolean;
	/** A level the tasks have: its badge's cross takes it off. */
	readonly badge: boolean;
}

export interface MenuRow extends MenuAct {
	readonly key: string;
	readonly label: string;
	readonly value: string | null;
	/** The week's letters, these days' on (a weekly schedule's Repeat row). */
	readonly days: readonly { readonly letter: string; readonly on: boolean }[] | null;
	readonly icon: IconName | null;
	/** One of a list to choose from: its label fades out, its check is the accent. */
	readonly choice: boolean;
	readonly quiet: boolean;
	/** Adds something: its plus is the accent. */
	readonly add: boolean;
	readonly danger: boolean;
	readonly disabled: boolean;
	/** A project at its depth in the tree (the Project page). */
	readonly depth: number | null;
}

/** A top-level part of the panel: the parts a split puts over the anchor are the first few of these. */
export type PanelPart =
	| { readonly kind: "title"; readonly key: string; readonly text: string }
	| { readonly kind: "tiles"; readonly key: string; readonly variant: "status" | "priority" | "labels" | "move"; readonly four: boolean; readonly rows: readonly (readonly MenuTile[])[] }
	| { readonly kind: "rows"; readonly key: string; readonly rows: readonly MenuRow[] }
	/** A row standing apart (Delete, New section, New project, Remove due date, Remove repeat). */
	| { readonly kind: "row"; readonly key: string; readonly row: MenuRow; readonly variant: "apart" | "pickerRemove" | "repeatRemove" }
	| { readonly kind: "back"; readonly key: string; readonly title: string; readonly act: string; readonly arg?: string }
	| { readonly kind: "ask"; readonly key: string; readonly verb: string; readonly title: string; readonly confirm: string; readonly icon: IconName; readonly danger: boolean }
	| { readonly kind: "picker"; readonly key: string; readonly title: string; readonly weekdays: readonly string[]; readonly cells: readonly MonthCell[] }
	| { readonly kind: "repeat"; readonly key: string; readonly draft: RepeatDraft; readonly detail: RepeatDetail }
	| { readonly kind: "name"; readonly key: string; readonly placeholder: string };

/** Under the repeat page's unit: the weekdays, or the month's day in words. */
export type RepeatDetail = { readonly kind: "weekdays"; readonly days: readonly { readonly short: string; readonly name: string; readonly on: boolean; readonly day: number }[] } | { readonly kind: "monthDay"; readonly words: string } | null;

/** What the panel is: its parts, and its own look (the date page, the repeat page). */
export interface PanelModel {
	readonly variant: "menu" | "picker" | "repeat";
	readonly parts: readonly PanelPart[];
}

// Words ----------------------------------------------------------------------------------------------------------------

const STATUS_LOOKS: ReadonlyMap<MenuStatusId, { readonly label: string; readonly icon: IconName }> = new Map<MenuStatusId, { readonly label: string; readonly icon: IconName }>([
	["done", { label: "Done", icon: "done" }],
	["inProgress", { label: "In progress", icon: "progress" }],
	["stopProgress", { label: "Stop progress", icon: "progress" }],
	["wontDo", { label: "Won’t do", icon: "wontdo" }],
	["stop", { label: "Stop", icon: "stop" }],
]);

const statusLook = (id: MenuStatusId) => STATUS_LOOKS.get(id) ?? { label: "", icon: "done" };

const REMINDER_NAMES: ReadonlyMap<ReminderKind, string> = new Map<ReminderKind, string>([
	["notification", "Notification"],
	["alarm", "Alarm"],
	["live", "Live Activity"],
	["none", "Off"],
]);

export const reminderName = (kind: ReminderKind): string => REMINDER_NAMES.get(kind) ?? "";

const MOVE_LOOKS: ReadonlyMap<string, { readonly label: string; readonly icon: IconName }> = new Map<string, { readonly label: string; readonly icon: IconName }>([
	["today", { label: "Today", icon: "now" }],
	["tomorrow", { label: "Tomorrow", icon: "tomorrow" }],
	["pick", { label: "Pick a date", icon: "calendar" }],
]);

/** "3 tasks". */
export function countLabel(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}

/** How a question looks: its verb, its button's icon, and whether it is the danger of Delete. */
export function askLooks(what: Asking): { readonly verb: string; readonly icon: IconName; readonly danger: boolean } {
	if (what === "delete") return { verb: "Delete", icon: "delete", danger: true };
	const { label, icon } = statusLook(what);
	return { verb: label, icon, danger: false };
}

const row = (spec: Partial<MenuRow> & Pick<MenuRow, "key" | "label" | "act">): MenuRow => ({ value: null, days: null, icon: null, choice: false, quiet: false, add: false, danger: false, disabled: false, depth: null, ...spec });

const KIND_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(REPEAT_WORDS.kinds));
const UNIT_LABELS: ReadonlyMap<string, string> = new Map(Object.entries(REPEAT_WORDS.units));

// The panel's parts, page by page --------------------------------------------------------------------------------------

/** What the menu is opened over: its tasks (one, or the picked ones), the model the core answered, today. */
export interface MenuInput {
	readonly tasks: readonly TaskItem[];
	readonly menu: TaskMenuModel;
	readonly today: LocalDate;
	/** One task's menu offers Open full screen (the block is never the whole screen). */
	readonly full: boolean;
}

function statusPart(layer: TaskMenuLayer, input: MenuInput): PanelPart {
	const asked = layer.asking;
	if (asked !== null && asked !== "delete") return askPart(layer, input, asked);
	const tiles = input.menu.statuses.map((status): MenuTile => {
		const look = statusLook(status.id);
		return { key: status.id, label: look.label, icon: look.icon, color: null, on: false, disabled: false, badge: false, act: "menu:status", arg: status.id };
	});
	return { kind: "tiles", key: "statuses", variant: "status", four: tiles.length > 3, rows: [tiles] };
}

function askPart(layer: TaskMenuLayer, input: MenuInput, what: Asking): PanelPart {
	const { verb, icon, danger } = askLooks(what);
	const named = what === "delete" ? input.tasks : input.menu.statusTasks;
	const title = layer.bulk ? countLabel(input.tasks.length) : (named.find(() => true) ?? input.tasks.find(() => true))?.title ?? "";
	return { kind: "ask", key: `ask:${what}`, verb, title, confirm: verb, icon, danger };
}

/** Tiles in rows of at most three, as even as they go: four make two and two, five three and two. */
export function tileRows<T>(tiles: readonly T[]): readonly (readonly T[])[] {
	if (tiles.length === 0) return [];
	const perRow = Math.ceil(tiles.length / Math.ceil(tiles.length / 3));
	const rows: T[][] = [];
	for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
	return rows;
}

function editRowsPart(layer: TaskMenuLayer, input: MenuInput): PanelPart {
	const { menu, tasks } = input;
	const task = tasks.find(() => true);
	const rows = menu.edits.flatMap((id): MenuRow[] => {
		switch (id) {
			case "rename":
				return [row({ key: id, label: "Rename", icon: "rename", act: "menu:edit", arg: id })];
			case "reminder":
				return task ? [row({ key: id, label: "Reminder", value: reminderName(task.reminder), icon: "reminder", act: "menu:page", arg: "reminders" })] : [];
			case "description":
				return [row({ key: id, label: "Add description", icon: "description", act: "menu:edit", arg: id })];
			case "repeat": {
				const days = menu.repeat.days;
				return [row({ key: id, label: "Repeat", value: menu.repeat.value === "" ? null : menu.repeat.value, days: days ? REPEAT_WORDS.weekdays.map((d, i) => ({ letter: d.letter, on: days.includes(i as never) })) : null, icon: "repeat", act: "menu:page", arg: "repeat" })];
			}
			case "section":
				return [row({ key: id, label: "Section", value: layer.bulk ? null : (menu.sections?.choice.current ?? null), icon: "section", act: "menu:page", arg: "sections" })];
			case "project":
				return [row({ key: id, label: "Project", value: menu.project.value === "" ? null : menu.project.value, icon: "project", disabled: menu.project.disabled, act: "menu:page", arg: "projects" })];
			case "subtask":
				return [row({ key: id, label: "Add subtask", icon: "subtask", act: "menu:edit", arg: id })];
		}
	});
	return { kind: "rows", key: "edits", rows };
}

function menuParts(layer: TaskMenuLayer, input: MenuInput): PanelPart[] {
	const { menu } = input;
	const parts: PanelPart[] = [];
	if (layer.bulk) parts.push({ kind: "title", key: "title", text: countLabel(input.tasks.length) });
	for (const group of menu.groups) {
		switch (group) {
			case "statuses":
				parts.push(statusPart(layer, input));
				break;
			case "levels": {
				const tiles = menu.levels.tiles.map(({ level, on }): MenuTile => ({ key: `level:${level.prefix}`, label: level.prefix, icon: "priority", color: level.color, on, disabled: menu.levels.disabled, badge: on, act: "menu:level", arg: level.prefix }));
				if (tiles.length > 0) parts.push({ kind: "tiles", key: "levels", variant: "priority", four: false, rows: tileRows(tiles) });
				break;
			}
			case "labels": {
				const tiles = menu.labels.tiles.map(({ label, on }): MenuTile => ({ key: `label:${label.name}`, label: labelTitle(label.name), icon: "label", color: label.color, on, disabled: menu.labels.disabled, badge: on, act: "menu:label", arg: label.name }));
				if (tiles.length > 0) parts.push({ kind: "tiles", key: "labels", variant: "labels", four: false, rows: tileRows(tiles) });
				break;
			}
			case "moves": {
				const tiles = menu.moves.map((move): MenuTile => {
					const look = MOVE_LOOKS.get(move.id) ?? { label: "", icon: "calendar" };
					return move.date === null
						? { key: move.id, label: look.label, icon: look.icon, color: null, on: false, disabled: false, badge: false, act: "menu:page", arg: "picker" }
						: { key: move.id, label: look.label, icon: look.icon, color: null, on: false, disabled: false, badge: false, act: "menu:move", arg: move.date };
				});
				if (tiles.length > 0) parts.push({ kind: "tiles", key: "moves", variant: "move", four: false, rows: [tiles] });
				break;
			}
			case "edits":
				parts.push(editRowsPart(layer, input));
				break;
			case "opens":
				parts.push({
					kind: "rows",
					key: "opens",
					rows: [...(input.full ? [row({ key: "full", label: "Open full screen", icon: "fullScreen", act: "menu:full" })] : []), row({ key: "openFile", label: "Open in Obsidian", icon: "openFile", act: "menu:openFile" })],
				});
				break;
			case "remove":
				if (layer.asking === "delete") parts.push(askPart(layer, input, "delete"));
				else if (menu.remove) parts.push({ kind: "row", key: "remove", variant: "apart", row: row({ key: "remove", label: layer.bulk ? `Delete ${countLabel(input.tasks.length)}` : "Delete", icon: "delete", danger: true, act: "menu:remove" }) });
				break;
		}
	}
	return parts;
}

function sectionParts(layer: TaskMenuLayer, input: MenuInput): PanelPart[] {
	const sections = input.menu.sections;
	if (!sections) return [];
	const parts: PanelPart[] = [{ kind: "back", key: "back", title: "Section", act: "menu:page", arg: "menu" }];
	parts.push({
		kind: "rows",
		key: "sections",
		rows: sections.options.map(({ name, checked }) => row({ key: `section:${name ?? ""}`, label: name ?? sections.choice.ungrouped, icon: checked ? "check" : null, choice: true, quiet: name === null, act: "menu:section", arg: name === null ? "" : `=${name}` })),
	});
	if (sections.create && !layer.bulk) parts.push({ kind: "row", key: "newSection", variant: "apart", row: row({ key: "newSection", label: "New section", icon: "plus", add: true, act: "menu:newSection" }) });
	return parts;
}

function projectParts(input: MenuInput): PanelPart[] {
	const { options, none, noneLabel, newLabel } = input.menu.project;
	return [
		{ kind: "back", key: "back", title: "Project", act: "menu:page", arg: "menu" },
		{
			kind: "rows",
			key: "projects",
			rows: [
				...options.map(({ project, checked, depth, disabled }) => row({ key: `project:${project.name}`, label: project.name, icon: checked ? "check" : null, choice: true, disabled, depth, act: "menu:project", arg: `=${project.name}` })),
				row({ key: "noProject", label: noneLabel, icon: none ? "check" : null, choice: true, quiet: true, act: "menu:project", arg: "" }),
			],
		},
		{ kind: "row", key: "newProject", variant: "apart", row: row({ key: "newProject", label: newLabel, icon: "plus", add: true, act: "menu:page", arg: "projectName" }) },
	];
}

function reminderParts(input: MenuInput): PanelPart[] {
	return [
		{ kind: "back", key: "back", title: "Reminder", act: "menu:page", arg: "menu" },
		{ kind: "rows", key: "reminders", rows: input.menu.reminders.map(({ kind, checked }) => row({ key: `reminder:${kind}`, label: reminderName(kind), icon: checked ? "check" : null, choice: true, quiet: kind === "none", act: "menu:reminder", arg: kind })) },
	];
}

const WEEKDAY_HEADS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** The month the date page shows: the one stepped to, else the chosen day's (the day the tasks share), else today's. */
export function pickerMonth(layer: TaskMenuLayer, input: MenuInput): LocalDate {
	const selected = input.menu.dueDate;
	return layer.month ?? `${(selected ?? input.today).slice(0, 7)}-01`;
}

function pickerParts(layer: TaskMenuLayer, input: MenuInput): PanelPart[] {
	const selected = input.menu.dueDate;
	const month = pickerMonth(layer, input);
	const parts: PanelPart[] = [{ kind: "picker", key: "picker", title: `${MONTH_NAMES.get(Number(month.slice(5, 7))) ?? ""} ${month.slice(0, 4)}`, weekdays: WEEKDAY_HEADS, cells: monthGrid(month, input.today, selected) }];
	if (input.menu.removeDue) parts.push({ kind: "row", key: "removeDue", variant: "pickerRemove", row: row({ key: "removeDue", label: "Remove due date", icon: "removeDue", act: "menu:removeDue" }) });
	return parts;
}

/** The repeat page's draft for the task as it stands (`repeatDraft` of its rule from its `repeatDay`), or as the page holds it. */
function repeatParts(layer: TaskMenuLayer): PanelPart[] {
	const page = layer.repeat;
	if (!page) return [];
	const { draft } = page;
	const parts: PanelPart[] = [{ kind: "repeat", key: "repeat", draft, detail: repeatDetail(draft) }];
	if (draft.removable) parts.push({ kind: "row", key: "repeatRemove", variant: "repeatRemove", row: row({ key: "repeatRemove", label: REPEAT_WORDS.remove, icon: "removeDue", act: "menu:repeatRemove" }) });
	return parts;
}

function repeatDetail(draft: RepeatDraft): RepeatDetail {
	if (draft.detail === "monthDay") return { kind: "monthDay", words: onTheDay(draft.rule) };
	if (draft.detail !== "weekdays") return null;
	return { kind: "weekdays", days: REPEAT_WORDS.weekdays.map(({ short, name }, i) => ({ short, name, on: draft.days.includes(i as never), day: i })) };
}


/** The panel of the page the layer shows, for its tasks and the core's model of them. */
export function panelModel(layer: TaskMenuLayer, input: MenuInput): PanelModel {
	switch (layer.page) {
		case "menu":
			return { variant: "menu", parts: menuParts(layer, input) };
		case "sections":
			return { variant: "menu", parts: sectionParts(layer, input) };
		case "projects":
			return { variant: "menu", parts: projectParts(input) };
		case "projectName":
			return { variant: "menu", parts: [{ kind: "back", key: "back", title: "New project", act: "menu:page", arg: "projects" }, { kind: "name", key: "name", placeholder: "Project name" }] };
		case "reminders":
			return { variant: "menu", parts: reminderParts(input) };
		case "repeat":
			return { variant: "repeat", parts: repeatParts(layer) };
		case "picker":
			return { variant: "picker", parts: pickerParts(layer, input) };
	}
}

/** The repeat page's kinds and units as the segments show them. */
export function kindLabel(kind: string): string {
	return KIND_LABELS.get(kind) ?? "";
}

export function unitLabel(unit: string): string {
	return UNIT_LABELS.get(unit) ?? "";
}

/** A tap on the repeat page through the core's `editRepeat`: the next draft, or the same when the tap changes nothing. */
export function repeatEdited(page: RepeatHeldPage, change: RepeatChange): RepeatHeldPage {
	const next = editRepeat(page.draft, change);
	return next ? { draft: next, held: { rule: next.rule } } : page;
}

/** The menu's opening column: a list's (its row's), By subprojects the card's own (`ProjectsCard.menuFrom`). */
export function fromOf(column: DropColumn | null, projectsFrom: MenuFrom | null): MenuFrom {
	return projectsFrom ?? column ?? "done";
}

export type { MonthCell };
