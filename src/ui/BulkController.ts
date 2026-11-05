import { type GroupName, keyId, type LabelLevel, type PriorityLevel, type SectionChoice, type TaskChange, type TaskItem, type TaskKey, type TaskStep } from "../application/contracts";
import { carriesMany, type DropTarget, type ListColumn, type TaskDragPayload } from "./drag/DropTarget";
import { BulkMenu } from "./menu/BulkMenu";
import { el } from "./dom";
import { Button } from "./kit/Button";
import { PlusRing } from "./quick/PlusRing";
import { type PickedCard, pickMark, TaskSelection } from "./TaskSelection";
import type { LocalDate } from "./types";

/** Where the picked tasks can go among their list's sections: only when they all stand in one list that shows them. */
export interface BulkSections {
	readonly choice: SectionChoice;
	/** Every task stands in `choice.current`: it is checked. */
	readonly shared: boolean;
}

export interface BulkDeps {
	/** The view's content: the cancel ring goes in it, where the plus stands, and so do the buttons of Select tasks. */
	readonly root: HTMLElement;
	/** Writes the steps and resolves once the screen shows them. */
	apply(steps: readonly TaskStep[]): Promise<void>;
	today(): LocalDate;
	/** The day the day column shows. */
	day(): LocalDate;
	levels(): readonly PriorityLevel[];
	labels(): readonly LabelLevel[];
	/** Writes each task's labels, the screen shows them, and resolves with the tasks as they then stand, null for one gone. */
	setLabels(steps: readonly { readonly key: TaskKey; readonly labels: readonly string[] }[]): Promise<readonly (TaskItem | null)[]>;
	/** The cards of a list, in order. */
	cards(column: ListColumn): readonly HTMLElement[];
	sections(cards: readonly PickedCard[]): BulkSections | null;
	/** The tasks into section `name` of their list, and resolves once the screen shows them. */
	toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
	/** ⌘-click is for the desktop; on the phone only Select tasks picks. */
	desktop(): boolean;
	/** ⌘ on a Mac, Ctrl elsewhere. */
	isMod(e: MouseEvent): boolean;
}

/** What hides the selection when pressed: anything but a card, the menu over the picked cards, and a carried stack. */
const KEEPS = ".tc-card, .tc-lifted, .tc-panel, .tc-backdrop, .tc-float, .tc-float-under, .tc-float-count";

const SELECTING = "is-selecting";

/**
 * Bulk actions (bulk actions spec): on the desktop ⌘-click picks list cards, Shift-click a run of them, a click on a
 * picked card opens one menu for them all. Select tasks (both platforms) puts a circle on every list card: a tap picks;
 * the capsule at the bottom left holds the cross that stops and how many are picked, and «⋯» where the plus stood opens
 * the same menu. A picked card lifted carries
 * the others along. Escape or a click on an empty place lets them go, as does any action done on them, which also ends
 * Select tasks.
 */
export class BulkController {
	readonly selection = new TaskSelection(() => this.showCount());
	private readonly ring: PlusRing;
	private count: Button | null = null;
	private menuButton: Button | null = null;
	private menu: BulkMenu | null = null;
	private selecting = false;

	constructor(private readonly deps: BulkDeps) {
		this.ring = new PlusRing(deps.root, "cross");
	}

	/** The view's content is laid out: Select tasks' capsule (the cross, how many are picked) and its menu button where the plus stands join it, hidden until it starts. */
	mount(): void {
		const capsule = el(this.deps.root, "div", "tc-capsule tc-select-capsule");
		Button.create(capsule, { kind: "icon", label: "Stop selecting", icon: "cross", cls: "tc-select-exit", onPress: () => this.stop() });
		this.count = Button.create(capsule, { kind: "icon", label: "Picked tasks", text: "0", cls: "tc-select-num", onPress: () => this.openMenu("over") });
		this.menuButton = Button.create(this.deps.root, { kind: "round", tone: "accent", label: "Actions for selected tasks", icon: "more", cls: "tc-select-btn tc-select-menu", onPress: () => this.openMenu("over") });
		this.showCount();
	}

