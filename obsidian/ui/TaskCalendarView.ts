import { ItemView, Scope, type WorkspaceLeaf } from "obsidian";
import { CalendarScreen, type ViewDeps } from "./CalendarScreen";

export type { ViewDeps } from "./CalendarScreen";

export const VIEW_TYPE = "task-calendar";

/** The plugin's own tab: the whole screen, Cmd+Z and Cmd+F its own while the tab is active. */
export class TaskCalendarView extends ItemView {
	private screen: CalendarScreen | null = null;

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
		const screen = this.addChild(new CalendarScreen(this.app, this.contentEl, this.deps, { view: true }));
		this.screen = screen;
		this.scope = new Scope(this.app.scope);
		this.scope.register(["Mod"], "z", () => screen.undoKey("undo"));
		this.scope.register(["Mod", "Shift"], "z", () => screen.undoKey("redo"));
		this.scope.register(["Mod"], "f", () => screen.findKey());
		await screen.open();
	}

	override async onClose(): Promise<void> {
		const screen = this.screen;
		this.screen = null;
		if (!screen) return;
		screen.close();
		this.removeChild(screen);
	}

	override onResize(): void {
		this.screen?.resize();
	}

	/** The quick field's editor while it has the focus: Obsidian's commands and hotkeys go to it. */
	get activeEditor(): CalendarScreen["activeEditor"] {
		return this.screen?.activeEditor ?? null;
	}
}
