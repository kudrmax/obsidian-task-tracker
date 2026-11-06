import { type GroupName, type LabelLevel, labelTitle, nextProgress, type PriorityLevel, type TaskItem } from "../../application/contracts";
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
import { type MoveTile, type MoveTileId, moveTiles } from "./quickMoves";
import { type LevelTile, progressLabel, type SectionChoice } from "./TaskMenu";

/** "3 tasks". */
export function countLabel(count: number): string {
	return count === 1 ? "1 task" : `${count} tasks`;
}

/** The progress tile for every task at once: what `nextProgress` sets on them all, and its name. */
export function bulkProgress(items: readonly TaskItem[]): { readonly label: string; readonly status: TaskStatus } {
	const status = nextProgress(items.map((item) => item.status));
	return { label: progressLabel(status), status };
}

/** The levels, the one every task shares on; with mixed levels none is. */
export function bulkLevelTiles(items: readonly TaskItem[], levels: readonly PriorityLevel[]): readonly LevelTile[] {
	const shared = items[0]?.priority?.prefix ?? null;
	const same = items.every((item) => (item.priority?.prefix ?? null) === shared);
	return levels.map((level) => ({ prefix: level.prefix, color: level.color, on: same && level.prefix === shared }));
}

/** The labels: one is on when every task that may carry labels has it; off while none may. */
export function bulkLabelTiles(items: readonly TaskItem[], labels: readonly LabelLevel[]): readonly { readonly name: string; readonly title: string; readonly color: LabelLevel["color"]; readonly on: boolean; readonly disabled: boolean }[] {
	const open = items.filter((item) => item.can.setLabels);
	return labels.map((label) => ({ name: label.name, title: labelTitle(label.name), color: label.color, on: open.length > 0 && open.every((item) => item.labels.some((l) => l.name === label.name)), disabled: open.length === 0 }));
}

/** A tap on a label every such task has takes it off them all; otherwise it goes on each that lacks it. The tasks that may carry none keep theirs. */
export function bulkNextLabels(items: readonly TaskItem[], name: string): readonly (readonly string[])[] {
	const open = items.filter((item) => item.can.setLabels);
	const all = open.length > 0 && open.every((item) => item.labels.some((l) => l.name === name));
	return items.map((item) => {
		const names = item.labels.map((l) => l.name);
		if (!item.can.setLabels) return names;
		if (all) return names.filter((n) => n !== name);
		return names.includes(name) ? names : [...names, name];
	});
}

/** A tap on the level every task shares takes it off them all; any other level goes on all. */
export function bulkNextPriority(items: readonly TaskItem[], prefix: string): string | null {
	return items.every((item) => item.priority?.prefix === prefix) ? null : prefix;
}

/** Today and Tomorrow, unless every task already stands on that day, and Pick a date. */
export function bulkMoveTiles(items: readonly TaskItem[], today: LocalDate): readonly MoveTile[] {
	const offered = items.flatMap((item) => moveTiles(item, today));
	return MOVE_ORDER.flatMap((id) => offered.find((tile) => tile.id === id) ?? []);
}

const MOVE_ORDER: readonly MoveTileId[] = ["today", "tomorrow", "pick"];

/** Remove due date, when some task has one to take off. */
export function bulkCanRemoveDue(items: readonly TaskItem[]): boolean {
	return items.some((item) => item.can.removeDue);
}

export interface BulkActions {
	setStatus(status: TaskStatus): Promise<void>;
	setPriority(prefix: string | null): Promise<void>;
	/** Each task's labels become the names at its index; the tasks as they then stand, null once one is gone. */
	setLabels(names: readonly (readonly string[])[]): Promise<readonly TaskItem[] | null>;
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
	readonly levels: readonly PriorityLevel[];
	/** The labels the menu offers, after the levels; none without them. */
	readonly labels?: readonly LabelLevel[];
	/** The sections the tasks can go to, only when they all stand in one list that shows them; `shared`: all stand in its current one. */
	readonly sections?: { readonly choice: SectionChoice; readonly shared: boolean };
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
		const { items, actions, levels, today } = this.context;
		el(panel, "div", "tc-menu-title", countLabel(items.length));
		const progress = bulkProgress(items);
		const statuses: MenuTileSpec[] = [
			{ label: "Done", icon: "done", onPick: this.pick(() => actions.setStatus("done")) },
			{ label: progress.label, icon: "progress", onPick: this.pick(() => actions.setStatus(progress.status)) },
			{ label: "Won’t do", icon: "wontdo", onPick: this.pick(() => actions.setStatus("cancelled")) },
		];
		tileGroup(panel, "is-status", [statuses]);
		const levelTiles = bulkLevelTiles(items, levels).map((tile): MenuTileSpec => ({ label: tile.prefix, icon: "priority", color: tile.color, on: tile.on, disabled: items.every((item) => !item.can.setPriority), onPick: this.pick(() => actions.setPriority(bulkNextPriority(items, tile.prefix))) }));
		if (levelTiles.length > 0) tileGroup(panel, "is-priority", tileRows(levelTiles));
		const labelTiles = bulkLabelTiles(items, this.context.labels ?? []).map((tile): MenuTileSpec => ({ label: tile.title, icon: "label", color: tile.color, on: tile.on, disabled: tile.disabled, onPick: () => void this.toggleLabel(tile.name) }));
		if (labelTiles.length > 0) tileGroup(panel, "is-labels", tileRows(labelTiles));
		const moves = bulkMoveTiles(items, today).map(({ label, icon, date }): MenuTileSpec => ({ label, icon, onPick: date === null ? () => this.showPicker() : this.pick(() => actions.postpone(date)) }));
		tileGroup(panel, "is-move", [moves]);
		if (this.context.sections) menuGroup(panel, [{ label: "Section", icon: "section", onPick: () => this.showSections() }]);
		menuRow(panel, { label: `Delete ${countLabel(items.length)}`, icon: "delete", danger: true, apart: true, onPick: this.pick(() => actions.remove()) });
	}

	/** A label goes on or off the tasks and the menu stays, drawn again for them as the file now has them; one gone closes it. */
	private async toggleLabel(name: string): Promise<void> {
		if (this.labelling) return;
		this.labelling = true;
		try {
			const next = await this.context.actions.setLabels(bulkNextLabels(this.context.items, name));
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
		if (!this.context.sections) return;
		const { choice, shared } = this.context.sections;
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
		const shared = items.every((item) => item.dueDate === items[0].dueDate) ? items[0].dueDate : null;
		this.panel.replace((panel) =>
			datePage(panel, {
				today,
				selected: shared,
				onPick: (date) => this.pick(() => actions.postpone(date))(),
				onRemove: bulkCanRemoveDue(items) ? this.pick(() => actions.removeDue()) : undefined,
			}),
		);
	}

	close(): void {
		if (this.overlay.close()) this.context.onClose();
	}
}
