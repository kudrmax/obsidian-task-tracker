import { levelsFor, type TaskService, type ViewChoice, type ViewMode, type Zoom, type ZoomLevel } from "../../core/application/contracts";

/**
 * The device's own part of the plugin's settings, under the keys the old screen keeps (`obsidian/ui/viewSettings.ts`,
 * `DEVICE_KEYS`, which `PluginSettings` keeps in Obsidian's local storage under `task-calendar:device`): the divider's
 * share, the zoom, the projects tree's width.
 */
export interface DeviceViewKeys {
	get(): { readonly listShare: number; readonly zoom: Zoom; readonly treeWidth: number | null };
	update(patch: Partial<{ readonly listShare: number; readonly zoom: Zoom; readonly treeWidth: number | null }>): Promise<void>;
}

/**
 * What this device keeps of the screen, read where the old screen reads it (the plan's step 5): the divider, the zoom and
 * the tree's width from the plugin's device keys; the view mode, a note block's mode and Subprojects from the core's
 * Projects screen (`ProjectsScreenStore`, kept under `task-calendar:projects-screen`), through `TaskService`. Nothing is
 * kept twice and no key is new.
 */
export class DeviceSettings {
	constructor(
		private readonly view: DeviceViewKeys,
		private readonly tasks: TaskService,
		private readonly zoomLevels: () => readonly ZoomLevel[],
	) {}

	/** The calendar's zoom as the engine mounts it: the one kept, how to keep a new one, and the largest hour of the settings' levels. */
	zoom(): { readonly kept: Zoom | null; keep(zoom: Zoom): void; readonly most: number } {
		const levels = levelsFor(0, this.zoomLevels());
		return { kept: this.view.get().zoom, keep: (zoom) => void this.view.update({ zoom }), most: levels[levels.length - 1].hourPx };
	}

	listShare(): number {
		return this.view.get().listShare;
	}

	keepListShare(listShare: number): Promise<void> {
		return this.view.update({ listShare });
	}

	treeWidth(): number | null {
		return this.view.get().treeWidth;
	}

	keepTreeWidth(treeWidth: number | null): Promise<void> {
		return this.view.update({ treeWidth });
	}

	/** The view mode, a note block's own (`note`), and the Subprojects row, as the device keeps them. */
	viewOf(wide: boolean, note: boolean): ViewChoice {
		return this.tasks.firstView(wide, note);
	}

	keepView(mode: ViewMode, note: boolean): Promise<void> {
		return note ? this.tasks.setNoteViewMode(mode) : this.tasks.setViewMode(mode);
	}

	toggleSubprojects(): Promise<void> {
		return this.tasks.toggleSubprojects();
	}
}
