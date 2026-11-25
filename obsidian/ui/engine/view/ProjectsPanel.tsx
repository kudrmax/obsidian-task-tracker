import { type PointerEvent, memo, type ReactNode, type RefObject, useRef, useState } from "react";
import { DESIGN } from "../../shared/design";
import { TREE_DIVIDER, useDivider } from "../gestures/Divider";
import { ControlMenu } from "../layers/Layers";
import { drawnWidths } from "../layout/columns";
import type { ProjectMenuData, TreeRow } from "../port";
import { useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { Row, RowGroup } from "./MenuRows";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * The projects over the main screen (F205–F219, boards in docs/design/canvas/projects-one-view/ and projects-screen/): the
 * folder button, the filter's name with its cross and its menu, and the tree's panel; each drawn from the port's
 * projects, none on a screen fixed to its project.
 */
export const ProjectsChrome = memo(function ProjectsChrome() {
	const shown = useScreen((s) => s.projects !== null);
	if (!shown) return null;
	return (
		<>
			<TreePanel />
			<FolderButton />
			<Filter />
		</>
	);
});

/** The folder button (F205): opens and closes the panel, filled while it shows. */
function FolderButton() {
	const api = useScreenApi();
	const open = useScreen((s) => s.projects?.panel.open ?? false);
	return (
		<button type="button" className={`tc-btn tc-folder-btn${open ? " is-on" : ""}`} aria-label="Projects" aria-pressed={open} onClick={() => api.getState().togglePanel()}>
			<Icon name="project" />
		</button>
	);
}

/** The filter over the tasks (F208, F216): the node's name, big, tapped for its menu; the cross clearing it; Rename's field in its place. */
function Filter() {
	const api = useScreenApi();
	const filter = useScreen((s) => s.projects?.filter ?? null);
	const renaming = useScreen((s) => s.renamingProject);
	const [title, setTitle] = useState<HTMLButtonElement | null>(null);
	if (!filter) return null;
	return (
		<>
			<div className={`tc-filter${renaming ? " is-renaming" : ""}`}>
				<button ref={setTitle} type="button" className={`tc-btn tc-filter-title${filter.menu ? " has-menu" : ""}`} disabled={!filter.menu} onClick={() => api.getState().openProjectMenu()}>
					{filter.title}
				</button>
				{filter.clearable ? (
					<button type="button" className="tc-btn is-icon is-quiet tc-filter-clear" aria-label="Show all tasks" onClick={() => api.getState().clearFilter()}>
						<Icon name="cross" />
					</button>
				) : null}
			</div>
			{renaming ? <NameField name={filter.title} /> : null}
			{filter.menu ? <ProjectMenu menu={filter.menu} reference={title} /> : null}
		</>
	);
}

/** Rename's field where the name stood (F216): Enter writes the name, Escape and a tap elsewhere leave it. */
function NameField({ name }: { readonly name: string }) {
	const api = useScreenApi();
	const ended = useRef(false);
	const end = (to: string | null) => {
		if (ended.current) return;
		ended.current = true;
		api.getState().endProjectRename(to);
	};
	return (
		<div className="tc-filter-field">
			<ObsidianEditor text={name} className="tc-quick-field tc-title-field is-section" onEnter={(text) => end(text)} onEscape={() => end(null)} onLeave={() => end(null)} />
		</div>
	);
}

/**
 * The project menu over its name (F216–F219): Rename, Folder's switch with why it can't be turned on, the note (Attach
 * note…, or its name and Detach), and Delete project apart in red, which asks first in its own place.
 */
function ProjectMenu({ menu, reference }: { readonly menu: ProjectMenuData; readonly reference: HTMLElement | null }) {
	const api = useScreenApi();
	const { layerRoot, notes } = useHost();
	const state = useScreen((s) => s.projectMenu);
	const steps = api.getState();
	const attach = () => {
		if (!notes) return;
		steps.closeProjectMenu();
		void notes.pick().then((link) => link !== null && api.getState().setProjectNote(link));
	};
	const groups: ReactNode[] = state?.asking
		? [<DeleteAsk key="ask" menu={menu} />]
		: [
				<RowGroup key="rename" rows={[{ label: menu.renameLabel, icon: "rename", onPick: () => steps.startProjectRename() }]} />,
				<FolderSwitch key="folder" folder={menu.folder} onToggle={() => steps.toggleProjectFolder()} />,
				menu.note ? (
					<RowGroup
						key="note"
						rows={[
							{
								label: menu.note.name,
								icon: "openFile",
								onPick: () => {
									steps.closeProjectMenu();
									notes?.open(menu.note!.link);
								},
							},
							{ label: menu.detachLabel, onPick: () => steps.setProjectNote(null) },
						]}
					/>
				) : notes ? (
					<RowGroup key="note" rows={[{ label: menu.attachLabel, icon: "openFile", onPick: attach }]} />
				) : null,
				<Row key="delete" label={menu.remove.label} icon="delete" className="is-danger is-apart" onPick={() => steps.askDeleteProject(true)} />,
			];
	return <ControlMenu open={state !== null} onClose={() => api.getState().closeProjectMenu()} root={layerRoot} reference={reference} label={menu.name} title={null} below panelClass="is-menu is-project-menu" copy={<div className="tc-filter-title is-copy">{menu.name}</div>} groups={groups} />;
}

/** Folder (F217): a switch row; while it can't be turned on, dim, its reason under the word. */
function FolderSwitch({ folder, onToggle }: { readonly folder: ProjectMenuData["folder"]; readonly onToggle: () => void }) {
	return (
		<div className="tc-menu-group">
			<button type="button" role="menuitemcheckbox" aria-checked={folder.on} className="tc-btn tc-menu-row is-switch" disabled={folder.disabled} onClick={onToggle}>
				<span className="tc-menu-label">
					<span className="tc-menu-switch-label">{folder.label}</span>
					{folder.reason ? <span className="tc-menu-switch-reason">{folder.reason}</span> : null}
				</span>
				<span className={`tc-menu-switch${folder.on ? " is-on" : ""}`} aria-hidden="true">
					<span className="tc-menu-switch-knob" />
				</span>
			</button>
		</div>
	);
}

/** Delete project asked in its place (F219, the design's «Подтверждение»): the question, that the tasks stay, Cancel and the red Delete. */
function DeleteAsk({ menu }: { readonly menu: ProjectMenuData }) {
	const api = useScreenApi();
	const { remove } = menu;
	return (
		<div className="tc-menu-ask">
			<div className="tc-menu-ask-question is-whole">
				<span>{remove.title}</span>
			</div>
			<div className="tc-menu-ask-message">{remove.message}</div>
			<div className="tc-menu-ask-buttons">
				<button type="button" className="tc-btn is-pill is-plain tc-menu-ask-btn" onClick={() => api.getState().askDeleteProject(false)}>
					{remove.cancel}
				</button>
				<button type="button" className="tc-btn is-pill is-danger tc-menu-ask-btn" autoFocus onClick={() => api.getState().deleteProject()}>
					<Icon name="delete" />
					<span className="tc-btn-label">{remove.confirm}</span>
				</button>
			</div>
		</div>
	);
}

/**
 * The tree's panel (F206, F207, F54; boards D1, T2): «Projects» beside the folder button, the tree under it. Docked on the
 * desktop, its divider at its right edge; on the phone over the lists, the rest dimmed, a tap on the dim closing it.
 */
function TreePanel() {
	const api = useScreenApi();
	const { desk } = useHost();
	const panel = useScreen((s) => s.projects?.panel ?? null);
	const box = useRef<HTMLDivElement>(null);
	if (!panel) return null;
	return (
		<>
			{panel.docked ? null : <div className="tc-tree-dim" onClick={() => panel.dimCloses && api.getState().closePanel()} />}
			<div ref={box} className="tc-tree-panel" aria-label="Projects" aria-hidden={!panel.open}>
				<div className="tc-tree-panel-title">Projects</div>
				<div className="tc-tree-column">
					<Tree rows={panel.rows} />
				</div>
				{desk ? <TreeDivider panel={box} /> : null}
			</div>
		</>
	);
}

/** The tree's divider (F54): dragged by its line or its handle it sets the tree's width, held to the middle as the list's divider is. */
function TreeDivider({ panel }: { readonly panel: RefObject<HTMLDivElement | null> }) {
	const { haptics } = useHost();
	const drawn = () => {
		const { view, calendar: tree } = drawnWidths(panel.current?.parentElement ?? null, panel.current);
		return { view, list: tree - DESIGN.dividerWidth };
	};
	const bind = useDivider(drawn, () => haptics.tap(), 1, TREE_DIVIDER);
	const handlers = bind();
	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		event.stopPropagation();
		handlers.onPointerDown?.(event);
	};
	return (
		<div className="tc-tree-divider">
			<div className="tc-rule-strip is-divider" {...handlers} onPointerDown={onPointerDown}>
				<div className="tc-divider-line" />
				<span className="tc-divider-handle" role="separator" aria-orientation="vertical" aria-label="Resize projects" />
			</div>
		</div>
	);
}