	/** Select tasks: every list card shows its circle, and a tap picks instead of opening the card's menu. */
	start(): void {
		this.selecting = true;
		this.deps.root.classList.add(SELECTING);
	}

	/** Select tasks ends, and the picked tasks go. */
	stop(): void {
		this.selection.clear();
		this.selecting = false;
		this.deps.root.classList.remove(SELECTING);
	}

	attach(card: PickedCard): void {
		pickMark(card.card);
		this.selection.attach(card);
	}

	/** A list card clicked: true when the click was for the selection, so the card's own menu stays shut. */
	pick(card: PickedCard, e: MouseEvent, how: "tap" | "menu"): boolean {
		const selection = this.selection;
		if (this.selecting && how === "tap") {
			selection.toggle(card);
			return true;
		}
		if (!this.deps.desktop()) return false;
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
			this.openMenu("beside", card.card);
			return true;
		}
		selection.clear();
		return false;
	}

	/** The picked cards that go along when `item` is lifted; lifting a card not picked lets the selection go, unless Select tasks keeps it. */
	carried(item: TaskItem): readonly PickedCard[] {
		if (!this.selection.has(item)) {
			if (!this.selecting) this.selection.clear();
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

	/** Several cards let go on a place: they leave the selection, as any action done on them. */
	dropping(drag: TaskDragPayload): void {
		if (carriesMany(drag)) this.stop();
	}

	/** Escape lets the picked cards go and ends Select tasks; the menu over them takes its own Escape first. */
	onKey(e: KeyboardEvent): void {
		if (e.key === "Escape" && !this.menu && (this.selecting || this.selection.size > 0)) this.stop();
	}

	/** A press on an empty place lets the picked cards go; Select tasks keeps them until its cross. */
	onPress(target: EventTarget | null): void {
		if (this.menu || this.selecting || this.selection.size === 0) return;
		if (target instanceof Element && target.closest(KEEPS)) return;
		this.selection.clear();
	}

	private showCount(): void {
		const size = this.selection.size;
		this.count?.setText(String(size));
		this.count?.setOff(size === 0);
		this.menuButton?.setOff(size === 0);
	}

	/** The menu for the picked tasks: beside the clicked card's list, or over Select tasks' menu button. */
	private openMenu(at: "beside" | "over", card?: HTMLElement): void {
		const cards = this.selection.cards;
		const source = at === "beside" ? card : this.menuButton?.el;
		if (cards.length === 0 || !source) return;
		/** The tasks as the menu last saw them: labels set from it give them fresh keys, which the next action needs. */
		let items = cards.map((card) => card.item);
		const sections = this.deps.sections(cards);
		const each = (change: (item: TaskItem) => TaskChange) => {
			this.stop();
			return this.deps.apply(items.map((item) => ({ key: item.key, change: change(item) })));
		};
		this.menu = BulkMenu.open({
			items,
			cards: cards.map((card) => card.card),
			source,
			at,
			today: this.deps.today(),
			day: this.deps.day(),
			levels: this.deps.levels(),
			labels: this.deps.labels(),
			sections: sections ?? undefined,
			actions: {
				setStatus: (status) => each(() => ({ kind: "status", status })),
				setPriority: (priority) => each(() => ({ kind: "priority", priority })),
				postpone: (date) => each(() => ({ kind: "postpone", date })),
				removeDue: () => each((item) => (item.can.removeDue ? { kind: "dueDate", date: null } : { kind: "dueDate", date: item.dueDate })),
				setLabels: async (names) => {
					const written = await this.deps.setLabels(items.map((item, i) => ({ key: item.key, labels: names[i] })));
					this.selection.renew(items.flatMap((item, i) => (written[i] ? [{ from: item.key, to: written[i]!.key }] : [])));
					if (written.some((item) => item === null)) return null;
					items = written as TaskItem[];
					return items;
				},
				toSection: (name) => {
					this.stop();
					return this.deps.toSection(items.map((item) => item.key), name);
				},
				remove: () => each(() => ({ kind: "remove" })),
			},
			onClose: () => (this.menu = null),
		});
	}
}
