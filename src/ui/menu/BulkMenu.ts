import type { GroupName, TaskItem, TaskMenuModel } from "../../application/contracts";
import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { fillCard } from "../TaskCard";
import { pickMark } from "../TaskSelection";
import type { LocalDate, TaskStatus } from "../types";
import { menuGroup, menuRow, type MenuTileSpec, menuRoom, placePanel, tileGroup, tileRows } from "./MenuPanel";
import { datePage } from "./DatePage";
import { sectionChooser } from "./SectionChooser";
import { Overlay } from "./Overlay";
import { moveTiles } from "./quickMoves";
import { labelTiles, priorityTiles, progressLabel } from "./TaskMenu";

/** "3 tasks". */
export function countLabel(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}

export interface BulkActions {
	setStatus(status: TaskStatus): Promise<void>;
	/** A tap on a level (`TaskService.togglePriority`). */
	togglePriority(prefix: string): Promise<void>;
	/** A tap on a label (`TaskService.toggleLabel`); the tasks as they then stand, null once one is gone. */
	toggleLabel(name: string): Promise<readonly TaskItem[] | null>;
	postpone(date: LocalDate): Promise<void>;
	removeDue(): Promise<void>;
	toSection(name: GroupName): Promise<void>;
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
		if (rect.width === 0 || rect.bottom < 0 || rect.top > window.innerHeight) return;
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
		const statuses: MenuTileSpec[] = [
			{ label: "Done", icon: "done", onPick: this.pick(() => actions.setStatus("done")) },
			{ label: progressLabel(model.progress), icon: "progress", onPick: this.pick(() => actions.setStatus(model.progress)) },
			{ label: "Won’t do", icon: "wontdo", onPick: this.pick(() => actions.setStatus("cancelled")) },
		];
		tileGroup(panel, "is-status", [statuses]);
		const levels = priorityTiles(model).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, disabled: model.levels.disabled, onPick: this.pick(() => actions.togglePriority(tile.prefix)) }));
		if (levels.length > 0) tileGroup(panel, "is-priority", tileRows(levels));
		const labels = labelTiles(model).map((tile): MenuTileSpec => ({ label: tile.title, icon: "label", color: tile.color, on: tile.on, disabled: model.labels.disabled, onPick: () => void this.toggleLabel(tile.name) }));
		if (labels.length > 0) tileGroup(panel, "is-labels", tileRows(labels));
		const moves = moveTiles(model.moves).map(({ label, icon, date }): MenuTileSpec => ({ label, icon, onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)) }));
		tileGroup(panel, "is-move", [moves]);
		if (model.sections) menuGroup(panel, [{ label: "Section", icon: "section", onPick: () => this.showSections() }]);
		menuRow(panel, { label: `Delete ${countLabel(items.length)}`, icon: "delete", danger: true, apart: true, onPick: this.pick(() => actions.remove()) });
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

	/** The sections of the tasks' list; the one they all stand in checked. */
	private showSections(): void {
		const sections = this.context.menu(this.context.items).sections;
		if (!sections) return;
		const { choice, shared } = sections;
		const { actions } = this.context;
		this.panel.replace((panel) =>
			sectionChooser(panel, {
				choice,
				checked: (name) => shared && name === choice.current,
				onBack: () => this.showMenu(),
				onPick: (name) => this.pick(() => actions.toSection(name))(),
			}),
		);
	}

	private showPicker(): void {
		const { items, actions, today } = this.context;
		const model = this.context.menu(items);
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
