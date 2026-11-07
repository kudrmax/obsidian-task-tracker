import type { GroupName, MenuStatusId, TaskItem, TaskMenuModel } from "../../../core/application/contracts";
import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { fillCard } from "../TaskCard";
import { pickMark } from "../TaskSelection";
import type { LocalDate } from "../types";
import { askGroup, menuGroup, menuRow, type MenuTileSpec, menuRoom, placePanel, tileGroup, tileRows } from "./MenuPanel";
import { datePage } from "./DatePage";
import { projectChooser, sectionChooser } from "./SectionChooser";
import { Overlay } from "./Overlay";
import { moveTiles } from "./quickMoves";
import { type Asking, askLooks, labelTiles, priorityTiles, projectRow, statusTiles } from "./TaskMenu";

/** "3 tasks". */
export function countLabel(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}

export interface BulkActions {
	/** A status tile (`TaskService.pickStatus`). */
	pickStatus(id: MenuStatusId): Promise<void>;
	/** A tap on a level (`TaskService.togglePriority`). */
	togglePriority(prefix: string): Promise<void>;
	/** A tap on a label (`TaskService.toggleLabel`); the tasks as they then stand, null once one is gone. */
	toggleLabel(name: string): Promise<readonly TaskItem[] | null>;
	postpone(date: LocalDate): Promise<void>;
	removeDue(): Promise<void>;
	toSection(name: GroupName): Promise<void>;
	/** The tasks' project: a note's link, null for No project. */
	setProject(project: string | null): Promise<void>;
	remove(): Promise<void>;
}

export interface BulkMenuContext {
	readonly items: readonly TaskItem[];
	/** The picked tasks' cards: each stays over the blur where it stands. */
	readonly cards: readonly HTMLElement[];
	/** What opened it: the card clicked, the panel beside its list, level with it; or Select tasks' menu button, the panel over it, by its right edge. */
	readonly source: HTMLElement;
	readonly at: "beside" | "over";
	readonly today: LocalDate;
	readonly day: LocalDate;
	/** The menu's groups for the tasks as they stand (`TaskService.menu`): asked again once a label changed them. */
	readonly menu: (items: readonly TaskItem[]) => TaskMenuModel;
	readonly actions: BulkActions;
	onClose(): void;
}

/**
 * The menu for every picked task at once (bulk actions spec): their cards stay over the blur where they stand, so the
 * panel opens beside the list instead of under the card. It has what makes sense for many: status, priority, the
 * moves, the section and Delete.
 */
export class BulkMenu {
	private readonly overlay: Overlay;
	private readonly panel: Panel;
	private readonly source: DOMRect;

	static open(context: BulkMenuContext): BulkMenu {
		return new BulkMenu(context);
	}

	/** A label being written: taps on the labels wait for it. */
	private labelling = false;
	/** What the menu asks about now, if the model says a pick asks first. */
	private asking: Asking | null = null;

	private constructor(private context: BulkMenuContext) {
		this.overlay = new Overlay(() => this.close());
		const rects = context.cards.map((card) => card.getBoundingClientRect());
		this.source = context.at === "beside" ? this.besideList(context.source) : context.source.getBoundingClientRect();
		context.cards.forEach((card, i) => this.lift(card, rects[i]));
		if (context.at === "over") LiftedCopy.over(this.overlay, context.source.cloneNode(true) as HTMLElement, false).pin(this.source).el.classList.add("tc-control-copy");
		this.panel = Panel.over(this.overlay, { root: "tc-panel", cls: `is-task is-bulk is-${context.at}`, picks: new Picks(() => this.close()), place: (panel) => this.place(panel) });
		this.showMenu();
		this.overlay.show();
	}

	/** A copy of a picked card over the blur, at `rect`, where the card stands, read before any copy; cards out of sight have none. */
	private lift(card: HTMLElement, rect: DOMRect): void {
		if (rect.width === 0 || rect.bottom < 0 || rect.top > activeWindow.innerHeight) return;
		const item = this.context.items[this.context.cards.indexOf(card)];
		const copy = LiftedCopy.over(this.overlay, el(null, "div", "tc-lifted is-selected"), true);
		fillCard(copy.el, item, { day: this.context.day });
		if (this.context.at === "over") pickMark(copy.el);
		copy.pin(rect, { width: true, height: true });
	}

	/** Right of the clicked card's list, its top level with the card. */
	private besideList(source: HTMLElement): DOMRect {
		const card = source.getBoundingClientRect();
		const column = source.closest(".tc-left, .tc-soon, .tc-inbox")?.getBoundingClientRect() ?? card;
		const gap = tokenPx(source, "--tc-menu-gap");
		return new DOMRect(column.right + gap, card.top - gap, 0, 0);
	}

