import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { type CalendarService, type DayView, StaleTaskError, TasksFileMissingError, type TaskService } from "../application/contracts";
import type { Clock, SettingsStore } from "../application/ports";
import { LIST_WIDTH_MAX, LIST_WIDTH_MIN, type RightMode } from "../settings";
import { addDays, localDateOf } from "./dates";
import { DayHeader } from "./DayHeader";
import { dayTitle } from "./dayTitle";
import { PROPERTY } from "./design";
import { Divider } from "./Divider";
import { clear, el, px } from "./dom";
import { NewTaskButton } from "./NewTaskButton";
import type { LocalDate } from "./types";

export const VIEW_TYPE = "task-calendar";
const MINUTE_MS = 60_000;

export interface ViewDeps {
	readonly tasks: TaskService;
	readonly calendars: CalendarService;
	readonly settings: SettingsStore;
	readonly clock: Clock;
}

/** The screen: the day row, the list of the day on the left, the day's timeline or the Soon list on the right. */
export class TaskCalendarView extends ItemView {
	private selectedDate: LocalDate;
	private header: DayHeader | null = null;
	private leftEl: HTMLElement | null = null;
	private rightEl: HTMLElement | null = null;
	private newTask: NewTaskButton | null = null;
	private newSoon: NewTaskButton | null = null;
	private day: DayView | null = null;
	private missing = false;
	private unsubscribe: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: ViewDeps,
	) {
		super(leaf);
		this.selectedDate = this.today();
	}

	override getViewType(): string {
		return VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "Task Calendar";
	}

	override getIcon(): string {
		return "calendar-days";
	}

	override async onOpen(): Promise<void> {
		const root = this.contentEl;
		clear(root);
		root.classList.add("task-calendar", "tc-view");
		root.style.setProperty(PROPERTY.listWidth, px(this.settings.listWidth));
		this.header = new DayHeader(root, {
			title: () => dayTitle(this.selectedDate, this.today()),
			onStep: (days) => this.select(addDays(this.selectedDate, days)),
			onToday: () => this.select(this.today()),
			mode: () => this.settings.rightMode,
			onMode: (mode) => void this.setMode(mode),
		});
		this.leftEl = el(root, "div", "tc-left");
		new Divider(el(root, "div"), {
			width: () => this.settings.listWidth,
			onWidth: (width) => root.style.setProperty(PROPERTY.listWidth, px(width)),
			onRelease: (width) => void this.deps.settings.update({ listWidth: width }).then(() => this.render()),
			min: LIST_WIDTH_MIN,
			max: LIST_WIDTH_MAX,
		});
		this.rightEl = el(root, "div", "tc-right");
		this.newTask = new NewTaskButton(root, false, { onCreate: (text) => this.act(() => this.deps.tasks.createInList(this.selectedDate, text)) });
		this.newSoon = new NewTaskButton(root, true, { onCreate: (text) => this.act(() => this.deps.tasks.createInSoon(text)) });
		this.unsubscribe = this.deps.tasks.onChange(() => void this.refresh());
		this.registerInterval(window.setInterval(() => this.render(), MINUTE_MS));
		requestAnimationFrame(() => this.measureNavigation());
		await this.refresh();
	}

	override async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	override onResize(): void {
		this.measureNavigation();
	}

	private get settings() {
		return this.deps.settings.get();
	}

	private today(): LocalDate {
		return localDateOf(this.deps.clock.now());
	}

	/** Obsidian's phone navigation floats over the content; what is pinned to the bottom stays above it. */
	private measureNavigation(): void {
		const nav = document.querySelector(".mobile-navbar");
		const root = this.contentEl.getBoundingClientRect();
		const clear = nav ? Math.max(0, root.bottom - nav.getBoundingClientRect().top) : 0;
		this.contentEl.style.setProperty(PROPERTY.navClear, px(nav && nav.getBoundingClientRect().height > 0 ? clear : 0));
	}

	private select(date: LocalDate): void {
		this.selectedDate = date;
		void this.refresh();
	}

	private async setMode(mode: RightMode): Promise<void> {
		await this.deps.settings.update({ rightMode: mode });
		this.render();
	}

	/** Runs one change to the file; a task changed under us is reported and the view redrawn. */
	private async act(change: () => Promise<void>): Promise<void> {
		try {
			await change();
		} catch (error) {
			if (error instanceof StaleTaskError) {
				new Notice(error.message);
				await this.refresh();
			} else throw error;
		}
	}

	private async refresh(): Promise<void> {
		try {
			this.day = await this.deps.tasks.dayView(this.selectedDate);
			this.missing = false;
		} catch (error) {
			if (!(error instanceof TasksFileMissingError)) throw error;
			this.missing = true;
			this.day = null;
		}
		this.render();
	}

	render(): void {
		const root = this.contentEl;
		if (!this.header || !this.leftEl || !this.rightEl || !this.newTask || !this.newSoon) return;
		this.header.render();
		root.classList.toggle("is-missing", this.missing);
		const soon = this.settings.rightMode === "soon";
		this.newSoon.el.style.display = soon && !this.missing ? "" : "none";
		this.newTask.el.style.display = this.missing ? "none" : "";
		this.leftEl.style.display = this.missing ? "none" : "";
		this.rightEl.style.display = this.missing ? "none" : "";
		root.querySelector(".tc-missing")?.remove();
		if (this.missing) this.renderMissing(root);
		this.leftEl.classList.toggle("is-empty", !this.day?.list.length);
	}

	private renderMissing(root: HTMLElement): void {
		const box = el(root, "div", "tc-missing");
		el(box, "div", "", `No tasks file at ${this.settings.tasksFile}`);
		const button = el(box, "button", "tc-missing-btn", "Create file");
		button.addEventListener("click", () => void this.act(() => this.deps.tasks.createFile()));
	}

}
