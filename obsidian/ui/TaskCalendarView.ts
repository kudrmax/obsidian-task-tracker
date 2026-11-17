import { ItemView, Scope, type WorkspaceLeaf } from "obsidian";
import type { ViewDeps } from "./CalendarScreen";
import { type MountedScreen, mountScreen } from "./screen/mountScreen";

export type { ViewDeps } from "./CalendarScreen";

export const VIEW_TYPE = "task-calendar";

/** The plugin's own tab: the whole screen (`TaskScreen`, place main); Cmd+Z its own while the tab is active. */
export class TaskCalendarView extends ItemView {
	private screen: MountedScreen | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly deps: ViewDeps,
	) {
		super(leaf);
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
		this.contentEl.empty();
		this.contentEl.addClass("tc-view");
		const screen = mountScreen(this.contentEl, this.deps, { kind: "main" });
		this.screen = screen;
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", () => void screen.store.getState().undo());
		await screen.store.getState().refresh();
	}

	override async onClose(): Promise<void> {
		this.screen?.unmount();
		this.screen = null;
	}

	override onResize(): void {
		this.screen?.refit();
	}
}
