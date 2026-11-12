import { acceptsDrop, type DropTo, type EntryDrawing, type GroupName, type GroupedList, type ListGroup, type ListSection, type TaskItem, type TaskKey } from "../../../core/application/contracts";
import type { ColumnSections, ListColumn } from "../drag/DropTarget";
import { ListDrop } from "../drag/ListDrop";
import { el } from "../dom";
import { FreeRoomDoubleClick } from "../FreeRoomDoubleClick";
import { type ListEntryInput, TaskList } from "../TaskList";
import type { LocalDate } from "../types";

/** What a funnel's list reads of the screen and hands back to it: the same for its column, its row or its pane, in any layout. */
export interface FunnelListDeps {
	/** The column's tasks as read, the card waiting for its section's name left out. */
	items(column: ListColumn): readonly TaskItem[];
	day(): LocalDate;
	sectionsOf(column: ListColumn): ColumnSections | null;
	listSections(column: ListColumn): readonly ListSection[];
	naming(column: ListColumn): TaskItem | null;
	entry(column: ListColumn, drawing: EntryDrawing): ListEntryInput | null;
	/** The words of the plate the list draws while it draws no card (`ViewChoice.plates`); null for none. */
	plate(column: ListColumn): string | null;
	emptyLabel(): string;
	openAtEnd(column: ListColumn): void;
	openIn(column: ListColumn, group: GroupName): void;
	renaming(): TaskKey | null;
	header(head: HTMLElement, list: GroupedList, owner: TaskList, group: ListGroup, signal: AbortSignal): void;
	ungroupedName(): string;
	card(card: HTMLElement, item: TaskItem, column: ListColumn, subtree: readonly HTMLElement[], signal: AbortSignal): void;
	/** What a drop on the column's title means (`ScreenView.titleDrops`). */
	titleDrop(column: ListColumn): DropTo | null;
	tap(): void;
}

/** A funnel's list as a layout draws it: its cards, the place to drop it offers, and the free room a double click types in. */
export interface FunnelList {
	readonly column: ListColumn;
	readonly list: TaskList;
	readonly drop: ListDrop;
}

export interface FunnelListPlace {
	/** The list's area: where a finger over it is over the list, and its free room. */
	readonly area: HTMLElement;
	/** The list's title as a place to drop, with whether it stands over the area (a column's) or in it (Backlog's); none in the rows. */
	readonly title?: { readonly el: () => HTMLElement | null; readonly over: boolean };
}

/** The list of `column` built in `place.area`: every layout builds its funnel lists this one way. */
export function funnelList(deps: FunnelListDeps, column: ListColumn, place: FunnelListPlace): FunnelList {
	const list: TaskList = new TaskList(el(place.area, "div"), {
		items: () => deps.items(column),
		day: () => (column === "day" ? deps.day() : null),
		grouped: () => deps.sectionsOf(column) !== null,
		sections: () => deps.listSections(column),
		onPlate: (plate, group, signal) => plate.addEventListener("click", () => deps.openIn(column, group.name), { signal }),
		pending: () => deps.naming(column),
		entry: (drawing) => deps.entry(column, drawing),
		empty: () => deps.plate(column),
		emptyLabel: () => deps.emptyLabel(),
		onEmpty: () => deps.openAtEnd(column),
		renaming: () => deps.renaming(),
		onHeader: (head, group, signal) => deps.header(head, deps.sectionsOf(column)?.list ?? (column === "day" ? "now" : column), list, group, signal),
		ungroupedName: () => deps.ungroupedName(),
		onCard: (card, item, subtree, signal) => deps.card(card, item, column, subtree, signal),
	});
	const title = place.title;
	const drop = new ListDrop(
		list,
		place.area,
		column,
		(origins) => acceptsDrop(column, origins),
		() => deps.sectionsOf(column),
		title?.over ?? false,
		() => deps.tap(),
		title ? { el: title.el, drop: () => deps.titleDrop(column) } : null,
	);
	new FreeRoomDoubleClick([place.area, list.el], () => deps.openAtEnd(column));
	return { column, list, drop };
}
