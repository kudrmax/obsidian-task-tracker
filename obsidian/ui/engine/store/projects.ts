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
	/** The tree's row a carried card would be let go on, filled in the drop's colour (F221); null: none. */
	readonly treeOver: string | null;
	/** Where a project lifted in the tree, or the plus, would land: the gap's index among the rows and the depth its line is drawn at (F215, F226). */
	readonly treeGap: { readonly gap: number; readonly depth: number } | null;
	/** The project lifted in the tree (its node): its row dims while it rides under the finger. */
	readonly liftedProject: string | null;
	/** A new project's name typed at a gap of the tree, the plus let go there (F226). */
	readonly treeName: { readonly gap: number; readonly shift: number; readonly depth: number } | null;
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
	/** Cards (or the plus) lifted where the tree may take them: the port keeps the carry (F221–F226). */
	startCarry(ids: readonly string[], plus: boolean): void;
	/** The carrying finger at the narrow screen's left edge or over a row (null: neither): the port opens the panel or a row as the finger stays (F222–F224). */
	carryAt(edge: boolean, node: string | null): void;
	/** The carry let go on the row `node`, which takes the cards (F221). */
	carryOnNode(node: string): void;
	/** The carry let go elsewhere: nowhere (the lift's filter back, F225), or dropped in a list. */
	endCarry(how: "nowhere" | "dropped"): void;
	/** The row a carried card is over, lit when it takes cards. */
	setTreeOver(node: string | null): void;
	/** The gap a lifted project or the plus stands at, `shift` px sideways since the lift (null: off the tree). */
	setTreeGap(gap: number | null, shift: number): void;
	liftProject(node: string | null): void;
	/** The lifted project let go at `gap`, `shift` px sideways (null: nowhere, nothing written). */
	dropProject(gap: number | null, shift: number): void;
	/** The plus let go at a gap of the tree: a new project's name is typed there. */
	openTreeName(gap: number, shift: number): void;
	/** The new project's name ended: Enter with a name makes it there and chooses it; Escape (null) makes none. */
	endTreeName(name: string | null): void;
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
	/** Where the carrying finger was told last, and the wait the port asked for before it is told again. */
	let carried: { edge: boolean; node: string | null } | null = null;
	let carryWait = 0;
	/** The finger told again where it stays, once the port's wait is over: a row opens, the panel comes out. */
	const tell = () => {
		window.clearTimeout(carryWait);
		const at = carried;
		if (!at) return;
		void port.carryAt(at.edge, at.node).then((wait) => {
			if (carried !== at || wait === null) return;
			carryWait = window.setTimeout(() => carried === at && tell(), wait);
		});
	};
	const stopCarry = () => {
		carried = null;
		window.clearTimeout(carryWait);
	};
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
		treeOver: null,
		treeGap: null,
		liftedProject: null,
		treeName: null,
		startCarry(ids, plus) {
			if (!get().projects) return;
			carried = { edge: false, node: null };
			write(port.startCarry(ids, plus, wide));
		},
		carryAt(edge, node) {
			if (!carried || (carried.edge === edge && carried.node === node)) return;
			carried = { edge, node };
			tell();
		},
		carryOnNode(node) {
			if (!carried) return;
			stopCarry();
			set({ treeOver: null });
			write(port.carryOnNode(node));
		},
		endCarry(how) {
			if (!carried) return;
			stopCarry();
			set({ treeOver: null, treeGap: null });
			write(port.endCarry(how));
		},
		setTreeOver(node) {
			const row = node === null ? null : get().projects?.panel.rows.find((r) => r.node === node);
			const over = row?.takesTask ? row.node : null;
			if (get().treeOver !== over) set({ treeOver: over });
		},
		setTreeGap(gap, shift) {
			const landing = gap === null ? null : port.treeLanding(gap, shift, get().liftedProject);
			const next = landing && gap !== null ? { gap, depth: landing.depth } : null;
			const was = get().treeGap;
			if (was?.gap !== next?.gap || was?.depth !== next?.depth) set({ treeGap: next });
		},
		liftProject(node) {
			set({ liftedProject: node, treeGap: null });
		},
		dropProject(gap, shift) {
			const node = get().liftedProject;
			set({ liftedProject: null, treeGap: null });
			if (node !== null && gap !== null && port.treeLanding(gap, shift, node)) write(port.moveProject(node, gap, shift));
		},
		openTreeName(gap, shift) {
			const landing = port.treeLanding(gap, shift, null);
			set({ treeGap: null, treeName: landing && { gap, shift, depth: landing.depth } });
		},
		endTreeName(name) {
			const at = get().treeName;
			set({ treeName: null });
			write(at && name !== null ? port.createProject(name, at.gap, at.shift) : port.endCarry("nowhere"));
		},
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
