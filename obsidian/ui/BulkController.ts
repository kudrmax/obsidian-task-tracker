import { type GroupName, keyId, type MenuStatusId, type PickedTask, type TaskItem, type TaskKey, type TaskMenuModel } from "../../core/application/contracts";
import { carriesMany, type DropTarget, type TaskDragPayload } from "./drag/DropTarget";
import { BulkMenu } from "./menu/BulkMenu";
import { el } from "./dom";
import { Button } from "./kit/Button";
import { PlusRing } from "./quick/PlusRing";
import { type PickedCard, pickMark, TaskSelection } from "./TaskSelection";
import type { LocalDate } from "./types";

export interface BulkDeps {
	/** The view's content: the cancel ring goes in it, where the plus stands, and so do the buttons of Select tasks. */
	readonly root: HTMLElement;
	/** A status tile (`TaskService.pickStatus`); resolves once the screen shows it. */
	pickStatus(keys: readonly TaskKey[], id: MenuStatusId): Promise<void>;
	/** A move (`TaskService.postponeAll`); resolves once the screen shows it. */
	postpone(keys: readonly TaskKey[], date: LocalDate): Promise<void>;
	/** Delete N tasks (`TaskService.removeAll`); resolves once the screen shows it. */
	remove(keys: readonly TaskKey[]): Promise<void>;
	today(): LocalDate;
	/** The day the day column shows. */
	day(): LocalDate;
	/** The bulk menu of the picked tasks as they now stand, each with the column its card stands in (`TaskService.bulkMenu`). */
	menu(picked: readonly PickedTask[]): TaskMenuModel;
	/** A level tapped (`TaskService.togglePriority`); resolves once the screen shows it. */
	togglePriority(keys: readonly TaskKey[], prefix: string): Promise<void>;
	/** A label tapped (`TaskService.toggleLabel`): the screen shows it, and it resolves with the tasks as they then stand, null for one gone. */
	toggleLabel(keys: readonly TaskKey[], name: string): Promise<readonly (TaskItem | null)[]>;
	/** Remove due date (`TaskService.removeDue`); resolves once the screen shows it. */
	removeDue(keys: readonly TaskKey[]): Promise<void>;
	/** The picked tasks that go along when `lifted` is carried (`TaskService.carried`). */
	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[];
	/** The cards of the list `card` stands in, in order: a Shift-click picks a run of them. */
	cards(card: PickedCard): readonly HTMLElement[];
	/** The tasks into section `name` of their list, and resolves once the screen shows them. */
	toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
	/** The tasks' project (`TaskService.setProject`), and resolves once the screen shows it. */
	setProject(keys: readonly TaskKey[], project: string | null): Promise<void>;
	/** «New project…» named `name` for `keys` (`TaskService.newProject`). */
	newProject(keys: readonly TaskKey[], name: string): Promise<void>;
	/** A project toggled on `items` (`TaskService.toggleProject`): the tasks as they then stand, null for one gone. */
	toggleProject(items: readonly TaskItem[], name: string): Promise<readonly (TaskItem | null)[]>;
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
			const column = this.deps.cards(card).flatMap((el) => selection.cardOf(el) ?? []);
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
		const picked = this.selection.cards;
		const along = new Set(this.deps.carried(item.key, picked.map((p) => p.item.key)).map(keyId));
		return picked.filter((p) => along.has(keyId(p.item.key)));
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
		const keys = () => items.map((item) => item.key);
		/** A pick on the picked tasks lets them go and ends Select tasks; a label tap alone keeps them, as it keeps the menu. */
		const done = (write: (keys: readonly TaskKey[]) => Promise<void>) => {
			const picked = keys();
			this.stop();
			return write(picked);
		};
		this.menu = BulkMenu.open({
			items,
			cards: cards.map((card) => card.card),
			source,
			at,
			today: this.deps.today(),
			day: this.deps.day(),
			menu: (now) => this.deps.menu(now.map((item, i) => ({ item, from: cards[i].column }))),
			actions: {
				pickStatus: (id) => done((picked) => this.deps.pickStatus(picked, id)),
				togglePriority: (prefix) => done((picked) => this.deps.togglePriority(picked, prefix)),
				postpone: (date) => done((picked) => this.deps.postpone(picked, date)),
				removeDue: () => done((picked) => this.deps.removeDue(picked)),
				toggleLabel: async (name) => {
					const written = await this.deps.toggleLabel(keys(), name);
					this.selection.renew(items.flatMap((item, i) => (written[i] ? [{ from: item.key, to: written[i]!.key }] : [])));
					if (written.some((item) => item === null)) return null;
					items = written as TaskItem[];
					return items;
				},
				toSection: (name) => done((picked) => this.deps.toSection(picked, name)),
				setProject: (project) => done((picked) => this.deps.setProject(picked, project)),
				newProject: (name) => done((picked) => this.deps.newProject(picked, name)),
				toggleProject: async (name) => {
					const written = await this.deps.toggleProject(items, name);
					this.selection.renew(items.flatMap((item, i) => (written[i] ? [{ from: item.key, to: written[i]!.key }] : [])));
					if (written.some((item) => item === null)) return null;
					items = written as TaskItem[];
					return items;
				},
				remove: () => done((picked) => this.deps.remove(picked)),
			},
			onClose: () => (this.menu = null),
		});
	}
}
