import type { ProjectTree } from "../domain/ProjectTree";
import type { TaskDocument } from "../domain/TaskDocument";
import type { CarryEnd, CarryPoint, CarryStart, CarryState, CarryWait, PanelReason, ProjectsNodeId, ProjectsRow, ProjectsScreenState } from "./contracts";
import { chosenNode, cleared, hovered, PROJECTS_HOVER_MS, panelRows, selected, unfolded } from "./projectsScreen";
import { projectKey } from "../domain/Project";
import { projectOfNode } from "./projectsScreen";

/** Why the panel shows, the strongest first: the projects button, a carry that brought it out at the edge, a new project's name typed in it. */
export function panelReason(state: ProjectsScreenState): PanelReason | null {
	if (state.panelOpen === true) return "button";
	if (state.carry?.revealed === true) return "carry";
	if (state.naming === true) return "naming";
	return null;
}

/** A carry begins: what it carries, the screen's width, and the filter it is lifted under, which a let go nowhere puts back. */
export function carryStarted(state: ProjectsScreenState, start: CarryStart, wide: boolean, tree: ProjectTree): ProjectsScreenState {
	const carry: CarryState = { keys: start.keys, ...(start.cards && { cards: start.cards }), ...(start.plus && { plus: true }), under: chosenNode(state, tree), wide };
	return { ...state, carry };
}

function sameNode(a: ProjectsNodeId, b: ProjectsNodeId): boolean {
	const x = projectOfNode(a);
	const y = projectOfNode(b);
	return x !== null && y !== null ? projectKey(x) === projectKey(y) : a === b;
}

/** The least of two waits, none counting as none. */
function least(a: number | null, b: number | null): number | null {
	return a === null ? b : b === null ? a : Math.min(a, b);
}

/**
 * The carry's finger at `at`, `now` ms by the host's clock. A card or the plus held at a narrow screen's left edge, the
 * panel not showing, brings it out once it has waited `PROJECTS_HOVER_MS` there; held over a row of the showing panel
 * as long, the row's branch unfolds and (a card, not the plus) a live project opens (`hovered`). `wait`: how long until
 * the finger, staying, should be told again; none when nothing waits.
 */
export function carriedAt(state: ProjectsScreenState, at: CarryPoint, now: number, tree: ProjectTree, doc: TaskDocument | null): { readonly state: ProjectsScreenState; readonly wait: number | null } {
	const carry = state.carry;
	if (!carry) return { state, wait: null };
	let next: ProjectsScreenState = state;
	let wait: number | null = null;
	let edgeSince: number | undefined;
	let revealed = carry.revealed === true;
	const carries = carry.keys.length > 0 || carry.plus === true;
	if (at.edge && !carry.wide && carries && panelReason(state) === null) {
		const since = carry.edgeSince ?? now;
		if (now - since >= PROJECTS_HOVER_MS) revealed = true;
		else {
			edgeSince = since;
			wait = PROJECTS_HOVER_MS - (now - since);
		}
	}
	next = { ...next, carry: { ...withoutTimes(carry), ...(revealed && { revealed: true }), ...(edgeSince !== undefined && { edgeSince }) } };
	const shows = panelReason(next) !== null;
	if (at.node === null || !shows) return { state: next, wait };
	const rows: readonly ProjectsRow[] = panelRows(tree, doc, next);
	const row = rows.find((r) => sameNode(r.node, at.node!));
	const acts = row !== undefined && (row.unfoldsOnHover || (carry.plus !== true && row.opensOnHover));
	const over = carry.over && sameNode(carry.over.node, at.node) ? carry.over : { node: at.node, since: now, done: false };
	if (!over.done && acts) {
		if (now - over.since >= PROJECTS_HOVER_MS) {
			const moved = carry.plus === true ? unfolded(next, row!.node) : hovered(next, tree, doc, rows, row!.node);
			return { state: { ...moved, carry: { ...moved.carry!, over: { ...over, done: true } } }, wait };
		}
		wait = least(wait, PROJECTS_HOVER_MS - (now - over.since));
	}
	return { state: { ...next, carry: { ...next.carry!, over } }, wait };
}

function withoutTimes(carry: CarryState): CarryState {
	const { edgeSince: _edge, over: _over, revealed: _revealed, ...rest } = carry;
	return rest;
}

/**
 * The carry ends: let go `nowhere` (or cancelled) puts back the filter it was lifted under, none included; `dropped`
 * (in a list, on a row) keeps the screen; `naming`, the plus let go in the tree, keeps the panel out while the new
 * project's name is typed (`endProjectName`). A panel the carry brought out goes.
 */
export function carryEnded(state: ProjectsScreenState, how: CarryEnd, tree: ProjectTree, doc: TaskDocument | null): ProjectsScreenState {
	const carry = state.carry;
	const { carry: _gone, ...rest } = state;
	let next: ProjectsScreenState = how === "naming" ? { ...rest, naming: true } : rest;
	if (!carry || how !== "nowhere") return next;
	const now = chosenNode(next, tree);
	if (carry.under === null) return now === null ? next : cleared(next);
	if (now !== null && sameNode(now, carry.under)) return next;
	next = selected(next, tree, doc, carry.under);
	return next;
}

/** The new project's name typed or given up: the panel it held out goes. */
export function nameEnded(state: ProjectsScreenState): ProjectsScreenState {
	if (state.naming !== true) return state;
	const { naming: _gone, ...rest } = state;
	return rest;
}

export type { CarryWait };
