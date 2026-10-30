import type { TaskItem } from "../../application/contracts";
import { dayMonth } from "../dates";
import { DURATION, tokenMs, tokenPx } from "../design";
import { clear, el, px } from "../dom";
import { fillCard } from "../TaskCard";
import type { LocalDate, TaskStatus } from "../types";
import { Backdrop } from "./Backdrop";
import { dueOptions } from "./dueOptions";
import { backRow, menuGroup, type MenuRowSpec, menuRow, placePanel } from "./MenuPanel";
import type { MenuIconName } from "./menuIcons";
import { MonthPicker } from "./MonthPicker";

export type MenuRowId = "progress" | "done" | "wontdo" | "due" | "rename" | "delete";

export interface MenuRow {
	readonly id: MenuRowId;
	readonly label: string;
	readonly value: string;
	readonly icon: MenuIconName;
	readonly danger: boolean;
}

/** The three groups of the task menu, as the board lists them. */
export function menuRows(item: TaskItem): readonly (readonly MenuRow[])[] {
	const row = (id: MenuRowId, label: string, icon: MenuIconName, value = "", danger = false): MenuRow => ({ id, label, value, icon, danger });
	return [
		[row("progress", item.status === "inProgress" ? "Stop progress" : "In progress", "progress"), row("done", "Done", "done"), row("wontdo", "Won’t do", "wontdo")],
		[row("due", "Due date", "due", item.dueDate ? dayMonth(item.dueDate) : ""), row("rename", "Rename", "rename")],
		[row("delete", "Delete", "delete", "", true)],
	];
}

export interface MenuActions {
	setStatus(status: TaskStatus): Promise<void>;
	setDueDate(date: LocalDate | null): Promise<void>;
	rename(): void;
	remove(): Promise<void>;
}

export interface TaskMenuContext {
	readonly item: TaskItem;
	/** The card or block tapped; a copy of it stays, unchanged, over the backdrop. */
	readonly source: HTMLElement;
	readonly today: LocalDate;
	readonly actions: MenuActions;
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
		this.anchor = context.source.getBoundingClientRect();
		this.lifted = el(document.body, "div", "tc-lifted");
		if (context.source.classList.contains("tc-block")) {
			this.lifted.classList.add("is-block");
			if (context.item.status === "inProgress") el(this.lifted, "span", "tc-strip");
			el(this.lifted, "div", "tc-item-title", context.item.text);
		} else fillCard(this.lifted, context.item, { showDue: true });
		this.lifted.style.left = px(this.anchor.left);
		this.lifted.style.top = px(this.anchor.top);
		this.lifted.style.width = px(this.anchor.width);
		this.lifted.style.height = px(this.anchor.height);
		this.panel = el(document.body, "div", "tc-panel");
		this.showMenu();
		requestAnimationFrame(() => this.panel.classList.add("is-shown"));
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
			rename: this.pick(() => actions.rename()),
			delete: this.pick(() => actions.remove()),
		};
		for (const group of menuRows(item)) menuGroup(this.panel, group.map((row): MenuRowSpec => ({ label: row.label, value: row.value, icon: row.icon, danger: row.danger, onPick: handlers[row.id] })));
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
		menuRow(this.panel, { label: "Remove due date", icon: "removeDue", onPick: this.pick(() => actions.setDueDate(null)) }, "tc-menu-row tc-picker-remove");
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
