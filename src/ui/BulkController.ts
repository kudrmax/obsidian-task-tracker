import type { GroupName, TaskChange, TaskItem, TaskStep } from "../application/contracts";
import type { PriorityLevel } from "../settings";
import { carriesMany, type DropResult, type DropTarget, type ListColumn, type TaskDragPayload } from "./drag/DropTarget";
import { BulkMenu } from "./menu/BulkMenu";
import { canRemoveDue } from "./menu/quickMoves";
import type { SectionChoice } from "./menu/TaskMenu";
import { PlusRing } from "./quick/PlusRing";
import { keyId, type PickedCard, TaskSelection } from "./TaskSelection";
import type { LocalDate } from "./types";

/** Where the picked tasks can go among their list's sections: only when they all stand in one list that shows them. */
export interface BulkSections {
	readonly choice: SectionChoice;
	/** Every task stands in `choice.current`: it is checked. */
	readonly shared: boolean;
	/** What going to section `name` means for the task of `card`. */
	change(card: PickedCard, name: GroupName): TaskChange;
}

export interface BulkDeps {
	/** The view's content: the cancel ring goes in it, where the plus stands. */
	readonly root: HTMLElement;
	/** Writes the steps and resolves once the screen shows them. */
	apply(steps: readonly TaskStep[]): Promise<void>;
	today(): LocalDate;
	/** The day the day column shows. */
	day(): LocalDate;
	levels(): readonly PriorityLevel[];
	/** The cards of a list, in order. */
	cards(column: ListColumn): readonly HTMLElement[];
	sections(cards: readonly PickedCard[]): BulkSections | null;
	/** Picking is for the desktop: on the phone a click does what it always did. */
	desktop(): boolean;
	/** ⌘ on a Mac, Ctrl elsewhere. */
	isMod(e: MouseEvent): boolean;
}

/** What hides the selection when pressed: anything but a card, the menu over the picked cards, and a carried stack. */
const KEEPS = ".tc-card, .tc-lifted, .tc-panel, .tc-backdrop, .tc-float, .tc-float-under, .tc-float-count";

/**
 * Bulk actions (bulk actions spec, desktop): ⌘-click picks list cards, Shift-click a run of them, a click on a picked
 * card opens one menu for them all, and a picked card lifted carries the others along. Escape or a click on an empty
 * place lets them go, as does any action done on them.
 */
export class BulkController {
	readonly selection = new TaskSelection();
	private readonly ring: PlusRing;
	private menu: BulkMenu | null = null;

	constructor(private readonly deps: BulkDeps) {
		this.ring = new PlusRing(deps.root, "cross");
	}

	attach(card: PickedCard): void {
		this.selection.attach(card);
	}

	/** A list card clicked: true when the click was for the selection, so the card's own menu stays shut. */
	pick(card: PickedCard, e: MouseEvent, how: "tap" | "menu"): boolean {
		if (!this.deps.desktop()) return false;
		const selection = this.selection;
		if (how === "tap" && this.deps.isMod(e)) {
			selection.toggle(card);
			return true;
		}
		if (how === "tap" && e.shiftKey && selection.size > 0) {
			const column = this.deps.cards(card.column).flatMap((el) => selection.cardOf(el) ?? []);
			selection.extend(card, column);
			return true;
		}
		if (selection.has(card.item) && selection.size > 1) {
			this.openMenu(card.card);
			return true;
		}
		selection.clear();
		return false;
	}

	/** The picked cards that go along when `item` is lifted; lifting a card not picked lets the selection go. */
	carried(item: TaskItem): readonly PickedCard[] {
		if (!this.selection.has(item)) {
			this.selection.clear();
			return [];
		}
		const id = keyId(item.key);
		const picked = this.selection.cards;
		return picked.filter((p) => keyId(p.item.key) !== id && !picked.some((other) => other !== p && other.subtree.includes(p.card)));
	}

	/** Several cards carried: the plus's place cancels the drag. */
	targets(drag: TaskDragPayload): readonly DropTarget[] {
		if (!carriesMany(drag)) return [];
		this.ring.show();
		return [this.ring];
	}

	/** The drag is over. */
	settled(): void {
		this.ring.hide();
	}

	/** What a drop of several cards means for each of them, as for one (spec §5.1); null for one carried alone. */
	dropSteps(drag: TaskDragPayload, result: DropResult): readonly TaskStep[] | null {
		if (!carriesMany(drag) || drag.from === "timeline") return null;
		const all = [{ item: drag.item, from: drag.from }, ...(drag.carried ?? [])];
		const steps = all.flatMap(({ item, from }) => {
			const change = this.dropChange(from, result);
			return change ? [{ key: item.key, change }] : [];
		});
		this.selection.clear();
		return steps;
	}

	private dropChange(from: ListColumn, result: DropResult): TaskChange | null {
		const day = this.deps.day();
		switch (result.kind) {
			case "group":
				return { kind: "moveToGroup", list: result.list, group: result.group, before: result.before, date: result.date ?? undefined };
			case "nest":
				return { kind: "nest", parent: result.parent, before: result.before };
			case "listBefore":
				if (result.column === "left") return from === "left" ? { kind: "moveBefore", before: result.before, date: day } : { kind: "moveToList", date: day };
				if (result.before) return { kind: "moveBefore", before: result.before, date: day };
				return from === "left" ? { kind: "moveToSoon", date: day } : { kind: "moveToEnd", section: result.column };
			default:
				return null;
		}
	}

	/** Escape lets the picked cards go; the menu over them takes its own Escape first. */
	onKey(e: KeyboardEvent): void {
		if (e.key === "Escape" && !this.menu && this.selection.size > 0) this.selection.clear();
	}

	/** A press on an empty place lets the picked cards go. */
	onPress(target: EventTarget | null): void {
		if (this.menu || this.selection.size === 0) return;
		if (target instanceof Element && target.closest(KEEPS)) return;
		this.selection.clear();
	}

	private openMenu(source: HTMLElement): void {
		const cards = this.selection.cards;
		const items = cards.map((card) => card.item);
		const sections = this.deps.sections(cards);
		const each = (change: (card: PickedCard) => TaskChange) => {
			this.selection.clear();
			return this.deps.apply(cards.map((card) => ({ key: card.item.key, change: change(card) })));
		};
		this.menu = BulkMenu.open({
			items,
			cards: cards.map((card) => card.card),
			source,
			today: this.deps.today(),
			day: this.deps.day(),
			levels: this.deps.levels(),
			sections: sections ? { choice: sections.choice, shared: sections.shared } : undefined,
			actions: {
				setStatus: (status) => each(() => ({ kind: "status", status })),
				setPriority: (priority) => each(() => ({ kind: "priority", priority })),
				postpone: (date) => each(() => ({ kind: "postpone", date })),
				removeDue: () => {
					const today = this.deps.today();
					return each((card) => (canRemoveDue(today, card.item.dueDate) ? { kind: "dueDate", date: null } : { kind: "dueDate", date: card.item.dueDate }));
				},
				toSection: (name) => each((card) => sections!.change(card, name)),
				remove: () => each(() => ({ kind: "remove" })),
			},
			onClose: () => (this.menu = null),
		});
	}
}
