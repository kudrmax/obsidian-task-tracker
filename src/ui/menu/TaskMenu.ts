import type { TaskItem } from "../../application/contracts";
import type { PriorityColor, PriorityLevel } from "../../settings";
import { dayMonth } from "../dates";
import { DURATION, tokenMs, tokenPx } from "../design";
import { clear, el, px } from "../dom";
import { fillCard } from "../TaskCard";
import { grownStart, roomWidth, showWhole, windowRoom } from "../wholeCard";
import type { LocalDate, TaskStatus } from "../types";
import { Backdrop } from "./Backdrop";
import { dueOptions } from "./dueOptions";
import { backRow, levelRow, menuGroup, type MenuRowSpec, menuRow, placePanel } from "./MenuPanel";
import type { MenuIconName } from "./menuIcons";
import { MonthPicker } from "./MonthPicker";

export type MenuRowId = "progress" | "done" | "wontdo" | "due" | "priority" | "rename" | "delete";

export interface MenuRow {
	readonly id: MenuRowId;
	readonly label: string;
	readonly value: string;
	readonly dot: PriorityColor | null;
	readonly icon: MenuIconName;
	readonly danger: boolean;
}

/** The three groups of the task menu, as the board lists them. */
export function menuRows(item: TaskItem): readonly (readonly MenuRow[])[] {
	const row = (id: MenuRowId, label: string, icon: MenuIconName, value = "", danger = false): MenuRow => ({ id, label, value, dot: null, icon, danger });
	const priority: MenuRow = { ...row("priority", "Priority", "priority", item.priority?.prefix ?? ""), dot: item.priority?.color ?? null };
	return [
		[row("progress", item.status === "inProgress" ? "Stop progress" : "In progress", "progress"), row("done", "Done", "done"), row("wontdo", "Won’t do", "wontdo")],
		[row("due", "Due date", "due", item.dueDate ? dayMonth(item.dueDate) : ""), priority, row("rename", "Rename", "rename")],
		[row("delete", "Delete", "delete", "", true)],
	];
}

export interface LevelRow extends PriorityLevel {
	readonly on: boolean;
}

/** The priority submenu's levels, in the settings' order, the task's own checked. */
export function priorityRows(item: TaskItem, levels: readonly PriorityLevel[]): readonly LevelRow[] {
	return levels.map((level) => ({ prefix: level.prefix, color: level.color, on: level.prefix === item.priority?.prefix }));
}

export interface MenuActions {
	setStatus(status: TaskStatus): Promise<void>;
	setDueDate(date: LocalDate | null): Promise<void>;
	setPriority(prefix: string | null): Promise<void>;
	rename(): void;
	remove(): Promise<void>;
}

export interface TaskMenuContext {
	readonly item: TaskItem;
	/** The card or block tapped; a copy of it stays over the backdrop, grown only to show a title the card cuts. */
	readonly source: HTMLElement;
	readonly today: LocalDate;
	/** The day on screen: the copy of a card leaves out a due date on it, as the list does. */
	readonly day: LocalDate;
	/** The priority levels the submenu offers. */
	readonly levels: readonly PriorityLevel[];
	readonly actions: MenuActions;
	/** Dresses the copy over the blur: a selected timeline card gives its copy the dots that stretch it. */
	readonly lifted?: (copy: HTMLElement, close: () => void) => void;
	/** `picker`: the menu opens on its date picker (a card dropped on Pick a date). */
	readonly opening?: "picker";
}

/** The task menu over a blurred screen: the tapped card stays as it is above the blur, the panel grows out under it; the due submenu and the month picker take its place. */
export class TaskMenu {
	private readonly backdrop: Backdrop;
	private readonly lifted: HTMLElement;
	private readonly panel: HTMLElement;
	private readonly anchor: DOMRect;
	private closed = false;

	static open(context: TaskMenuContext): TaskMenu {
		return new TaskMenu(context);
	}

	private constructor(private readonly context: TaskMenuContext) {
		this.backdrop = new Backdrop(() => this.close());
		this.lifted = el(document.body, "div", "tc-lifted");
		if (context.source.classList.contains("tc-block")) {
			this.lifted.classList.add("is-block");
			this.lifted.appendChild(context.source.cloneNode(true));
		} else fillCard(this.lifted, context.item, { day: context.day });
		this.anchor = this.liftWhole(context.source.getBoundingClientRect());
		context.lifted?.(this.lifted, () => this.close());
		this.panel = el(document.body, "div", "tc-panel");
		if (context.opening === "picker") this.showPicker();
		else this.showMenu();
		requestAnimationFrame(() => this.panel.classList.add("is-shown"));
	}