	/** Beside the list; or over the menu button, its right edge on the button's. */
	private place(panel: HTMLElement): void {
		const { source } = this;
		const anchor = this.context.at === "beside" ? source : new DOMRect(source.right - panel.offsetWidth, source.top, panel.offsetWidth, source.height);
		placePanel(panel, anchor, tokenPx(panel, "--tc-menu-gap"), menuRoom());
	}

	private pick(action: () => Promise<void>): () => void {
		return this.panel.pick(action);
	}

	private showMenu(): void {
		this.panel.el.classList.remove("is-picker");
		this.panel.replace((panel) => this.buildMenu(panel));
	}

	private buildMenu(panel: HTMLElement): void {
		const { items, actions } = this.context;
		const model = this.context.menu(items);
		el(panel, "div", "tc-menu-title", countLabel(items.length));
		const statuses = statusTiles(model).map((tile): MenuTileSpec => ({ label: tile.label, icon: tile.icon, onPick: tile.confirm ? () => this.askFor(tile.id) : this.pick(() => actions.pickStatus(tile.id)) }));
		const asked = this.asking;
		if (asked !== null && asked !== "delete") this.askGroup(panel, asked);
		else tileGroup(panel, "is-status", [statuses]);
		const levels = priorityTiles(model).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, disabled: model.levels.disabled, onPick: this.pick(() => actions.togglePriority(tile.prefix)) }));
		if (levels.length > 0) tileGroup(panel, "is-priority", tileRows(levels));
		const labels = labelTiles(model).map((tile): MenuTileSpec => ({ label: tile.title, icon: "label", color: tile.color, on: tile.on, disabled: model.labels.disabled, onPick: () => void this.toggleLabel(tile.name) }));
		if (labels.length > 0) tileGroup(panel, "is-labels", tileRows(labels));
		const moves = moveTiles(model.moves).map(({ label, icon, date }): MenuTileSpec => ({ label, icon, onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)) }));
		if (moves.length > 0) tileGroup(panel, "is-move", [moves]);
		const project = projectRow(model);
		menuGroup(panel, [
			...(model.edits.includes("section") ? [{ label: "Section", icon: "section", onPick: () => this.showSections() } as const] : []),
			{ ...project, onPick: () => this.showProjects() },
		]);
		const remove = model.remove;
		if (this.asking === "delete") this.askGroup(panel, "delete");
		else if (remove) menuRow(panel, { label: `Delete ${countLabel(items.length)}`, icon: "delete", danger: true, apart: true, onPick: remove.confirm ? () => this.askFor("delete") : this.pick(() => actions.remove()) });
	}

	/** A pick the model says asks first asks in place of what was pressed, the rest of the menu as it is. */
	private askFor(what: Asking | null): void {
		this.asking = what;
		this.showMenu();
	}

	private askGroup(panel: HTMLElement, what: Asking): void {
		const { items, actions } = this.context;
		const { verb, icon, danger } = askLooks(what);
		askGroup(panel, {
			verb,
			title: countLabel(items.length),
			confirm: verb,
			icon,
			danger,
			onCancel: () => this.askFor(null),
			onConfirm: this.pick(() => (what === "delete" ? actions.remove() : actions.pickStatus(what))),
		});
	}

	/** A label goes on or off the tasks and the menu stays, drawn again for them as the file now has them; one gone closes it. */
	private async toggleLabel(name: string): Promise<void> {
		if (this.labelling) return;
		this.labelling = true;
		try {
			const next = await this.context.actions.toggleLabel(name);
			if (this.overlay.isClosed) return;
			if (!next) return this.close();
			this.context = { ...this.context, items: next };
			this.showMenu();
		} finally {
			this.labelling = false;
		}
	}

	/** The sections of the tasks' list, as the model offers them. */
	private showSections(): void {
		const sections = this.context.menu(this.context.items).sections;
		if (!sections) return;
		const { actions } = this.context;
		this.asking = null;
		this.panel.replace((panel) =>
			sectionChooser(panel, {
				sections,
				onBack: () => this.showMenu(),
				onPick: (name) => this.pick(() => actions.toSection(name))(),
			}),
		);
	}

	/** The Project page: every picked task gets the project picked; subtasks keep their parents'. */
	private showProjects(): void {
		const { actions } = this.context;
		this.asking = null;
		this.panel.replace((panel) =>
			projectChooser(panel, {
				project: this.context.menu(this.context.items).project,
				onBack: () => this.showMenu(),
				onPick: (link) => this.pick(() => actions.setProject(link))(),
			}),
		);
	}

	private showPicker(): void {
		const { items, actions, today } = this.context;
		const model = this.context.menu(items);
		this.asking = null;
		this.panel.replace((panel) =>
			datePage(panel, {
				today,
				selected: model.dueDate,
				onPick: (date) => this.pick(() => actions.postpone(date))(),
				onRemove: model.removeDue ? this.pick(() => actions.removeDue()) : undefined,
			}),
		);
	}

	close(): void {
		if (this.overlay.close()) this.context.onClose();
	}
}