/** A branch of the tree: its rows at one depth, an open row's own rows in a branch under it with the thin line along them. */
interface Branch {
	readonly row: TreeRow;
	readonly children: Branch[];
}

/** The rows as branches: each row under the open row before it one step shallower. */
function branchesOf(rows: readonly TreeRow[]): Branch[] {
	const top: Branch[] = [];
	const open: Branch[][] = [top];
	for (const row of rows) {
		open.length = Math.min(open.length, row.depth + 1);
		const branch: Branch = { row, children: [] };
		open[open.length - 1].push(branch);
		if (row.hasBranch && !row.folded) open.push(branch.children);
	}
	return top;
}

/** The tree (F210–F214, board TreeC, variant В): All, the projects with their branches, No project and Done, one row per row of the port's. */
function Tree({ rows }: { readonly rows: readonly TreeRow[] }) {
	return (
		<div className="tc-tree" role="tree" aria-label="Projects">
			<Branches branches={branchesOf(rows)} />
		</div>
	);
}

function Branches({ branches }: { readonly branches: readonly Branch[] }) {
	return (
		<>
			{branches.map(({ row, children }) => (
				<BranchOf key={row.node} row={row}>
					{children}
				</BranchOf>
			))}
		</>
	);
}

function BranchOf({ row, children }: { readonly row: TreeRow; readonly children: readonly Branch[] }) {
	return (
		<>
			<TreeRowView row={row} />
			{children.length > 0 ? (
				<div className="tc-tree-branch" role="group">
					<Branches branches={children} />
				</div>
			) : null}
		</>
	);
}

/** A row: a tile at the top, a line of text deeper; filled while chosen, grey with nothing open, a folded one's layer or ellipsis. */
const TreeRowView = memo(function TreeRowView({ row }: { readonly row: TreeRow }) {
	const api = useScreenApi();
	const look = `tc-tree-row ${row.tile ? "is-tile" : "is-line"} is-${row.kind}${row.selected ? " is-selected" : ""}${row.muted ? " is-muted" : ""}${row.folded ? " is-folded" : ""}`;
	return (
		<button type="button" role="treeitem" aria-selected={row.selected} aria-expanded={row.hasBranch ? !row.folded : undefined} className={`tc-btn ${look}`} data-node={row.node} onClick={() => api.getState().pickNode(row.node)}>
			<span className="tc-tree-name">{row.title}</span>
			{row.folded && !row.tile ? (
				<span className="tc-tree-more" aria-hidden="true">
					…
				</span>
			) : null}
		</button>
	);
});