	/** The copy stands where the card does; a title the card cuts grows it past the column, kept inside the window, and the panel goes by the copy. */
	private liftWhole(card: DOMRect): DOMRect {
		const room = windowRoom(this.lifted);
		const size = showWhole(this.lifted, card, roomWidth(room));
		const left = grownStart(card.left, card.width, size.width, room.width, room.margin);
		const top = grownStart(card.top, card.height, size.height, room.height, room.margin);
		this.lifted.style.left = px(left);
		this.lifted.style.top = px(top);
		return new DOMRect(left, top, size.width, size.height);
	}

	private place(): void {
		placePanel(this.panel, this.anchor, tokenPx(this.panel, "--tc-menu-gap"), window.innerHeight);
	}

	private pick(action: () => void | Promise<void>): () => void {
		return () => {
			this.close();
			void action();
		};
	}

	private showMenu(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { item, actions } = this.context;
		const nextStatus: TaskStatus = item.status === "inProgress" ? "todo" : "inProgress";
		const handlers: Record<MenuRowId, () => void> = {
			progress: this.pick(() => actions.setStatus(nextStatus)),
			done: this.pick(() => actions.setStatus("done")),
			wontdo: this.pick(() => actions.setStatus("cancelled")),
			due: () => this.showDue(),
			priority: () => this.showPriority(),
			rename: this.pick(() => actions.rename()),
			delete: this.pick(() => actions.remove()),
		};
		for (const group of menuRows(item)) menuGroup(this.panel, group.map((row): MenuRowSpec => ({ label: row.label, value: row.value, dot: row.dot, icon: row.icon, danger: row.danger, onPick: handlers[row.id] })));
		this.place();
	}

	private showDue(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { item, actions, today } = this.context;
		const options = dueOptions(today, item.dueDate);
		backRow(this.panel, "Due date", () => this.showMenu());
		const choose = (date: LocalDate) => this.pick(() => actions.setDueDate(date));
		menuGroup(this.panel, [
			{ label: "Today", value: options.today.label, onPick: choose(options.today.value) },
			{ label: "Tomorrow", value: options.tomorrow.label, onPick: choose(options.tomorrow.value) },
			{ label: "Next week", value: options.nextWeek.label, onPick: choose(options.nextWeek.value) },
			{ label: "Pick a date", value: options.pick.label, onPick: () => this.showPicker() },
		]);
		if (options.canRemove) menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row is-tall is-apart");
		this.place();
	}

	private showPriority(): void {
		clear(this.panel);
		this.panel.classList.remove("is-picker");
		const { item, actions, levels } = this.context;
		backRow(this.panel, "Priority", () => this.showMenu());
		const group = el(this.panel, "div", "tc-menu-group");
		for (const level of priorityRows(item, levels)) {
			levelRow(group, { color: level.color, label: level.prefix, on: level.on, onPick: this.pick(() => actions.setPriority(level.prefix)) });
		}
		if (item.priority) menuRow(this.panel, { label: "Remove priority", icon: "removeDue", onPick: this.pick(() => actions.setPriority(null)) }, "tc-menu-row is-tall is-apart");
		this.place();
	}

	private showPicker(): void {
		clear(this.panel);
		this.panel.classList.add("is-picker");
		const { item, actions, today } = this.context;
		new MonthPicker(el(this.panel, "div"), {
			month: item.dueDate ?? today,
			today,
			selected: item.dueDate,
			onPick: (date) => this.pick(() => actions.setDueDate(date))(),
			variant: "menu",
		});
		if (dueOptions(today, item.dueDate).canRemove) {
			menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row tc-picker-remove");
		}
		this.place();
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.backdrop.el.classList.remove("is-shown");
		this.panel.classList.add("is-closing");
		this.panel.classList.remove("is-shown");
		window.setTimeout(() => {
			this.backdrop.remove();
			this.lifted.remove();
			this.panel.remove();
		}, tokenMs(this.panel, DURATION.collapse));
	}
}
