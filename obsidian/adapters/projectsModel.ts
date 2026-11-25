import type { FunnelView, ProjectMenu, ProjectsRow } from "../../core/application/contracts";
import type { ProjectMenuData, ProjectsData, TreeRow } from "../ui/engine/port";

/** Before the core's first answer: no panel row, the panel closed, no filter. */
export const NO_PROJECTS: ProjectsData = { panel: { rows: [], open: false, docked: false, dimCloses: false }, filter: null, topRow: false, context: { node: null, project: null } };

/** A row of the core's tree in the engine's words: every field the core's. */
export function treeRowOf(row: ProjectsRow): TreeRow {
	return {
		node: row.node,
		kind: row.kind,
		title: row.title,
		depth: row.depth,
		tile: row.tile,
		muted: row.muted,
		selected: row.selected,
		hasBranch: row.hasBranch,
		folded: row.folded,
		takesTask: row.acceptsTask,
		lifts: row.canLift,
		opensOnHold: row.opensOnHover,
		unfoldsOnHold: row.unfoldsOnHover,
	};
}

function menuOf(menu: ProjectMenu): ProjectMenuData {
	return {
		name: menu.project.name,
		renameLabel: menu.renameLabel,
		note: menu.note,
		attachLabel: menu.attachLabel,
		detachLabel: menu.detachLabel,
		folder: { label: menu.folder.label, on: menu.folder.on, disabled: menu.folder.disabled, reason: menu.folder.reason },
		remove: { label: menu.delete.label, title: menu.delete.title, message: menu.delete.message, confirm: menu.delete.confirm, cancel: menu.delete.cancel },
	};
}

/** The main screen's projects as the core's funnel view gives them: the panel, the filter, the top row, and the context its lists are read in. */
export function projectsDataOf(funnel: FunnelView): ProjectsData {
	const { panel, filter } = funnel;
	return {
		panel: panel ? { rows: panel.rows.map(treeRowOf), open: panel.open, docked: panel.docked, dimCloses: panel.dimCloses } : NO_PROJECTS.panel,
		filter: filter && { node: filter.node, title: filter.title, clearable: filter.clearable, menu: filter.menu && menuOf(filter.menu) },
		topRow: funnel.topRow,
		context: { node: filter?.node ?? null, project: filter?.project ?? null },
	};
}
