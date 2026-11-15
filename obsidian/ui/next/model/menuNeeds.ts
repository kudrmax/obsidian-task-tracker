import type { MenuScreen, PickedTask, TaskItem, TaskMenuModel } from "../../../../core/application/contracts";
import { resultOf, type Need } from "./answers";
import { type BlockModel, currentLists, screenView, shownDay, today } from "./block";
import type { CardRow } from "./lists";
import { type MenuDrawing, type MenuInput, panelModel, type TaskMenuLayer } from "./taskMenu";

/** The card rows the block draws now, by key. */
export function cardRows(model: BlockModel): ReadonlyMap<string, CardRow> {
	const lists = currentLists(model);
	const rows = lists.kind === "rows" ? lists.rows.flatMap((row) => row.list.rows) : lists.kind === "byProject" ? lists.list.rows : [];
	const cards = rows.filter((row): row is CardRow => row.kind === "card");
	return new Map(cards.map((row) => [row.key, row] as const));
}

/** The task menu standing open (its close not begun): the one the menu's messages act on. */
export function openMenu(model: BlockModel): TaskMenuLayer | null {
	const top = model.layers.slice(-1).find(() => true);
	return top?.kind === "taskMenu" && !top.closing ? top : null;
}

/** The menu's cards as they stand now (one task's, or the picked ones), each with where its menu opens from; none gone. */
export function menuCards(model: BlockModel, layer: TaskMenuLayer): readonly CardRow[] | null {
	const rows = cardRows(model);
	const ids = layer.bulk ? (model.select?.picked ?? []) : [layer.id];
	const cards = ids.map((id) => rows.get(id) ?? null);
	return cards.length === 0 || cards.some((card) => card === null) ? null : (cards as CardRow[]);
}

export function menuTasks(model: BlockModel, layer: TaskMenuLayer): readonly TaskItem[] | null {
	return menuCards(model, layer)?.map((card) => card.item) ?? null;
}

/** The screen a menu opens over (`tasks.menu`'s `screen`): today, the day it shows, the sections and projects it offers. */
export function menuScreen(model: BlockModel): MenuScreen | null {
	const now = today(model);
	const day = shownDay(model);
	const screen = screenView(model);
	return now && day && screen ? { today: now, day, offer: screen.offer, projects: screen.projectTree } : null;
}

/** The core's model of the open menu (`tasks.menu`, `tasks.bulkMenu`), a view answer while the menu stands (P2). */
export function menuNeeds(model: BlockModel): readonly Need[] {
	const layer = model.layers.filter((l): l is TaskMenuLayer => l.kind === "taskMenu").slice(-1).find(() => true);
	if (!layer) return [];
	const cards = menuCards(model, layer);
	const screen = menuScreen(model);
	if (!cards || !screen) return [];
	if (layer.bulk) return [{ key: "menu", method: "tasks.bulkMenu", args: [cards.map((card): PickedTask => ({ item: card.item, from: card.from })), screen] }];
	const [card] = cards;
	return [{ key: "menu", method: "tasks.menu", args: [card.item, card.from, screen] }];
}

/** What the open menu draws from: its tasks, the core's model of them, today. Null while any of it is missing. */
export function menuInput(model: BlockModel, layer: TaskMenuLayer): MenuInput | null {
	const tasks = menuTasks(model, layer);
	const menu = resultOf<TaskMenuModel>(model.answers, "menu");
	const day = today(model);
	return tasks && menu && day ? { tasks, menu, today: day, full: layer.bulk === null } : null;
}

/** The variables the menu's parts carry to the stylesheet (`motion` writes them): a project's depth on the Project page. */
export function menuVars(model: BlockModel): ReadonlyMap<string, Readonly<Record<string, string>>> {
	const vars = new Map<string, Readonly<Record<string, string>>>();
	const layer = openMenu(model);
	const input = layer ? menuInput(model, layer) : null;
	if (!layer || !input || layer.page !== "projects") return vars;
	for (const option of input.menu.project.options) vars.set(`option/project:${option.project.name}`, { "--tc-n-depth": String(option.depth) });
	return vars;
}

/** What an open menu draws: its panel, the cards it lifts, the start of the task's description. Null while any of it is missing. */
export function menuDrawing(model: BlockModel, layer: TaskMenuLayer): MenuDrawing | null {
	if (layer.frozen) return layer.frozen;
	const input = menuInput(model, layer);
	const cards = menuCards(model, layer);
	if (!input || !cards) return null;
	const [task] = input.tasks;
	const peek = layer.bulk === null && layer.page !== "projectName" ? (task?.description ?? null) : null;
	return { panel: panelModel(layer, input), cards: cards.map((card) => ({ key: card.key, face: card.face })), peek };
}

/** The description a menu shows by its card (the open menu's, or the one fading out): Obsidian draws it (`Rendered`). */
export function menuPeek(model: BlockModel): string | null {
	const layer = model.layers.filter((l): l is TaskMenuLayer => l.kind === "taskMenu").slice(-1).find(() => true);
	return layer ? (menuDrawing(model, layer)?.peek ?? null) : null;
}
