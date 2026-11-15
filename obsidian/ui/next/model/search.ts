import type { FoundPart, SearchGroup, SearchHit, TaskScreen } from "../../../../core/application/contracts";
import { type Answers, type Need, resultOf } from "./answers";

/**
 * The search over the block (⋯ → Search, Cmd+F; the old `SearchWindow`): the query as the field last reported it (the
 * field owns its text, P1), and the row the arrows stand on (the desktop's). `closing`: it fades out, a pick's reveal
 * waits for that.
 */
export interface SearchModel {
	readonly query: string;
	/** The row the arrows picked, among the rows in order; -1 for none. */
	readonly picked: number;
	readonly closing: boolean;
	/** The found task picked: the block goes to it once the window has gone. */
	readonly chosen: SearchHit | null;
	/** Where the core says the picked task stands (`tasks.reveal`): Done opens the full card, anything else rings its card. */
	readonly screen: TaskScreen | null;
}

/** The task the search led to: its card wears the ring until the next press anywhere, the first drawing brings it into sight. */
export interface Found {
	readonly id: string;
	/** Not yet brought into sight. */
	readonly scroll: boolean;
}

export type SearchMsg =
	| { readonly kind: "open" }
	| { readonly kind: "typed"; readonly query: string }
	/** The arrows walk the rows; Enter opens the picked one. */
	| { readonly kind: "walk"; readonly step: 1 | -1 }
	| { readonly kind: "enter" }
	/** A found row tapped (its place among the rows). */
	| { readonly kind: "pick"; readonly row: number }
	/** Cancel, Escape, a tap on the sheet. */
	| { readonly kind: "cancel" }
	/** The window's fade ended: it goes. */
	| { readonly kind: "gone" }
	/** A press anywhere: the found card lets its ring go. */
	| { readonly kind: "pressed" }
	/** The found card was brought into sight. */
	| { readonly kind: "shown" }
	/** The core unfolded the found task's tasks and said where it stands (`tasks.reveal`). */
	| { readonly kind: "revealed"; readonly screen: TaskScreen }
	/** Whether the block's filter hides the found task (`tasks.filterHides`). */
	| { readonly kind: "hides"; readonly hides: boolean };

const SEARCH = "search";

export function searchNeeds(search: SearchModel | null): readonly Need[] {
	if (!search || search.closing) return [];
	return [{ key: SEARCH, method: "tasks.search", args: [search.query] }];
}

export function searchGroups(answers: Answers): readonly SearchGroup[] {
	return resultOf<readonly SearchGroup[]>(answers, SEARCH) ?? [];
}

/** The found tasks as rows in order: what the arrows walk and a tap picks. */
export function searchHits(answers: Answers): readonly SearchHit[] {
	return searchGroups(answers).flatMap((group) => group.hits);
}

/** A found task's line under its title: its project's name where the query was found there, else its description's. */
export function snippetOf(hit: SearchHit): readonly FoundPart[] | null {
	return hit.project ?? hit.description;
}

/** Where a task stands among the projects, top project first: «Дружба › iPhone». */
const PATH_STEP = " › ";

/** A found row's path over its title, shown when the screen asks for paths (a filter is chosen): null for none. */
export function pathOf(hit: SearchHit, paths: boolean): string | null {
	return paths && hit.projectPath ? hit.projectPath.join(PATH_STEP) : null;
}


/** The row the arrows stand on: on the desktop the first once there are rows, as the old window walked to it; none on the phone. */
export function pickedRow(wide: boolean, search: SearchModel | null, answers: Answers): number {
	const hits = searchHits(answers);
	if (!wide || !search || hits.length === 0) return -1;
	return Math.min(hits.length - 1, Math.max(0, search.picked));
}
