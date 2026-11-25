import { DESIGN } from "../../shared/design";
import type { DividerStop, ProjectsData, ScreenPort } from "../port";

/** The project menu open over the filter's name (F216–F219): its page, the menu or Delete's question. */
export interface ProjectMenuState {
	readonly asking: boolean;
}

/** What the store keeps of the projects (F205–F219): the port's projects, the project menu, the name renamed in place. */
export interface ProjectsState {
	/** The projects' panel, the filter and the top row as the port gives them; null for a screen fixed to its project (a note's block). */
	readonly projects: ProjectsData | null;
	readonly projectMenu: ProjectMenuState | null;
	/** The filter's name is its own field (Rename, F216). */
	readonly renamingProject: boolean;
	/** The docked tree's width as its divider set it (F54), px; null: the design's. Kept on the device by the host. */
	readonly treeWidth: number | null;
	/** The tree's divider is dragged and no step into the middle or out of it glides now: the width follows the hand at once. */
	readonly treeFollow: boolean;
}

export interface ProjectsActions {
	/** The folder button (F205): the panel opens or closes. */
	togglePanel(): void;
	/** The dim around the panel tapped (F207): it closes, nothing chosen. */
	closePanel(): void;
	/** A row of the tree tapped (F213). */
	pickNode(node: string): void;
	/** The cross beside the filter's name (F208). */
	clearFilter(): void;
	/** The filter's name tapped (F216): its menu, where the port offers one. */
	openProjectMenu(): void;
	closeProjectMenu(): void;
	/** Delete project asks first in the menu's place (F219); null takes the question back. */
	askDeleteProject(asking: boolean): void;
	/** Delete's question confirmed: the project goes, the choice goes to All. */
	deleteProject(): void;
	/** Folder's switch (F217): the menu closes and the switch is written. */
	toggleProjectFolder(): void;
	/** A note attached by its link, or the attached one taken off (null) (F218). */
	setProjectNote(link: string | null): void;
	/** Rename (F216): the menu closes and the name becomes its field. */
	startProjectRename(): void;
	/** The name's field ended: Enter with `name` writes it (another project's name is refused by the port), Escape (null) writes nothing. */
	endProjectRename(name: string | null): void;
	/** The tree's width that puts its divider in the middle of a view `viewWidth` wide (the port's rule, as the list's divider's). */
	treeMiddle(viewWidth: number): number;
	/** The tree's divider dragged to make it `wanted` wide at `speed` px/ms: where the port's rule stands it (F54). */
	dragTree(wanted: number, viewWidth: number, speed: number): DividerStop;
	followTree(follow: boolean): void;
}

/** The store's projects part, over its port and its one way to change and to write. */
export function projectsSlice(
	port: ScreenPort,
	wide: boolean,
	treeWidth: number | null,
	get: () => ProjectsState & { readonly layer: unknown; readonly viewMenu: boolean },
	set: (patch: Partial<ProjectsState> & { readonly layer?: null; readonly viewMenu?: boolean }) => void,
	write: (done: Promise<unknown>) => void,
): ProjectsState & ProjectsActions {
	const menuName = () => get().projects?.filter?.menu?.name ?? null;
	/** The menu closes and `act` writes over the project it was opened on. */
	const fromMenu = (act: (name: string) => Promise<unknown>) => {
		const name = menuName();
		set({ projectMenu: null });
		if (name !== null) write(act(name));
	};
	return {
		projects: port.projects(wide),
		projectMenu: null,
		renamingProject: false,
		treeWidth,
		treeFollow: false,
		treeMiddle(viewWidth) {
			return port.listWidths(0, viewWidth, DESIGN.dividerWidth).center;
		},
		dragTree(wanted, viewWidth, speed) {
			const widths = port.listWidths(wanted / (viewWidth - DESIGN.dividerWidth), viewWidth, DESIGN.dividerWidth);
			const stop = port.dividerAt(wanted, widths, speed);
			if (stop.width !== get().treeWidth) set({ treeWidth: stop.width });
			return stop;
		},
		followTree(follow) {
			if (get().treeFollow !== follow) set({ treeFollow: follow });
		},
		togglePanel() {
			const panel = get().projects?.panel;
			if (panel) write(port.setPanel(!panel.open));
		},
		closePanel() {
			if (get().projects?.panel.open) write(port.setPanel(false));
		},
		pickNode(node) {
			write(port.pickNode(node, wide));
		},
		clearFilter() {
			write(port.clearFilter());
		},
		openProjectMenu() {
			if (get().projects?.filter?.menu) set({ projectMenu: { asking: false }, layer: null, viewMenu: false });
		},
		closeProjectMenu() {
			if (get().projectMenu) set({ projectMenu: null });
		},
		askDeleteProject(asking) {
			if (get().projectMenu) set({ projectMenu: { asking } });
		},
		deleteProject() {
			fromMenu((name) => port.deleteProject(name));
		},
		toggleProjectFolder() {
			const folder = get().projects?.filter?.menu?.folder;
			if (folder && !folder.disabled) fromMenu((name) => port.setProjectFolder(name, !folder.on));
		},
		setProjectNote(link) {
			fromMenu((name) => port.setProjectNote(name, link));
		},
		startProjectRename() {
			if (menuName() !== null) set({ projectMenu: null, renamingProject: true });
		},
		endProjectRename(name) {
			const from = menuName();
			set({ renamingProject: false });
			if (name !== null && from !== null) write(port.renameProject(from, name));
		},
	};
}
